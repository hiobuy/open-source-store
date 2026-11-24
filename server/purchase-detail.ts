import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "./db/client";
import { packages, payments, procurementBills, procurementItemPackages, procurementRemote, purchaseStripePayments, shipmentPackages, shipments, walletTransactions } from "./db/schema";
import { record } from "../src/domain/purchase";
import { domesticPurchaseTracking } from "./purchase-logistics";
import { warehousePackagePhotos } from "./photos";

function json(value: string | null) { try { return record(JSON.parse(value ?? "{}")); } catch { return {}; } }
const amount = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

/** Only customer sale amounts are projected; raw cost/rule snapshots never leave this module. */
export function purchaseItemPrice(item: { id: string; position: number; quantity: number }, bill?: { currency: string; snapshot: string }) {
  const empty = { currency: bill?.currency ?? null, unitPriceCents: null as number | null, subtotalCents: null as number | null, referencePrice: { currency: "CNY" as const, unitPriceCents: null as number | null, subtotalCents: null as number | null } };
  const snapshot = json(bill?.snapshot ?? null);
  const matches = Array.isArray(snapshot.lines) ? snapshot.lines.map(record).filter(line => line.itemId === item.id || line.itemId === String(item.position)) : [];
  if (matches.length !== 1 || matches[0].quantity !== item.quantity || item.quantity < 1) return empty;
  const line = matches[0];
  return { ...empty,
    unitPriceCents: amount(line.goodsCents) ? Math.round(line.goodsCents / item.quantity) : null,
    subtotalCents: amount(line.goodsCents) ? line.goodsCents : null,
    referencePrice: { currency: "CNY" as const, unitPriceCents: amount(line.sellingUnitCnyCents) ? line.sellingUnitCnyCents : null, subtotalCents: amount(line.sellingUnitCnyCents) ? line.sellingUnitCnyCents * item.quantity : null },
  };
}

export async function purchaseBillPresentation(db: Database, userId: string, orderId: string) {
  const [bills, wallet, card] = await Promise.all([
    db.select().from(procurementBills).where(and(eq(procurementBills.orderId, orderId), eq(procurementBills.customerId, userId))),
    db.select().from(walletTransactions).where(and(eq(walletTransactions.userId, userId), eq(walletTransactions.referenceType, "procurement"), eq(walletTransactions.referenceId, orderId), eq(walletTransactions.type, "PURCHASE_PAYMENT"))),
    db.select({ billId: purchaseStripePayments.billId, id: payments.id, method: payments.method, amountCents: payments.amountFen, currency: payments.currency, status: payments.status, paidAt: payments.paidAt }).from(purchaseStripePayments).innerJoin(payments, eq(payments.id, purchaseStripePayments.id)).where(and(eq(purchaseStripePayments.orderId, orderId), eq(purchaseStripePayments.userId, userId), eq(payments.userId, userId), eq(payments.purpose, "purchase"))),
  ]);
  return bills.map(bill => {
    const history = [
      ...wallet.filter(row => row.id === `purchase:${bill.id}` || row.id.startsWith(`purchase:${bill.id}:v`)).map(row => ({ id: row.id, method: "wallet", amountCents: -row.amountFen, currency: row.currency, status: "paid", paidAt: row.createdAt })),
      ...card.filter(row => row.billId === bill.id && row.paidAt !== null).map(({ billId: _, ...row }) => row),
    ].sort((a, b) => (a.paidAt ?? 0) - (b.paidAt ?? 0) || a.id.localeCompare(b.id));
    const methods = [...new Set(history.map(row => row.method))];
    return { ...bill, paymentMethod: methods.length > 1 ? "mixed" : methods[0] ?? null, paymentMethods: methods, paymentHistory: history };
  });
}

type TrackingEnv = { HIOBUY_API_TOKEN?: string; BETTER_AUTH_SECRET?: string };
export async function purchaseLogistics(db: Database, userId: string, orderId: string, env?: TrackingEnv) {
  const links = await db.select({ itemId: procurementItemPackages.itemId, quantity: procurementItemPackages.allocatedQuantity, receivedQuantity: procurementItemPackages.receivedQuantity, pkg: packages }).from(procurementItemPackages).innerJoin(packages, eq(packages.id, procurementItemPackages.packageId))
    .where(and(eq(procurementItemPackages.orderId, orderId), eq(procurementItemPackages.active, true), eq(packages.userId, userId))).orderBy(asc(procurementItemPackages.createdAt));
  const unique = [...new Map(links.map(link => [link.pkg.id, link.pkg])).values()];
  const photos = env && unique.length ? await warehousePackagePhotos(db, userId,
    db.select({ id: procurementItemPackages.packageId }).from(procurementItemPackages)
      .where(and(eq(procurementItemPackages.orderId, orderId), eq(procurementItemPackages.active, true))),
  ) : null;
  const { packageActivity } = await import("./data");
  const domesticParcels = await Promise.all(unique.map(async pkg => ({
    packageId: pkg.id as string | null, publicId: pkg.publicId as string | null, trackingNumber: pkg.domesticTrackingNumber, carrier: pkg.courier || null, status: pkg.packageStatus as string | null,
    items: links.filter(link => link.pkg.id === pkg.id).map(({ itemId, quantity, receivedQuantity }) => ({ itemId, quantity, receivedQuantity })),
    // Warehouse business events are not carrier tracking scans.
    warehouseEvents: await packageActivity(db, pkg.id, "customer", pkg.receivedAt ? [{ at: new Date(pkg.receivedAt).toISOString(), title: "Received at the warehouse", detail: "The parcel is in the warehouse." }] : []),
  })));
  const remote = (await db.select({ result: procurementRemote.lastResult }).from(procurementRemote).where(eq(procurementRemote.orderId, orderId)))[0];
  const parcels = record(json(remote?.result ?? null).order).domestic_parcels;
  // A procurement parcel can be known before its warehouse association is ready.
  if (Array.isArray(parcels)) for (const raw of parcels) {
    const parcel = record(raw), tracking = typeof parcel.tracking_number === "string" ? parcel.tracking_number.trim() : "";
    if (tracking && !domesticParcels.some(p => p.trackingNumber === tracking)) domesticParcels.push({ packageId: null, publicId: null, trackingNumber: tracking, carrier: null, status: null, items: [], warehouseEvents: [] });
  }
  const shipmentRows = unique.length ? await db.select({ shipment: shipments, packageId: shipmentPackages.packageId }).from(shipmentPackages).innerJoin(shipments, eq(shipments.id, shipmentPackages.shipmentId)).where(and(inArray(shipmentPackages.packageId, unique.map(pkg => pkg.id)), eq(shipments.userId, userId))) : [];
  const internationalShipments = await Promise.all([...new Map(shipmentRows.map(row => [row.shipment.id, row.shipment])).values()].map(async shipment => {
    const base = { shipmentId: shipment.id, publicId: shipment.publicId, packageIds: [...new Set(shipmentRows.filter(row => row.shipment.id === shipment.id).map(row => row.packageId))], status: shipment.status, trackingNumber: shipment.trackingNumber, carrier: null as string | null, events: [] as { at: string; title: string; location: string }[], trackingStatus: "not_loaded" };
    if (!env) return base;
    try {
      const { carrierTracking } = await import("./fulfillment-sync");
      const track = await carrierTracking(db, env, shipment.id, userId);
      return { ...base, trackingNumber: track.trackingNumber ?? base.trackingNumber, carrier: track.carrier, events: track.events, trackingStatus: track.events.length ? "available" : "unavailable" };
    } catch { return { ...base, trackingStatus: "unavailable" }; }
  }));
  const domestic = env ? await domesticPurchaseTracking(db, userId, orderId, env) : null;
  // Exact tracking-number matching, never copy one parcel's scans onto another.
  if (domestic) for (const parcel of domestic.packages) {
    if (parcel.trackingNumber && !domesticParcels.some(p => p.trackingNumber === parcel.trackingNumber)) domesticParcels.push({ packageId: null, publicId: null, trackingNumber: parcel.trackingNumber, carrier: parcel.carrier, status: null, items: [], warehouseEvents: [] });
  }
  return { domesticParcels: domesticParcels.map(parcel => {
    const trace = domestic?.packages.find(p => p.trackingNumber === parcel.trackingNumber);
    return { ...parcel, ...(env ? { photos: parcel.packageId && photos ? photos.get(parcel.packageId) ?? [] : [] } : {}),
      carrier: trace?.carrier ?? parcel.carrier, statusLabel: trace?.statusLabel ?? null, events: trace?.events ?? [], trackingStatus: trace?.trackingStatus ?? (domestic ? domestic.trackingStatus === "available" ? "empty" : domestic.trackingStatus : "not_loaded") };
  }), internationalShipments };
}
