import { and, eq, or, sql } from "drizzle-orm";
import { record, stringId } from "../src/domain/purchase";
import { externalPackageRef, interpretPackageDetail } from "../src/domain/fulfillment-sync";
import type { Database } from "./db/client";
import { packages, procurementItems, procurementOrders, procurementRemote, purchaseQuotes, procurementItemPackages as links } from "./db/schema";
import { AppError } from "./errors";
import { allocateNumber } from "./numbering";
import { trackProcurement } from "./procurement-tracking";
import { listFulfillmentPackages, readFulfillmentPackage } from "./services/hiobuy/fulfillment";
import { syncProcurementReceipts } from "./procurement-receipts";
import { callProcurement, requireProcurementResult } from "./services/hiobuy/procurement";

function conflict(message: string): never { throw new AppError("PURCHASE_PACKAGE_REVIEW", message, 409); }
async function stableId(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes.slice(0, 16), n => n.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function checkDeadline(deadline?: number) {
  if (deadline !== undefined && Date.now() >= deadline) throw new AppError("PURCHASE_SYNC_DEADLINE", "Package sync will continue in a later polling round.", 503);
}
async function findRemote(token: string, tracking: string, deadline?: number) {
  const matches = new Map<string, Record<string, unknown>>();
  for (let page = 1; page <= 30; page++) {
    checkDeadline(deadline);
    const response = await listFulfillmentPackages(token, page, 100, tracking);
    checkDeadline(deadline);
    const root = record(response.payload), pagination = record(root.pagination);
    if (response.status !== 200 || !Array.isArray(root.data)) conflict(`Could not query fulfillment for ${tracking}. Refresh to retry.`);
    for (const value of root.data as unknown[]) {
      const row = record(value), id = stringId(row.id ?? row.package_id);
      // The upstream filter is only a search aid; identity must still match exactly.
      if (row.tracking_number === tracking && id) matches.set(id, row);
    }
    if (matches.size > 1) conflict(`Multiple fulfillment packages match ${tracking}. Review the association.`);
    const totalPages = Number(pagination.total_pages);
    if (!Number.isSafeInteger(totalPages) || totalPages < 0) conflict("Fulfillment pagination is invalid. Nothing was linked.");
    if (page >= totalPages) {
      if (!matches.size) conflict(`No fulfillment package found for ${tracking}. Refresh after HioBuy creates it.`);
      return [...matches.values()][0];
    }
  }
  return conflict("Too many fulfillment search pages. Review the package before linking.");
}

/** Query-only upstream integration. Never creates an inbound notice or makes a payment. */
export async function syncPurchaseFulfillment(db: Database, token: string, actor: { id: string; email: string }, orderId: string, remoteOrder: Record<string, unknown>, deadline?: number) {
  const parcels = remoteOrder.domestic_parcels;
  if (parcels == null) return;
  if (!Array.isArray(parcels) || parcels.length > 100) conflict("Invalid procurement parcel details.");
  const order = (await db.select().from(procurementOrders).where(eq(procurementOrders.id, orderId)))[0];
  if (!order || order.status !== "draft") return;
  const items = await db.select().from(procurementItems).where(eq(procurementItems.orderId, orderId));
  const upstreamSkus = new Map<string, string>();
  for (const item of items) {
    const snapshot = record(JSON.parse(item.productSnapshot ?? "{}"));
    const sku = stringId(order.orderType === "manual" ? snapshot.manualSubOrderId : snapshot.upstreamSkuId);
    if (sku) upstreamSkus.set(item.id, sku);
  }
  // 1688 parcel lines use upstream_sku_id, while the submitted spec_id is variants[].sku_id.
  // Resolve that mapping against the original quote's product identity, never by item position alone.
  let resolvedSkus = false;
  async function resolveSkus() {
    if (resolvedSkus) return;
    resolvedSkus = true;
    const [source] = await db.select({ request: purchaseQuotes.request, channel: procurementRemote.channel }).from(procurementRemote)
      .innerJoin(purchaseQuotes, eq(purchaseQuotes.id, procurementRemote.quoteId)).where(eq(procurementRemote.orderId, orderId));
    if (!source) return;
    const request = record(JSON.parse(source.request)), lines = request.lines;
    if (!Array.isArray(lines)) return;
    const products = new Map<string, Record<string, unknown>>();
    for (const item of items) {
      if (upstreamSkus.has(item.id)) continue;
      const line = record(lines[item.position]), productId = stringId(line.id);
      if (!productId || line.spec_id !== item.sku) continue;
      let product = products.get(productId);
      if (!product) {
        checkDeadline(deadline);
        product = record(requireProcurementResult(await callProcurement(token, "detail", { channel: source.channel, id: productId })).product);
        checkDeadline(deadline);
        if (stringId(product.id) !== productId || product.channel !== source.channel) conflict("Product identity changed while resolving parcel SKUs.");
        products.set(productId, product);
      }
      const variants = Array.isArray(product.variants) ? product.variants.map(record).filter(v => stringId(v.sku_id) === item.sku) : [];
      const sku = variants.length === 1 ? stringId(variants[0].upstream_sku_id) : null;
      if (!sku) continue;
      upstreamSkus.set(item.id, sku);
      const snapshot = record(JSON.parse(item.productSnapshot ?? "{}"));
      await db.update(procurementItems).set({ productSnapshot: JSON.stringify({ ...snapshot, upstreamSkuId: sku }) })
        .where(and(eq(procurementItems.id, item.id), item.productSnapshot === null ? sql`${procurementItems.productSnapshot} IS NULL` : eq(procurementItems.productSnapshot, item.productSnapshot)));
    }
  }
  const seen = new Set<string>();
  for (const raw of parcels) {
    checkDeadline(deadline);
    const parcel = record(raw), tracking = typeof parcel.tracking_number === "string" ? parcel.tracking_number.trim() : "";
    if (!tracking) continue;
    if (seen.has(tracking)) conflict(`Duplicate parcel ${tracking} in the purchase response.`);
    seen.add(tracking);
    if (!Array.isArray(parcel.lines) || !parcel.lines.length) conflict(`Missing item quantities for ${tracking}. Link this package manually.`);
    const allocations = new Map<string, number>();
    for (const rawLine of parcel.lines) {
      const line = record(rawLine), sku = stringId(line.sku), quantity = line.quantity;
      if (sku && !items.some(item => item.sku === sku || upstreamSkus.get(item.id) === sku)) await resolveSkus();
      const candidates = items.filter(item => item.sku === sku || upstreamSkus.get(item.id) === sku);
      if (!sku || candidates.length !== 1 || !Number.isSafeInteger(quantity) || Number(quantity) <= 0) conflict(`Ambiguous SKU or quantity for ${tracking}. Link this package manually.`);
      const item = candidates[0], total = (allocations.get(item.id) ?? 0) + Number(quantity);
      if (total > item.quantity) conflict(`Parcel quantities exceed the ordered quantity for ${tracking}.`);
      allocations.set(item.id, total);
    }
    let pkg = (await db.select().from(packages).where(eq(packages.domesticTrackingNumber, tracking)))[0];
    if (pkg && pkg.userId !== order.customerId) conflict(`Package ${tracking} belongs to another customer.`);
    const remote = pkg?.hiobuyPackageId ? { id: pkg.hiobuyPackageId } : await findRemote(token, tracking, deadline);
    const remoteId = stringId(remote.id ?? remote.package_id)!;
    const response = await readFulfillmentPackage(token, remoteId);
    checkDeadline(deadline);
    const detail = interpretPackageDetail({ timedOut: response.timedOut, httpStatus: response.status, payload: response.payload });
    const root = record(response.payload), data = record(root.data ?? root);
    if (detail.kind !== "ok" || detail.package.id !== remoteId || data.tracking_number !== tracking) conflict(`Fulfillment detail does not match ${tracking}. Nothing was linked.`);
    const pkgId = pkg?.id ?? await stableId(`hiobuy-package:${remoteId}`);
    if (detail.package.externalOrderId && detail.package.externalOrderId !== externalPackageRef(pkgId)) conflict(`Fulfillment package ${tracking} belongs to another reference.`);
    const duplicate = (await db.select().from(packages).where(eq(packages.hiobuyPackageId, remoteId)))[0];
    if (duplicate && (duplicate.id !== pkgId || duplicate.userId !== order.customerId)) conflict(`Fulfillment package ${tracking} is already linked elsewhere.`);
    if (!pkg) {
      const now = Date.now();
      await db.insert(packages).values({ id: pkgId, userId: order.customerId, publicId: await allocateNumber(db, "package"), domesticTrackingNumber: tracking,
        courier: typeof parcel.logistics_company === "string" ? parcel.logistics_company : "", packageStatus: "PENDING", conditionStatus: "NORMAL",
        exceptionStatus: "NONE", vasStatus: "NONE", lockStatus: "AVAILABLE", disposition: "NONE", hiobuyPackageId: remoteId, createdAt: now, updatedAt: now,
      }).onConflictDoNothing();
      pkg = (await db.select().from(packages).where(eq(packages.domesticTrackingNumber, tracking)))[0];
    } else if (!pkg.hiobuyPackageId) {
      await db.update(packages).set({ hiobuyPackageId: remoteId, updatedAt: Date.now() }).where(and(eq(packages.id, pkg.id), eq(packages.userId, order.customerId), sql`${packages.hiobuyPackageId} IS NULL`));
      pkg = (await db.select().from(packages).where(eq(packages.id, pkg.id)))[0];
    }
    if (!pkg || pkg.userId !== order.customerId || pkg.hiobuyPackageId !== remoteId) conflict(`Package ${tracking} changed during linking. Refresh to retry.`);
    for (const [itemId, quantity] of allocations) {
      const id = await stableId(`purchase-fulfillment:${orderId}:${itemId}:${pkg.id}`);
      let link = (await db.select().from(links).where(or(eq(links.id, id), and(eq(links.itemId, itemId), eq(links.packageId, pkg.id), eq(links.active, true)))))[0];
      if (!link) {
        const fresh = (await db.select().from(procurementOrders).where(eq(procurementOrders.id, orderId)))[0];
        await trackProcurement(db, actor, orderId, { id, action: "link", orderVersion: fresh.version, itemId, packageId: pkg.id, quantity, note: "Linked from HioBuy procurement parcel" });
        link = (await db.select().from(links).where(eq(links.id, id)))[0];
      }
      if (!link.active || link.allocatedQuantity !== quantity) conflict(`Package allocation for ${tracking} was changed. Review it manually.`);
      // A manual link/correction remains manual, including after an interrupted retry.
      if (link.id === id) await db.update(links).set({ receiptSource: "fulfillment" }).where(and(eq(links.id, id), eq(links.active, true), sql`NOT EXISTS (SELECT 1 FROM procurement_tracking_events WHERE link_id=${id} AND action='arrival')`));
    }
    const { applyPurchasePackageSnapshot } = await import("./fulfillment-sync");
    const outcome = await applyPurchasePackageSnapshot(db, pkg, response);
    if (outcome.outcome === "failed" || outcome.outcome === "needs_review") conflict(outcome.message);
    await syncProcurementReceipts(db, pkg.id);
  }
}
