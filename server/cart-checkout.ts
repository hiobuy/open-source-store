import { mapLimited } from "./batch-utils";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { cartCheckoutInput, cartPreviewInput } from "../src/domain/shopping";
import { customerPurchaseQuote } from "../src/domain/purchase";
import { manualPurchaseInput, type ManualPurchaseInput } from "../src/domain/manual-purchase";
import type { CartShop } from "../src/domain/cart-display";
import type { Database } from "./db/client";
import { cartItems, cartPreviews, cartPreviewGroups, cartCheckouts, procurementOrders, marketingCoupons, purchaseCouponRedemptions } from "./db/schema";
import { unavailableCoupon } from "./purchase-coupons";
import { cartProduct } from "./purchase-products";
import { previewPurchase, preparePurchaseCreation } from "./purchase";
import { quoteManualPurchase, prepareManualCreation } from "./manual-purchase";
import { parseInput } from "./operations-input";
import { AppError } from "./errors";

type Selection = z.infer<typeof cartPreviewInput>["items"];
type Row = typeof cartItems.$inferSelect;
type Quote = ReturnType<typeof customerPurchaseQuote>;
type Group = {
  key: string; type: "standard" | "manual"; platform: string; shop: CartShop;
  items: Selection; orderId: string; quoteId?: string; quote: Quote; estimated: boolean;
  manual?: { form: ManualPurchaseInput; pricing: Awaited<ReturnType<typeof quoteManualPurchase>> };
};
const changed = (): never => { throw new AppError("CART_CHANGED", "Cart entries changed or were submitted. Request a new preview.", 409); };
const identity = (item: { type: string; id: string }) => `${item.type}:${item.id}`;

async function checkCouponCapacity(db: Database, groups: Group[]) {
  const codes = groups.flatMap(g => g.quote.couponCode ? [g.quote.couponCode] : []);
  for (const code of new Set(codes)) {
    const [coupon] = await db.select().from(marketingCoupons).where(eq(marketingCoupons.code, code));
    if (!coupon) throw unavailableCoupon();
    const [usage] = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(purchaseCouponRedemptions).where(and(eq(purchaseCouponRedemptions.couponId, coupon.id), sql`${purchaseCouponRedemptions.state} != 'released'`));
    if (usage.count + codes.filter(c => c === code).length > coupon.usageLimit) throw unavailableCoupon();
  }
}

async function selectedRows(db: Database, customerId: string, items: Selection) {
  const found = await db.select().from(cartItems).where(and(eq(cartItems.customerId, customerId), inArray(cartItems.id, items.map(i => i.id))));
  return items.map(item => {
    const row = found.find(row => identity(row) === identity(item));
    if (!row) throw new AppError("NOT_FOUND", "Cart item not found.", 404);
    if (row.state !== "draft" || row.version !== item.version) changed();
    return row;
  });
}


function summary(groups: Group[]) {
  const currency = groups[0].quote.currency;
  if (groups.some(g => g.quote.currency !== currency)) throw new AppError("PRICING_CHANGED", "Pricing currency changed. Request a new preview.", 409);
  const keys = ["goodsCents", "serviceCents", "shippingCents", "discountCents", "totalCents"] as const;
  const sum = (reference: boolean) => Object.fromEntries(keys.map(key => {
    const amount = groups.reduce((n, g) => n + (reference ? g.quote.referencePrice[key] : g.quote[key]), 0);
    if (!Number.isSafeInteger(amount) || amount > 999_999_999) throw new AppError("VALIDATION_ERROR", "Cart total is too large.");
    return [key, amount];
  })) as Record<typeof keys[number], number>;
  return { currency, ...sum(false), referencePrice: { currency: "CNY" as const, displayOnly: true as const, ...sum(true) }, orderCount: groups.length };
}

/** A preview does not mutate the cart or create any orders. */
export async function previewCart(db: Database, token: string | (() => Promise<string>), customerId: string, raw: unknown) {
  const input = parseInput(cartPreviewInput, raw);
  const selection = [...input.items].sort((a, b) => identity(a).localeCompare(identity(b)));
  const rows = await selectedRows(db, customerId, selection);
  const standard = rows.filter(row => row.type === "standard");
  if (input.couponCode && !standard.length) throw new AppError("COUPON_UNAVAILABLE", "Coupons apply only to standard purchase orders.", 409);
  const access = standard.length ? typeof token === "string" ? token : await token() : "";
  const products = new Map<string, Awaited<ReturnType<typeof cartProduct>>>();
  const productKey = (row: Row) => JSON.stringify([row.channel, row.productId]);
  await mapLimited([...new Map(standard.map(row => [productKey(row), row])).values()], async row => {
    products.set(productKey(row), await cartProduct(access, row.channel, row.productId));
  });
  const partitions = new Map<string, { rows: Row[]; shop: CartShop }>();
  for (const row of rows) {
    const shop = row.type === "standard" ? products.get(productKey(row))!._cartDisplay.shop : { id: null, name: parseInput(manualPurchaseInput, JSON.parse(row.payload)).sellerName, url: null };
    // No verified seller identity: keep each manual form / ordinary product separate.
    const key = JSON.stringify([row.channel, row.type, shop.id ? "shop" : "item", shop.id ?? (row.type === "manual" ? row.id : row.productId)]);
    const partition = partitions.get(key) ?? { rows: [], shop };
    partition.rows.push(row); partitions.set(key, partition);
  }
  let expiresAt = Date.now() + 8 * 60_000;
  const groups = await mapLimited([...partitions], async ([key, partition]): Promise<Group> => {
    const first = partition.rows[0], items = partition.rows.map(({ id, type, version }) => ({ id, type, version }));
    const base = { key, type: first.type, platform: first.channel, shop: partition.shop, items, orderId: first.type === "manual" ? first.orderId! : crypto.randomUUID() };
    try {
      if (first.type === "manual") {
        const form = parseInput(manualPurchaseInput, JSON.parse(first.payload));
        const pricing = await quoteManualPurchase(db, form);
        return { ...base, estimated: true, quote: customerPurchaseQuote(pricing), manual: { form, pricing } };
      }
      const { id, expiresAt: expiry, ...quote } = await previewPurchase(db, access, customerId, {
        couponCode: input.couponCode, channel: first.channel,
        lines: partition.rows.map(row => ({ id: row.productId, spec_id: row.skuId, quantity: row.quantity })),
      }, partition.rows.map(row => products.get(productKey(row))!));
      expiresAt = Math.min(expiresAt, expiry);
      return { ...base, quoteId: id, quote, estimated: false };
    } catch (error) {
      if (error instanceof AppError) throw new AppError(error.code, error.message, error.status, { groupKey: key, items });
      throw error;
    }
  });
  const totals = summary(groups);
  await checkCouponCapacity(db, groups);
  // Detect changes during network calls, not only before them.
  await selectedRows(db, customerId, selection);
  if (expiresAt <= Date.now()) throw new AppError("CART_PREVIEW_EXPIRED", "Request a new cart preview.", 409);
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(cartPreviews).values({ id, customerId, selection: JSON.stringify(selection), createdAt: Date.now(), expiresAt }),
    ...groups.map((group, position) => db.insert(cartPreviewGroups).values({ id: crypto.randomUUID(), previewId: id, position, payload: JSON.stringify(group) })),
  ]);
  return { id, expiresAt, ...totals, groups: groups.map(({ manual: _manual, orderId: _orderId, quoteId: _quoteId, ...group }) => group) };
}

type CheckoutResult = { id: string; previewId: string; currency: string; totalCents: number; orders: { id: string; key: string; type: string; platform: string }[] };
export async function readCartCheckout(db: Database, customerId: string, id: string): Promise<CheckoutResult> {
  parseInput(z.string().uuid(), id);
  const [row] = await db.select().from(cartCheckouts).where(and(eq(cartCheckouts.id, id), eq(cartCheckouts.customerId, customerId)));
  if (!row) throw new AppError("NOT_FOUND", "Cart checkout not found.", 404);
  return JSON.parse(row.result);
}

export async function checkoutCart(db: Database, actor: { id: string; email: string }, raw: unknown): Promise<CheckoutResult> {
  const input = parseInput(cartCheckoutInput, raw);
  const replay = async () => {
    const [existing] = await db.select().from(cartCheckouts).where(eq(cartCheckouts.id, input.id));
    if (!existing) return null;
    if (existing.customerId !== actor.id || existing.previewId !== input.previewId) throw new AppError("CART_CHECKOUT_CONFLICT", "Checkout id belongs to a different request.", 409);
    return JSON.parse(existing.result) as CheckoutResult;
  };
  const previous = await replay(); if (previous) return previous;
  try {
  const [preview] = await db.select().from(cartPreviews).where(and(eq(cartPreviews.id, input.previewId), eq(cartPreviews.customerId, actor.id)));
  if (!preview) throw new AppError("NOT_FOUND", "Cart preview not found.", 404);
  if ((await db.select().from(cartCheckouts).where(eq(cartCheckouts.previewId, preview.id))).length) throw new AppError("CART_CHECKOUT_CONFLICT", "Preview already checked out. Retry with the original checkout id.", 409);
  if (preview.expiresAt <= Date.now()) throw new AppError("CART_PREVIEW_EXPIRED", "Request a new cart preview.", 409);
  const selection = JSON.parse(preview.selection) as Selection;
  const groups = (await db.select().from(cartPreviewGroups).where(eq(cartPreviewGroups.previewId, preview.id)).orderBy(cartPreviewGroups.position)).map(row => JSON.parse(row.payload) as Group);
  await selectedRows(db, actor.id, selection);
  await checkCouponCapacity(db, groups);
  const writes = [] as (Awaited<ReturnType<typeof preparePurchaseCreation>>["statements"][number] | Awaited<ReturnType<typeof prepareManualCreation>>[number])[];
  for (const group of groups) {
    if (group.manual) writes.push(...await prepareManualCreation(db, actor, { ...group.manual.form, id: group.orderId }, group.manual.pricing));
    else writes.push(...(await preparePurchaseCreation(db, actor, actor.id, { id: group.orderId, quoteId: group.quoteId })).statements);
  }
  const totals = summary(groups);
  const result: CheckoutResult = { id: input.id, previewId: preview.id, currency: totals.currency, totalCents: totals.totalCents, orders: groups.map(g => ({ id: g.orderId, key: g.key, type: g.type, platform: g.platform })) };
  const now = Date.now();
  // NOT NULL + unique constraints turn a stale cart or duplicate preview into a full rollback.
  const validPreview = sql`(SELECT p.id FROM cart_previews p WHERE p.id=${preview.id} AND p.customer_id=${actor.id} AND p.expires_at>${now}
    AND (SELECT COUNT(*) FROM cart_items c JOIN json_each(${preview.selection}) j
      ON c.id=json_extract(j.value,'$.id') AND c.type=json_extract(j.value,'$.type') AND c.version=json_extract(j.value,'$.version')
      WHERE c.customer_id=${actor.id} AND c.state='draft')=${selection.length})`;
  try {
    await db.batch([
      db.insert(cartCheckouts).values({ id: input.id, previewId: validPreview, customerId: actor.id, result: JSON.stringify(result), createdAt: now }),
      ...writes,
      ...selection.map(item => item.type === "standard"
        ? db.delete(cartItems).where(and(eq(cartItems.customerId, actor.id), eq(cartItems.id, item.id), eq(cartItems.type, item.type), eq(cartItems.version, item.version)))
        : db.update(cartItems).set({ state: "submitted", updatedAt: now }).where(and(eq(cartItems.customerId, actor.id), eq(cartItems.id, item.id), eq(cartItems.type, item.type), eq(cartItems.version, item.version)))),
    ]);
  } catch (error) {
    const committed = await replay(); if (committed) return committed;
    if ((await db.select().from(cartCheckouts).where(eq(cartCheckouts.previewId, preview.id))).length) throw new AppError("CART_CHECKOUT_CONFLICT", "Preview already checked out. Retry with the original checkout id.", 409);
    await selectedRows(db, actor.id, selection);
    if (preview.expiresAt <= Date.now()) throw new AppError("CART_PREVIEW_EXPIRED", "Request a new cart preview.", 409);
    if ((await db.select({ id: procurementOrders.id }).from(procurementOrders).where(inArray(procurementOrders.id, groups.map(g => g.orderId)))).length) changed();
    await checkCouponCapacity(db, groups);
    throw error;
  }
  return result;
  } catch (error) {
    // Another request may finish while we are checking versions or preparing writes.
    const committed = await replay(); if (committed) return committed;
    throw error;
  }
}
