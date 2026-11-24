import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { createDb, type Database } from "./db/client";
import { cartItems, cartPreviews, cartCheckouts, procurementOrders, procurementItems, procurementBills, productPricing, user, warehouseLocations, marketingCoupons, purchaseCouponRedemptions } from "./db/schema";
import { previewCart, checkoutCart, readCartCheckout } from "./cart-checkout";
import { addManualCart, checkoutManualCart } from "./manual-cart";
import { countCart } from "./shopping";
import { saveExchangeRate } from "./exchange-rates";
import { saveProductPolicy } from "./product-billing";
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("cloudflare:sockets", () => ({ connect: vi.fn() }));

let mf: Miniflare, db: Database, actor: { id: string; email: string };
const money = (amount: number) => ({ currency: "CNY", amount });
const selection = (row: { id: string; type: "standard" | "manual"; version: number }) => ({ id: row.id, type: row.type, version: row.version });
function remote(stock = 999) {
  const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname, body = JSON.parse(String(init?.body));
    if (path.endsWith("/products/detail")) return Response.json({ product: { id: body.id, channel: body.channel, title: "Product", seller: body.id.startsWith("unknown") ? undefined : { id: body.id.split(":")[0], name: "Same name" }, variants: [{ sku_id: "sku", stock }], images: [] } });
    if (path.endsWith("/orders/preview")) {
      const groups = new Map<string, { offer_id: string; spec_id: string; quantity: number; unit_price: ReturnType<typeof money>; line_total: ReturnType<typeof money> }[]>();
      let merchandise = 0;
      for (const line of body.lines) {
        const key = line.id.split(":")[0];
        const list = groups.get(key) ?? [];
        list.push({ offer_id: line.id, spec_id: line.spec_id, quantity: line.quantity, unit_price: money(100), line_total: money(100 * line.quantity) });
        merchandise += 100 * line.quantity; groups.set(key, list);
      }
      return Response.json({ success: true, channel: body.channel, preview_id: "weidian-preview", monetary_unit: "CNY_minor", unavailable_lines: [], sellers: [...groups].map(([seller_id, lines]) => ({ seller_id, lines })), total: { merchandise: money(merchandise), shipping: money(30), payment: money(merchandise + 30) } });
    }
    throw new Error(`Unexpected upstream write: ${path}`);
  });
  vi.stubGlobal("fetch", fetcher); return fetcher;
}
async function standard(productId = "a:1", channel = "1688", id = crypto.randomUUID()) {
  const row = { id, type: "standard" as const, customerId: actor.id, productId, channel, skuId: "sku", quantity: 2, version: 1, product: "{}", createdAt: Date.now(), updatedAt: Date.now() };
  await db.insert(cartItems).values(row); return selection(row);
}
async function manual(id = crypto.randomUUID()) {
  const form = { id, sourcePlatform: "jd", sellerName: "Same name", domesticShippingCents: 20, remark: "manual note", items: [{ productUrl: "https://item.jd.com/1.html", name: "Manual", specification: "Blue", quantity: 3, unitPriceCents: 100, remark: "SKU note" }] };
  return selection(await addManualCart(db, actor.id, form));
}
const request = (previewId: string) => ({ id: crypto.randomUUID(), previewId, confirm: true });
const orders = () => db.select().from(procurementOrders).where(eq(procurementOrders.customerId, actor.id));
beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "cart-checkout", modules: true, script: "export default {fetch(){return new Response('test')}}", d1Databases: ["DB"] }] }));
  const binding = await mf.getD1Database("DB");
  for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) await binding.batch(readFileSync(`drizzle/${file}`, "utf8").split(";").map(s => s.replaceAll("--> statement-breakpoint", "").trim()).filter(Boolean).map(s => binding.prepare(s)));
  db = createDb(binding as unknown as D1Database);
  await db.insert(warehouseLocations).values({ id: "current", name: "Test", country: "CN", province: "P", city: "C", district: "D", street: "Street", postalCode: "000000", phone: "00000000000", recipient: "Test", hours: "", syncedAt: Date.now() });
  await saveExchangeRate(db, "test", "USD", { cnyPerUnitE4: 10000, enabled: true, version: 0 });
  await saveProductPolicy(db, { id: "test", email: "test@example.invalid" }, { currency: "USD", markupBps: 0, fixedCnyCents: 0, serviceBps: 0, serviceCnyCents: 0, version: 0 });
}, 30000);
beforeEach(async () => {
  actor = { id: crypto.randomUUID(), email: `${crypto.randomUUID()}@example.invalid` };
  await db.insert(user).values({ ...actor, name: "Test", memberCode: actor.id, createdAt: new Date(), updatedAt: new Date() });
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => { await mf?.dispose(); });

describe("unified cart checkout", () => {
  it("groups ordinary shops and platforms with manual entries, bills atomically and clears only selections", async () => {
    const calls = remote();
    const items = [await standard("a:1"), await standard("a:2"), await standard("b:1"), await standard("a:1", "weidian"), await manual()];
    const untouched = await standard("untouched:1");
    const preview = await previewCart(db, "test", actor.id, { items });
    expect(preview.orderCount).toBe(4);
    expect(preview.totalCents).toBe(1210); // 800 ordinary + 90 shipping + 300 manual + 20 shipping.
    expect(preview.groups.find(g => g.type === "manual")).toMatchObject({ estimated: true, quote: { totalCents: 320 } });
    expect(JSON.stringify(preview)).not.toMatch(/costCny|markupBps|requestHash|manualInput/);
    expect(calls.mock.calls.filter(([url]) => String(url).endsWith("/orders/preview"))).toHaveLength(3);
    expect(await orders()).toHaveLength(0);
    const input = request(preview.id), result = await checkoutCart(db, actor, input);
    expect(result.orders).toHaveLength(4);
    expect((await orders()).map(o => o.orderType).filter(t => t === "manual")).toHaveLength(1);
    const bills = await db.select().from(procurementBills).where(eq(procurementBills.customerId, actor.id));
    expect(bills.every(b => b.status === "issued" && b.paidCents === 0)).toBe(true);
    expect(bills.reduce((n, b) => n + b.totalCents, 0)).toBe(preview.totalCents);
    expect(await countCart(db, actor.id)).toEqual({ total: 1, totalQuantity: 2 });
    expect((await db.select().from(cartItems).where(eq(cartItems.id, untouched.id)))[0]).toBeTruthy();
    expect(await checkoutCart(db, actor, input)).toEqual(result);
    expect(await readCartCheckout(db, actor.id, input.id)).toEqual(result);
    await expect(readCartCheckout(db, "other", input.id)).rejects.toMatchObject({ status: 404 });
  });
  it("supports 50 SKUs from one shop in one quote and order, rejecting 51", async () => {
    const calls = remote();
    const items = [];
    for (let i = 0; i < 50; i++) items.push(await standard(`same:${i}`));
    const preview = await previewCart(db, "test", actor.id, { items });
    expect(preview.groups).toHaveLength(1);
    expect(preview.groups[0].quote.lines).toHaveLength(50);
    const result = await checkoutCart(db, actor, request(preview.id));
    expect(await db.select().from(procurementItems).where(eq(procurementItems.orderId, result.orders[0].id))).toHaveLength(50);
    expect(calls.mock.calls.filter(([url]) => String(url).endsWith("/orders/preview"))).toHaveLength(1);
    await expect(previewCart(db, "test", actor.id, { items: [...items, { ...items[0], id: crypto.randomUUID() }] })).rejects.toMatchObject({ status: 400 });
  }, 30000);
  it("supports 50 distinct shops in one atomic checkout", async () => {
    remote(); const items = [];
    for (let i = 0; i < 50; i++) items.push(await standard(`shop${i}:1`));
    const preview = await previewCart(db, "test", actor.id, { items });
    expect(preview.orderCount).toBe(50);
    expect((await checkoutCart(db, actor, request(preview.id))).orders).toHaveLength(50);
    expect(await orders()).toHaveLength(50);
    expect(await countCart(db, actor.id)).toEqual({ total: 0, totalQuantity: 0 });
  }, 30000);
  it("supports 50 complete manual forms with 20 lines each without oversized snapshots or SQL bindings", async () => {
    const items = [];
    for (let i = 0; i < 50; i++) {
      const form = { id: crypto.randomUUID(), sourcePlatform: "jd", sellerName: "Manual seller", domesticShippingCents: 20,
        items: Array.from({ length: 20 }, (_, j) => ({ productUrl: `https://item.jd.com/${j}.html`, name: "商品".repeat(200), specification: "Blue", quantity: 1, unitPriceCents: 100, remark: "备注".repeat(200) })) };
      items.push(selection(await addManualCart(db, actor.id, form)));
    }
    const preview = await previewCart(db, "", actor.id, { items });
    expect(preview.orderCount).toBe(50);
    expect((await checkoutCart(db, actor, request(preview.id))).orders).toHaveLength(50);
    const [count] = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(procurementItems).innerJoin(procurementOrders, eq(procurementItems.orderId, procurementOrders.id)).where(eq(procurementOrders.customerId, actor.id));
    expect(count.count).toBe(1000);
    expect(await countCart(db, actor.id)).toEqual({ total: 0, totalQuantity: 0 });
  }, 60000);
  it("does not require HioBuy for manual-only carts and freezes their quote", async () => {
    const items = [await manual(), await manual()];
    const token = vi.fn(async () => { throw new Error("no integration"); });
    const preview = await previewCart(db, token, actor.id, { items });
    expect(preview.groups).toHaveLength(2); // same-name stores are not reliable identities.
    expect(token).not.toHaveBeenCalled();
    await db.update(productPricing).set({ markupBps: 1000 });
    try {
      await checkoutCart(db, actor, request(preview.id));
      const bills = await db.select().from(procurementBills).where(eq(procurementBills.customerId, actor.id));
      expect(bills.reduce((n, b) => n + b.totalCents, 0)).toBe(preview.totalCents);
      expect(bills.every(b => JSON.parse(b.snapshot).estimated)).toBe(true);
    } finally { await db.update(productPricing).set({ markupBps: 0 }); }
  });
  it("keeps colliding ordinary/manual IDs separate and rejects duplicate composite selections", async () => {
    remote(); const id = crypto.randomUUID(), items = [await standard("a:1", "1688", id), await manual(id)];
    expect((await previewCart(db, "test", actor.id, { items })).orderCount).toBe(2);
    await expect(previewCart(db, "test", actor.id, { items: [items[0], items[0]] })).rejects.toMatchObject({ status: 400 });
    const unknown = [await standard("unknown:1"), await standard("unknown:2")];
    expect((await previewCart(db, "test", actor.id, { items: unknown })).orderCount).toBe(2);
  });
  it("checks ownership, versions, expired previews, and edits between preview and checkout", async () => {
    remote(); const item = await standard();
    await expect(previewCart(db, "test", "other", { items: [item] })).rejects.toMatchObject({ status: 404 });
    await expect(previewCart(db, "test", actor.id, { items: [{ ...item, version: 2 }] })).rejects.toMatchObject({ status: 409 });
    const preview = await previewCart(db, "test", actor.id, { items: [item] });
    await expect(checkoutCart(db, { id: "other", email: "other@example.invalid" }, request(preview.id))).rejects.toMatchObject({ status: 404 });
    await db.update(cartItems).set({ version: 2, quantity: 3 }).where(eq(cartItems.id, item.id));
    await expect(checkoutCart(db, actor, request(preview.id))).rejects.toMatchObject({ code: "CART_CHANGED" });
    const fresh = await previewCart(db, "test", actor.id, { items: [{ ...item, version: 2 }] });
    await db.update(cartPreviews).set({ expiresAt: 1 }).where(eq(cartPreviews.id, fresh.id));
    await expect(checkoutCart(db, actor, request(fresh.id))).rejects.toMatchObject({ code: "CART_PREVIEW_EXPIRED" });
    expect(await orders()).toHaveLength(0);
  });
  it("replays concurrent identical checkout and forbids reusing the id for another preview", async () => {
    remote(); const items = [await standard(), await manual()];
    const preview = await previewCart(db, "test", actor.id, { items }), input = request(preview.id);
    const result = await Promise.all([checkoutCart(db, actor, input), checkoutCart(db, actor, input)]);
    expect(result[0]).toEqual(result[1]); expect(await orders()).toHaveLength(2);
    await db.update(cartPreviews).set({ expiresAt: 1 }).where(eq(cartPreviews.id, preview.id));
    expect(await checkoutCart(db, actor, input)).toEqual(result[0]);
    await expect(checkoutCart(db, actor, { ...input, previewId: crypto.randomUUID() })).rejects.toMatchObject({ code: "CART_CHECKOUT_CONFLICT" });
    await expect(checkoutCart(db, actor, request(preview.id))).rejects.toMatchObject({ status: 409 });
  });
  it("allows only one of two previews for the same selection to commit", async () => {
    remote(); const items = [await standard(), await manual()];
    const previews = await Promise.all([previewCart(db, "test", actor.id, { items }), previewCart(db, "test", actor.id, { items })]);
    const results = await Promise.allSettled(previews.map(p => checkoutCart(db, actor, request(p.id))));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await orders()).toHaveLength(2);
  });
  it("rolls back every order, bill and cart change on failure and retries the same request", async () => {
    remote(); const items = [await standard(), await manual()];
    const preview = await previewCart(db, "test", actor.id, { items }), input = request(preview.id);
    await db.run(sql`CREATE TRIGGER fail_cart_manual BEFORE INSERT ON procurement_orders WHEN NEW.order_type='manual' BEGIN SELECT RAISE(ABORT,'simulated write failure'); END`);
    try { await expect(checkoutCart(db, actor, input)).rejects.toThrow(); }
    finally { await db.run(sql`DROP TRIGGER fail_cart_manual`); }
    expect(await orders()).toHaveLength(0);
    expect(await db.select().from(procurementBills).where(eq(procurementBills.customerId, actor.id))).toHaveLength(0);
    expect(await db.select().from(cartCheckouts).where(eq(cartCheckouts.id, input.id))).toHaveLength(0);
    expect(await countCart(db, actor.id)).toEqual({ total: 2, totalQuantity: 5 });
    expect((await checkoutCart(db, actor, input)).orders).toHaveLength(2);
  });
  it("does not consume stale manual entries already submitted through the legacy endpoint", async () => {
    const item = await manual(), preview = await previewCart(db, "", actor.id, { items: [item] });
    await checkoutManualCart(db, actor, item.id, { version: item.version });
    await expect(checkoutCart(db, actor, request(preview.id))).rejects.toMatchObject({ status: 409 });
    expect(await orders()).toHaveLength(1);
  });
  it("does not create a combined preview when a selected SKU is unavailable", async () => {
    remote(0); const items = [await standard(), await manual()];
    await expect(previewCart(db, "test", actor.id, { items })).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
    expect(await db.select().from(cartPreviews).where(eq(cartPreviews.customerId, actor.id))).toHaveLength(0);
    expect(await orders()).toHaveLength(0);
  });
  it("applies coupons per standard order, excludes manual orders, and atomically reserves uses", async () => {
    remote();
    const id = crypto.randomUUID(), code = `C${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    await db.insert(marketingCoupons).values({ id, name: "Cart coupon", code, enabled: true, from: "2020-01-01", to: "2099-01-01", currency: "USD", kind: "fixed", discountValue: 10, minimumCents: 0, usageLimit: 1, requestHash: id, mutationId: id, createdBy: actor.id, createdAt: Date.now(), updatedAt: Date.now() });
    const items = [await standard("a:1"), await standard("b:1"), await manual()];
    await expect(previewCart(db, "test", actor.id, { items, couponCode: code })).rejects.toMatchObject({ code: "COUPON_UNAVAILABLE" });
    await db.update(marketingCoupons).set({ usageLimit: 2 }).where(eq(marketingCoupons.id, id));
    const preview = await previewCart(db, "test", actor.id, { items, couponCode: code });
    expect(preview.discountCents).toBe(20);
    expect(preview.groups.find(g => g.type === "manual")!.quote.discountCents).toBe(0);
    await db.update(marketingCoupons).set({ usageLimit: 1 }).where(eq(marketingCoupons.id, id));
    const input = request(preview.id);
    await expect(checkoutCart(db, actor, input)).rejects.toMatchObject({ code: "COUPON_UNAVAILABLE" });
    expect(await orders()).toHaveLength(0);
    await db.update(marketingCoupons).set({ usageLimit: 2 }).where(eq(marketingCoupons.id, id));
    await checkoutCart(db, actor, input);
    expect(await db.select().from(purchaseCouponRedemptions).where(eq(purchaseCouponRedemptions.couponId, id))).toHaveLength(2);
    expect((await db.select().from(procurementBills).where(eq(procurementBills.customerId, actor.id))).reduce((n, b) => n + b.totalCents, 0)).toBe(preview.totalCents);
  });
  it("allows only one concurrent checkout to reserve the last coupon use", async () => {
    remote(); const id = crypto.randomUUID(), code = `C${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    await db.insert(marketingCoupons).values({ id, name: "Last use", code, enabled: true, from: "2020-01-01", to: "2099-01-01", currency: "USD", kind: "fixed", discountValue: 10, minimumCents: 0, usageLimit: 1, requestHash: id, mutationId: id, createdBy: actor.id, createdAt: Date.now(), updatedAt: Date.now() });
    const a = await standard("a:1"), b = await standard("b:1");
    const previews = await Promise.all([a, b].map(item => previewCart(db, "test", actor.id, { items: [item], couponCode: code })));
    const results = await Promise.allSettled(previews.map(preview => checkoutCart(db, actor, request(preview.id))));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await orders()).toHaveLength(1);
    expect(await db.select().from(purchaseCouponRedemptions).where(eq(purchaseCouponRedemptions.couponId, id))).toHaveLength(1);
    expect(await countCart(db, actor.id)).toEqual({ total: 1, totalQuantity: 2 });
  });
});
