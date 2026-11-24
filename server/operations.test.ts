import { saveExchangeRate } from "./exchange-rates";
import { allocateNumber, listNumberRules, saveNumberRules } from "./numbering";
import { procurementOverviews } from "./procurement-overview";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ env: {} }));
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, type Database } from "./db/client";
import { addOrderNote, cancelOrder, createOrder as createPayableOrder, orderDetail, operationsAdmin, saveMarketing, setMarketingEnabled } from "./operations";
import { marketingInput, marketingStatus, orderInput, orderTotals } from "./operations-input";
import { auditLogs, marketingCoupons, procurementOrders, procurementItems, productPricing, user } from "./db/schema";
import { can, permissionFor } from "../src/domain/staff";
import type { AdminEnv } from "./admin";
import { AppError } from "./errors";
import { billsForOrder, issueBill, quoteOrder, readProductPolicy, saveProductPolicy, voidBill } from "./product-billing";
import { procurementBills, platformSettings } from "./db/schema";
import { trackProcurement, receivingSummary } from "./procurement-tracking";
import { packages, procurementItemPackages, procurementAftersales, procurementTrackingEvents } from "./db/schema";

let mf: Miniflare, db: Database;
const actor = { id: "ops-test-staff", email: "ops-test@example.invalid" };
const order = () => ({ id: crypto.randomUUID(), customerId: actor.id, platform: "1688", shippingCents: 1250, items: [{ name: "Test item", sku: "M", quantity: 3, unitPriceCents: 1999 }] });

// Seed historical unbilled orders directly; new API orders are tested via createPayableOrder.
async function createOrder(db: Database, actor: {id:string;email:string}, input: ReturnType<typeof order>) {
  const now=Date.now();
  await db.batch([
    db.insert(procurementOrders).values({id:input.id,number:await allocateNumber(db,"procurement"),customerId:input.customerId,platform:input.platform,...orderTotals(input.items,input.shippingCents),requestHash:input.id,createdBy:actor.id,createdAt:now,updatedAt:now}),
    db.insert(procurementItems).values(input.items.map((item,position)=>({...item,id:crypto.randomUUID(),orderId:input.id,position}))),
    db.insert(auditLogs).values({id:crypto.randomUUID(),actorId:actor.id,actorEmail:actor.email,action:"procurement.create",target:input.id,detail:"{}",createdAt:now}),
  ]);
  return orderDetail(db,input.id);
}

const coupon = () => ({ id: crypto.randomUUID(), group: "coupons" as const, name: "Offer", code: `TEST_${crypto.randomUUID().slice(0, 8)}`, from: "2026-01-01", to: "2027-12-31", kind: "percent" as const, amount: 12.5, minimum: 30.25, limit: 100, channel: "Community" });
async function makePackage(customerId = actor.id) {
  const id = crypto.randomUUID();
  const pkg = { id, userId: customerId, publicId: `PKG-${crypto.randomUUID()}`, domesticTrackingNumber: crypto.randomUUID(), courier: "Test", packageStatus: "PENDING", exceptionStatus: "NONE", vasStatus: "NONE", lockStatus: "AVAILABLE", disposition: "NONE", createdAt: Date.now(), updatedAt: Date.now() };
  await db.insert(packages).values(pkg); return pkg;
}
const command = () => ({ id: crypto.randomUUID(), orderVersion: 1, note: "Verified manually" });
beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "operations-test", modules: true, script: "export default { fetch() { return new Response('test'); } }", d1Databases: ["DB"] }] }));
  const binding = await mf.getD1Database("DB");
  for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) {
    const statements = readFileSync(`drizzle/${file}`, "utf8").split(";").map(s => s.replaceAll("--> statement-breakpoint", "").trim()).filter(Boolean);
    await binding.batch(statements.map(s => binding.prepare(s)));
  }
  db = createDb(binding as unknown as D1Database);
  await db.insert(user).values({ id: actor.id, name: "Operations test", email: actor.email, memberCode: "OPS-TEST", createdAt: new Date(), updatedAt: new Date() });
}, 30000);
afterAll(async () => { await mf?.dispose(); });

// Uses the actual D1 adapter and an isolated Miniflare database, never the developer database.
describe("persistent operations", () => {
  it("rejects forged totals, invalid dates and fractional minor units", () => {
    expect(orderInput.safeParse({ ...order(), totalCents: 1 }).success).toBe(false);
    expect(orderInput.safeParse({ ...order(), shippingCents: 1.5 }).success).toBe(false);
    expect(marketingInput.safeParse({ ...coupon(), from: "2026-02-30" }).success).toBe(false);
    expect(marketingInput.safeParse({ ...coupon(), amount: 100.01 }).success).toBe(false);
    expect(marketingInput.safeParse({ ...coupon(), amount: 10.001 }).success).toBe(false);
    expect(orderTotals([{ quantity: 3, unitPriceCents: 1999 }], 1250)).toEqual({ goodsCents: 5997, shippingCents: 1250, totalCents: 7247 });
    expect(marketingStatus({ enabled: true, from: "2026-01-01", to: "2026-11-10" }, "2026-11-10")).toBe("Enabled");
    expect(marketingStatus({ enabled: true, from: "2026-01-01", to: "2026-11-10" }, "2026-11-11")).toBe("Expired");
  });
  it("creates a payable bill with the order atomically and deduplicates concurrent retries", async () => {
    await saveExchangeRate(db,actor.id,"USD",{cnyPerUnitE4:70000,enabled:true,version:0});
    await saveProductPolicy(db,actor,{currency:"USD",markupBps:1000,fixedCnyCents:100,serviceBps:500,serviceCnyCents:50,cnyPerCurrencyE4:70000,version:0});
    const input = order();
    const [a, b] = await Promise.all([createPayableOrder(db, actor, input), createPayableOrder(db, actor, input)]);
    expect(a.id).toBe(b.id); expect(a.number).not.toBe(a.id); expect(a.status).toBe("draft"); expect(a.totalCents).toBe(7247); expect(a.currency).toBe("CNY"); expect(a.items).toHaveLength(1);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.target, a.id))).toHaveLength(1);
    expect(a.overview?.stage).toBe("awaiting_payment"); expect(a.bills[0].status).toBe("issued");
    await expect(createPayableOrder(db, actor, { ...input, shippingCents: 1 })).rejects.toMatchObject({ status: 409 });
    const note = { id: crypto.randomUUID(), text: "Check size", kind: "resolution" };
    await Promise.all([addOrderNote(db, actor, a.id, note), addOrderNote(db, actor, a.id, note)]);
    expect((await addOrderNote(db, actor, a.id, note)).notes).toHaveLength(1);
    await expect(addOrderNote(db, actor, a.id, { ...note, text: "Changed" })).rejects.toMatchObject({ status: 409 });
  });
  it("rolls back the header when the item insert fails", async () => {
    await db.run(sql`CREATE TRIGGER reject_test_item BEFORE INSERT ON procurement_items WHEN NEW.sku = 'FAIL' BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
    const input = order(); input.items[0].sku = "FAIL";
    await expect(createPayableOrder(db, actor, input)).rejects.toThrow();
    expect(await db.select().from(procurementOrders).where(eq(procurementOrders.id, input.id))).toHaveLength(0);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.target, input.id))).toHaveLength(0);
    await db.run(sql`DROP TRIGGER reject_test_item`);
  });
  it("rolls back a new order when automatic bill creation fails, then retries safely", async () => {
    const input=order();
    await db.run(sql.raw("CREATE TRIGGER new_bill_failure BEFORE INSERT ON procurement_bills BEGIN SELECT RAISE(ABORT, 'test'); END"));
    try {await expect(createPayableOrder(db,actor,input)).rejects.toThrow();} finally {await db.run(sql.raw("DROP TRIGGER new_bill_failure"));}
    expect(await db.select().from(procurementOrders).where(eq(procurementOrders.id,input.id))).toHaveLength(0);
    const created=await createPayableOrder(db,actor,input);
    expect(created.bills).toHaveLength(1); expect(created.bills[0]).toMatchObject({status:"issued",paidCents:0});
  });
  it("cancels drafts once and rejects stale versions without extra audit events", async () => {
    const row = await createOrder(db, actor, order());
    const results = await Promise.allSettled([cancelOrder(db, actor, row.id, { version: 1 }), cancelOrder(db, actor, row.id, { version: 1 })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.select().from(procurementOrders).where(eq(procurementOrders.id, row.id)))[0]).toMatchObject({ status: "cancelled", version: 2 });
    expect(await db.select().from(auditLogs).where(eq(auditLogs.target, row.id))).toHaveLength(2);
  });
  it("enforces unique coupon codes, integer amounts, disabled defaults and optimistic updates", async () => {
    const input = coupon();
    const [a, b] = await Promise.all([saveMarketing(db, actor, input), saveMarketing(db, actor, input)]);
    expect(a.id).toBe(b.id); expect(a.enabled).toBe(false); expect(a.amount).toBe(12.5);
    expect((await db.select().from(marketingCoupons).where(eq(marketingCoupons.id, a.id)))[0]).toMatchObject({ discountValue: 1250, minimumCents: 3025 });
    await expect(saveMarketing(db, actor, { ...input, id: crypto.randomUUID(), code: input.code.toLowerCase() })).rejects.toMatchObject({ code: "DUPLICATE_CODE" });
    const enabled = await setMarketingEnabled(db, actor, "coupons", a.id, { version: 1, enabled: true });
    expect(enabled.enabled).toBe(true); expect(enabled.version).toBe(2);
    const edits = await Promise.allSettled([saveMarketing(db, actor, { ...input, name: "Edit A", version: 2 }, a.id), saveMarketing(db, actor, { ...input, name: "Edit B", version: 2 }, a.id)]);
    expect(edits.filter(r => r.status === "fulfilled")).toHaveLength(1);
    await expect(setMarketingEnabled(db, actor, "coupons", a.id, { version: 1, enabled: false })).rejects.toMatchObject({ status: 409 });
    expect(await db.select().from(auditLogs).where(eq(auditLogs.target, a.id))).toHaveLength(3);
    await expect(saveMarketing(db, actor, { ...input, code: "CHANGED", version: 3 }, a.id)).rejects.toMatchObject({ status: 409 });
  });
  it("persists campaigns separately from coupons", async () => {
    const input = { ...coupon(), group: "campaigns", channel: "Email" };
    const row = await saveMarketing(db, actor, input);
    expect(row).toMatchObject({ group: "campaigns", channel: "Email", enabled: false });
    expect(await db.select().from(marketingCoupons).where(eq(marketingCoupons.id, row.id))).toHaveLength(0);
  });
  it("paginates and filters in the API and gates writes independently of reads", async () => {
    const app = new Hono<AdminEnv>();
    app.use("*", async (c, next) => {
      c.set("db", db); c.set("user", { ...actor, name: "Test" }); c.set("requestId", "test");
      const gate = permissionFor(c.req.method, c.req.path);
      if (gate === "deny" || (gate !== "staff" && !can("support", gate))) return c.json({ error: { code: "FORBIDDEN" } }, 403);
      await next();
    });
    app.onError((error, c) => c.json({ error: { message: error.message } }, error instanceof AppError ? error.status as 400 : 500));
    app.route("/api/admin", operationsAdmin);
    const page = await (await app.request("http://test/api/admin/procurement?pageSize=1&status=draft&q=Test%20item")).json() as { data: { items: unknown[]; total: number } };
    expect(page.data.items).toHaveLength(1); expect(page.data.total).toBeGreaterThan(0);
    expect((await app.request("http://test/api/admin/procurement?pageSize=1000")).status).toBe(400);
    expect((await app.request("http://test/api/admin/marketing?group=coupons&status=Disabled&pageSize=1")).status).toBe(200);
    expect((await app.request("http://test/api/admin/procurement", { method: "POST", body: JSON.stringify(order()) })).status).toBe(403);
    expect((await app.request("http://test/api/admin/marketing/x", { method: "PUT", body: "{}" })).status).toBe(403);
    expect(can("manager", "procurement.write")).toBe(true);
    expect(can("manager", "marketing.write")).toBe(true);
    expect(permissionFor("POST", "/api/admin/procurement/x/notes")).toBe("procurement.write");
    expect(permissionFor("PUT", "/api/admin/marketing/coupons/x/enabled")).toBe("marketing.write");
    expect(permissionFor("DELETE", "/api/admin/marketing/x")).toBe("deny");
    expect((await app.request("http://test/api/admin/procurement/x/bill-preview", { method: "POST", body: "{}" })).status).toBe(403);
    expect(permissionFor("POST", "/api/admin/procurement/x/bills/b/void")).toBe("procurement.write");
    expect(permissionFor("PUT", "/api/admin/settings/product-pricing")).toBe("settings.write");
  });
  it("requires explicit pricing and serializes policy updates", async () => {
    await db.delete(productPricing);
    const row = await createOrder(db, actor, order());
    const params = { orderVersion: 1, policyVersion: 1, costs: row.items.map(i => ({ itemId: i.id, costCnyCents: 1000 })) };
    await expect(quoteOrder(db, row.id, params)).rejects.toMatchObject({ code: "PRICING_REQUIRED" });
    await expect(createPayableOrder(db,actor,order())).rejects.toMatchObject({code:"PRICING_REQUIRED"});
    const input = { currency: "USD", markupBps: 1000, fixedCnyCents: 100, serviceBps: 500, serviceCnyCents: 50, cnyPerCurrencyE4: 70000, version: 0 };
    await expect(saveProductPolicy(db, actor, { ...input, version: 9 })).rejects.toMatchObject({ status: 409 });
    await expect(saveProductPolicy(db, actor, { ...input, currency: "EUR" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const saves = await Promise.allSettled([saveProductPolicy(db, actor, input), saveProductPolicy(db, actor, input)]);
    expect(saves.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await readProductPolicy(db))?.version).toBe(1);
    await expect(quoteOrder(db, row.id, { ...params, totalCents: 1 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(quoteOrder(db, row.id, { ...params, costs: [{ itemId: "wrong", costCnyCents: 1000 }] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("issues bills once, protects active bills and retains immutable snapshots", async () => {
    const row = await createOrder(db, actor, order());
    const input = { id: crypto.randomUUID(), orderVersion: 1, policyVersion: 1, costs: row.items.map(i => ({ itemId: i.id, costCnyCents: 1000 })) };
    const [a, b] = await Promise.all([issueBill(db, actor, row.id, input), issueBill(db, actor, row.id, input)]);
    expect(a.id).toBe(b.id); expect(a.totalCents).toBe(740);
    expect(await db.select().from(procurementBills).where(eq(procurementBills.orderId, row.id))).toHaveLength(1);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.target, row.id))).toHaveLength(2);
    await expect(issueBill(db, actor, row.id, { ...input, costs: [{ ...input.costs[0], costCnyCents: 1 }] })).rejects.toMatchObject({ status: 409 });
    await expect(issueBill(db, actor, row.id, { ...input, id: crypto.randomUUID(), orderVersion: 2 })).rejects.toMatchObject({ code: "ACTIVE_BILL" });
    await expect(cancelOrder(db, actor, row.id, { version: 2 })).rejects.toMatchObject({ status: 409 });
    const current = (await readProductPolicy(db))!;
    await saveExchangeRate(db, actor.id, current.currency, { cnyPerUnitE4: current.cnyPerCurrencyE4 + 10000, enabled: true, version: 1 });
    const saved = (await db.select().from(procurementBills).where(eq(procurementBills.id, a.id)))[0];
    expect(saved.snapshot).toBe(a.snapshot); expect(saved.totalCents).toBe(a.totalCents);
    const publicBill = (await billsForOrder(db, row.id))[0];
    expect(JSON.stringify(publicBill)).not.toMatch(/costCny|markupBps|cnyPerCurrency/);
    const voids = await Promise.allSettled([voidBill(db, actor, row.id, a.id, { version: 1, reason: "Requote" }), voidBill(db, actor, row.id, a.id, { version: 1, reason: "Requote" })]);
    expect(voids.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const replacement = await issueBill(db, actor, row.id, { ...input, id: crypto.randomUUID(), orderVersion: 2, policyVersion: 2 });
    expect(replacement.id).not.toBe(a.id); expect(await billsForOrder(db, row.id)).toHaveLength(2);
  });
  it("rolls back order version and audit if bill persistence fails", async () => {
    const row = await createOrder(db, actor, order());
    const input = { id: crypto.randomUUID(), orderVersion: 1, policyVersion: 2, costs: row.items.map(i => ({ itemId: i.id, costCnyCents: 1000 })) };
    await db.run(sql`CREATE TRIGGER reject_test_bill BEFORE INSERT ON procurement_bills BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
    try { await expect(issueBill(db, actor, row.id, input)).rejects.toThrow(); }
    finally { await db.run(sql`DROP TRIGGER reject_test_bill`); }
    expect((await db.select().from(procurementOrders).where(eq(procurementOrders.id, row.id)))[0].version).toBe(1);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.target, row.id))).toHaveLength(1);
    expect((await issueBill(db, actor, row.id, input)).status).toBe("issued");
  });
  it("rejects stale policies and changed customer currencies", async () => {
    const row = await createOrder(db, actor, order());
    const input = { orderVersion: 1, policyVersion: 1, costs: row.items.map(i => ({ itemId: i.id, costCnyCents: 1000 })) };
    await expect(quoteOrder(db, row.id, input)).rejects.toMatchObject({ status: 409 });
    await db.insert(platformSettings).values({ id: "platform", customerCurrency: "EUR", updatedAt: Date.now() });
    try { await expect(quoteOrder(db, row.id, { ...input, policyVersion: 2 })).rejects.toMatchObject({ code: "PRICING_REQUIRED" }); }
    finally { await db.delete(platformSettings).where(eq(platformSettings.id, "platform")); }
  });
  it("allows only one of competing bills or a racing cancellation", async () => {
    const row = await createOrder(db, actor, order());
    const input = { id: crypto.randomUUID(), orderVersion: 1, policyVersion: 2, costs: row.items.map(i => ({ itemId: i.id, costCnyCents: 1000 })) };
    const issued = await Promise.allSettled([issueBill(db, actor, row.id, input), issueBill(db, actor, row.id, { ...input, id: crypto.randomUUID() })]);
    expect(issued.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await billsForOrder(db, row.id)).toHaveLength(1);
    const other = await createOrder(db, actor, order());
    const competing = await Promise.allSettled([issueBill(db, actor, other.id, { ...input, id: crypto.randomUUID(), costs: other.items.map(i => ({ itemId: i.id, costCnyCents: 1000 })) }), cancelOrder(db, actor, other.id, { version: 1 })]);
    expect(competing.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const state = (await db.select().from(procurementOrders).where(eq(procurementOrders.id, other.id)))[0];
    expect(await billsForOrder(db, other.id)).toHaveLength(state.status === "cancelled" ? 0 : 1);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.target, other.id))).toHaveLength(2);
  });
  it("links only this customer's packages and serializes allocated quantities", async () => {
    const row = await createOrder(db, actor, order()), pkg = await makePackage(), pkg2 = await makePackage(), foreign = await makePackage("someone-else");
    const input = { ...command(), action: "link", itemId: row.items[0].id, packageId: pkg.id, quantity: 2 };
    await expect(trackProcurement(db, actor, row.id, { ...input, packageId: foreign.id })).rejects.toMatchObject({ status: 400 });
    await expect(trackProcurement(db, actor, row.id, { ...input, itemId: "foreign-item" })).rejects.toMatchObject({ status: 400 });
    const a = await Promise.allSettled([trackProcurement(db, actor, row.id, input), trackProcurement(db, actor, row.id, { ...input, id: crypto.randomUUID(), packageId: pkg2.id })]);
    expect(a.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await receivingSummary(db, row.id)).items[0]).toMatchObject({ allocated: 2, received: 0, outstanding: 3 });
    await expect(trackProcurement(db, actor, row.id, { ...input, id: crypto.randomUUID(), orderVersion: 2, quantity: 2 })).rejects.toMatchObject({ status: 400 });
    await expect(cancelOrder(db, actor, row.id, { version: 2 })).rejects.toMatchObject({ status: 409 });
  });
  it("records partial arrivals, corrections and retry history without changing warehouse data", async () => {
    const row = await createOrder(db, actor, order()), pkg = await makePackage();
    const input = { ...command(), action: "link", itemId: row.items[0].id, packageId: pkg.id, quantity: 3 };
    await Promise.all([trackProcurement(db, actor, row.id, input), trackProcurement(db, actor, row.id, input)]);
    await expect(trackProcurement(db, actor, row.id, { ...input, quantity: 1 })).rejects.toMatchObject({ status: 409 });
    const arrival = { ...command(), orderVersion: 2, action: "arrival", linkId: input.id, receivedQuantity: 1 };
    await Promise.all([trackProcurement(db, actor, row.id, arrival), trackProcurement(db, actor, row.id, arrival)]);
    expect((await receivingSummary(db, row.id)).items[0].status).toBe("partially_received");
    await expect(trackProcurement(db, actor, row.id, { ...arrival, id: crypto.randomUUID(), orderVersion: 3, receivedQuantity: 4 })).rejects.toMatchObject({ status: 400 });
    await trackProcurement(db, actor, row.id, { ...arrival, id: crypto.randomUUID(), orderVersion: 3, receivedQuantity: 3 });
    expect((await receivingSummary(db, row.id)).items[0].status).toBe("fully_received");
    await expect(trackProcurement(db, actor, row.id, { ...command(), orderVersion: 4, action: "unlink", linkId: input.id })).rejects.toMatchObject({ status: 400 });
    await trackProcurement(db, actor, row.id, { ...arrival, id: crypto.randomUUID(), orderVersion: 4, receivedQuantity: 0, note: "Corrected mistaken receipt" });
    await trackProcurement(db, actor, row.id, { ...command(), orderVersion: 5, action: "unlink", linkId: input.id });
    expect((await receivingSummary(db, row.id)).items[0]).toMatchObject({ allocated: 0, received: 0 });
    const history = await db.select().from(procurementTrackingEvents).where(eq(procurementTrackingEvents.orderId, row.id));
    expect(history).toHaveLength(5);
    expect(history.find(e => e.note === "Corrected mistaken receipt")).toMatchObject({ beforeQuantity: 3, afterQuantity: 0 });
    expect((await db.select().from(packages).where(eq(packages.id, pkg.id)))[0]).toMatchObject(pkg);
    expect(await db.select().from(procurementBills).where(eq(procurementBills.orderId, row.id))).toHaveLength(0);
    await trackProcurement(db, actor, row.id, { ...input, id: crypto.randomUUID(), orderVersion: 6 });
    expect(await db.select().from(procurementItemPackages).where(eq(procurementItemPackages.orderId, row.id))).toHaveLength(2);
  });
  it("tracks aftersales quantity, linked cases and immutable resolution without executing refunds", async () => {
    const row = await createOrder(db, actor, order()), pkg = await makePackage();
    const linked = { ...command(), action: "link", itemId: row.items[0].id, packageId: pkg.id, quantity: 2 };
    await trackProcurement(db, actor, row.id, linked);
    const input = { ...command(), orderVersion: 2, action: "case_create", itemId: row.items[0].id, linkId: linked.id, kind: "missing", quantity: 2 };
    await Promise.all([trackProcurement(db, actor, row.id, input), trackProcurement(db, actor, row.id, input)]);
    expect((await receivingSummary(db, row.id)).openCases).toBe(1);
    await expect(trackProcurement(db, actor, row.id, { ...input, id: crypto.randomUUID(), orderVersion: 3, quantity: 1 })).rejects.toMatchObject({ status: 400 });
    await expect(trackProcurement(db, actor, row.id, { ...command(), orderVersion: 3, action: "unlink", linkId: linked.id })).rejects.toMatchObject({ status: 400 });
    const update = { ...command(), orderVersion: 3, action: "case_update", caseId: input.id, status: "in_progress" };
    await trackProcurement(db, actor, row.id, update);
    const completed = await Promise.allSettled([trackProcurement(db, actor, row.id, { ...update, id: crypto.randomUUID(), orderVersion: 4, status: "resolved", note: "Supplier supplied missing units" }), trackProcurement(db, actor, row.id, { ...update, id: crypto.randomUUID(), orderVersion: 4, status: "cancelled" })]);
    expect(completed.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.select().from(procurementAftersales).where(eq(procurementAftersales.id, input.id)))[0].resolution).toBeTruthy();
    await expect(trackProcurement(db, actor, row.id, { ...update, id: crypto.randomUUID(), orderVersion: 5, status: "open" })).rejects.toMatchObject({ status: 400 });
    await trackProcurement(db, actor, row.id, { ...command(), orderVersion: 5, action: "unlink", linkId: linked.id });
    expect((await receivingSummary(db, row.id)).openCases).toBe(0);
  });
  it("rolls back tracking mutations and audit when event persistence fails", async () => {
    const row = await createOrder(db, actor, order()), pkg = await makePackage();
    const input = { ...command(), action: "link", itemId: row.items[0].id, packageId: pkg.id, quantity: 3 };
    await db.run(sql`CREATE TRIGGER reject_tracking_event BEFORE INSERT ON procurement_tracking_events BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
    try { await expect(trackProcurement(db, actor, row.id, input)).rejects.toThrow(); }
    finally { await db.run(sql`DROP TRIGGER reject_tracking_event`); }
    expect((await db.select().from(procurementOrders).where(eq(procurementOrders.id, row.id)))[0].version).toBe(1);
    expect(await db.select().from(procurementItemPackages).where(eq(procurementItemPackages.orderId, row.id))).toHaveLength(0);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.target, row.id))).toHaveLength(1);
    await trackProcurement(db, actor, row.id, input);
    expect((await receivingSummary(db, row.id)).items[0].allocated).toBe(3);
  });
  it("paginates tracking reads, scopes package options and denies support writes", async () => {
    const row = await createOrder(db, actor, order());
    const input = { ...command(), action: "case_create", itemId: row.items[0].id, linkId: null, kind: "other", quantity: 1 };
    await trackProcurement(db, actor, row.id, input);
    await expect(cancelOrder(db, actor, row.id, { version: 2 })).rejects.toMatchObject({ status: 409 });
    const other = await createOrder(db, actor, order());
    await expect(trackProcurement(db, actor, other.id, { ...command(), action: "case_update", caseId: input.id, status: "resolved" })).rejects.toMatchObject({ status: 400 });
    const app = new Hono<AdminEnv>();
    app.use("*", async (c, next) => {
      c.set("db", db); c.set("user", { ...actor, name: "Test" }); c.set("requestId", "test");
      const gate = permissionFor(c.req.method, c.req.path);
      if (gate === "deny" || (gate !== "staff" && !can("support", gate))) return c.json({ error: { code: "FORBIDDEN" } }, 403);
      await next();
    });
    app.onError((error, c) => c.json({ error: { message: error.message } }, error instanceof AppError ? error.status as 400 : 500));
    app.route("/api/admin", operationsAdmin);
    for (const group of ["links", "cases", "events"]) {
      const response = await app.request(`http://test/api/admin/procurement/${row.id}/tracking?group=${group}&pageSize=1`);
      expect(response.status).toBe(200);
      const json = await response.json() as { data: { items: unknown[] } };
      expect(json.data.items).toHaveLength(group === "links" ? 0 : 1);
      expect(JSON.stringify(json)).not.toContain("requestHash");
    }
    const logistics = await app.request(`http://test/api/admin/procurement/${row.id}/logistics`);
    expect(logistics.status).toBe(200);
    expect(await logistics.json()).toMatchObject({ data: { trackingStatus: "not_ready", packages: [] } });
    expect((await app.request("http://test/api/admin/procurement/missing/logistics")).status).toBe(404);
    const pkg = await makePackage(), foreign = await makePackage("another-customer");
    const options = await app.request(`http://test/api/admin/procurement/${row.id}/package-options?q=${pkg.domesticTrackingNumber}`);
    expect(JSON.stringify(await options.json())).toContain(pkg.publicId);
    const scoped = await app.request(`http://test/api/admin/procurement/${row.id}/package-options?q=${foreign.domesticTrackingNumber}`);
    expect(JSON.stringify(await scoped.json())).not.toContain(foreign.publicId);
    expect((await app.request(`http://test/api/admin/procurement/${row.id}/tracking`, { method: "POST", body: JSON.stringify(input) })).status).toBe(403);
    expect((await app.request(`http://test/api/admin/procurement/${row.id}/tracking?group=events&pageSize=101`)).status).toBe(400);
    await trackProcurement(db, actor, row.id, { ...command(), orderVersion: 2, action: "case_update", caseId: input.id, status: "cancelled" });
    await cancelOrder(db, actor, row.id, { version: 3 });
    await expect(trackProcurement(db, actor, row.id, { ...input, id: crypto.randomUUID(), orderVersion: 4 })).rejects.toMatchObject({ status: 409 });
  });
});


it("projects genuine arrival and aftersales stages without treating prealerts as received",async()=>{
  const app=new Hono<AdminEnv>();
  app.use("*",async(c,next)=>{c.set("db",db);c.set("user",{...actor,name:"Test"});c.set("requestId","test");await next();});
  app.route("/api/admin",operationsAdmin);
  const o=await createOrder(db,actor,order()),pkg=await makePackage();
  expect((await procurementOverviews(db,[o.id]))[0]).toMatchObject({stage:"awaiting_payment",payment:"unbilled",received:0});
  const linkId=crypto.randomUUID();
  await db.insert(procurementItemPackages).values({id:linkId,orderId:o.id,itemId:o.items[0].id,packageId:pkg.id,allocatedQuantity:3,receivedQuantity:0,active:true,createdAt:Date.now(),updatedAt:Date.now()});
  expect((await procurementOverviews(db,[o.id]))[0].stage).toBe("awaiting_payment");
  await db.update(procurementItemPackages).set({receivedQuantity:1}).where(eq(procurementItemPackages.id,linkId));
  expect((await procurementOverviews(db,[o.id]))[0]).toMatchObject({stage:"partial",received:1,ordered:3,packages:[{id:pkg.id,publicId:pkg.publicId}]});
  const waiting=await(await app.request(`http://test/api/admin/procurement?stage=awaiting_receipt&q=${pkg.publicId}`)).json() as {data:{total:number;items:{id:string}[]}};
  expect(waiting.data.total).toBe(1);expect(waiting.data.items[0].id).toBe(o.id);
  await db.update(procurementItemPackages).set({receivedQuantity:3}).where(eq(procurementItemPackages.id,linkId));
  expect((await procurementOverviews(db,[o.id]))[0].stage).toBe("stocked");
  const arrived=await(await app.request(`http://test/api/admin/procurement?stage=awaiting_receipt&q=${pkg.publicId}`)).json() as {data:{total:number}};
  expect(arrived.data.total).toBe(0);

  await db.update(packages).set({packageStatus:"CONSOLIDATED"}).where(eq(packages.id,pkg.id));
  expect((await procurementOverviews(db,[o.id]))[0].stage).toBe("packed");
  await db.update(packages).set({packageStatus:"SHIPPED"}).where(eq(packages.id,pkg.id));
  expect((await procurementOverviews(db,[o.id]))[0].stage).toBe("shipped");
  await db.update(packages).set({conditionStatus:"EXCEPTION"}).where(eq(packages.id,pkg.id));
  expect((await procurementOverviews(db,[o.id]))[0].stage).toBe("exception");
  await db.insert(procurementAftersales).values({id:crypto.randomUUID(),orderId:o.id,itemId:o.items[0].id,linkId,kind:"damaged",quantity:1,status:"open",reason:"Test case",createdBy:actor.id,createdAt:Date.now(),updatedAt:Date.now()});
  expect((await procurementOverviews(db,[o.id]))[0]).toMatchObject({stage:"after",openCases:1});
  const response=await app.request(`http://test/api/admin/procurement?stage=after&payment=unbilled&q=${pkg.publicId}&pageSize=1`);
  expect(response.status).toBe(200);
  const result=await response.json() as {data:{total:number;items:{id:string}[];counts:Record<string,number>}};
  expect(result.data.total).toBe(1);expect(result.data.items[0].id).toBe(o.id);expect(result.data.counts["stage:after"]).toBeGreaterThan(0);
  const excluded=await(await app.request(`http://test/api/admin/procurement?stage=after&payment=paid&q=${pkg.publicId}`)).json() as {data:{total:number}};
  expect(excluded.data.total).toBe(0);
});

describe("procurement numbering",()=>{
  it("allocates unique numbers concurrently and keeps idempotent orders unchanged",async()=>{
    const ids=await Promise.all(Array.from({length:12},()=>allocateNumber(db,"procurement")));
    expect(new Set(ids).size).toBe(12);expect(ids.every(id=>/^SP\d{10}$/.test(id))).toBe(true);
    const input=order();const first=await createPayableOrder(db,actor,input);const again=await createPayableOrder(db,actor,input);
    expect(first.number).toMatch(/^SP\d{10}$/);expect(again.number).toBe(first.number);
    const rules=await listNumberRules(db);
    const draft=Object.fromEntries(rules.map(r=>[r.kind,{prefix:r.prefix,length:r.length,start:r.kind==="procurement"?1:r.nextValue}])) as Parameters<typeof saveNumberRules>[1];
    const saved=await saveNumberRules(db,draft);
    expect(saved.adjusted).toContain("procurement");
    const next=await allocateNumber(db,"procurement");expect(next>first.number).toBe(true);
    draft.procurement={prefix:"BUY",length:5,start:100};await saveNumberRules(db,draft);
    expect(await allocateNumber(db,"procurement")).toMatch(/^BUY\d{6}00100$/);
  });
});
