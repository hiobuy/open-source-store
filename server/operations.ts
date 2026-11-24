import { productQuote } from "../src/domain/product-pricing";
import { readProductPolicy } from "./product-billing";
import { purchaseOptionsView } from "./purchase-attachments";
import { can } from "../src/domain/staff";
import { allocateNumber } from "./numbering";
import { readProductMedia } from "./purchase-media";
import { record } from "../src/domain/purchase";
import { procurementOverviews, procurementStage, customerPayment } from "./procurement-overview";
import { billsForOrder, issueBill, quoteOrder, productPricingSettings, saveProductPolicy, voidBill } from "./product-billing";
import { procurementTrackingAdmin, receivingSummary } from "./procurement-tracking";
import { purchaseAdmin } from "./purchase-http";
import { and, asc, count, desc, eq, exists, inArray, like, lte, gte, or, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AdminEnv } from "./admin";
import type { Database } from "./db/client";
import { auditLogs, marketingCampaigns, marketingCoupons, platformSettings, procurementItems, procurementNotes, procurementOrders, procurementRemote, procurementBills, user } from "./db/schema";
import { AppError } from "./errors";
import { dateInput, listInput, marketingInput, marketingStatus, noteInput, orderInput, orderTotals, parseInput, versionInput } from "./operations-input";
import { normalizeCurrency } from "../src/domain/locale";
import type { MarketingRecord, ProcurementOrder } from "../src/types/operations";

type Actor = { id: string; email: string };
const audit = (actor: Actor, action: string, target: string, detail = {}) => ({ id: crypto.randomUUID(), actorId: actor.id, actorEmail: actor.email, action, target, detail: JSON.stringify(detail), createdAt: Date.now() });
async function hash(value: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
function failMissing() { throw new AppError("NOT_FOUND", "Record not found.", 404); }
function conflict() { throw new AppError("CONFLICT", "This record changed. Refresh and try again.", 409); }
const orderFields = { orderType: procurementOrders.orderType, id: procurementOrders.id, number: procurementOrders.number, customerId: procurementOrders.customerId, customer: user.name, member: user.memberCode, country:user.country, platform: procurementOrders.platform, status: procurementOrders.status, currency: procurementOrders.currency, goodsCents: procurementOrders.goodsCents, shippingCents: procurementOrders.shippingCents, totalCents: procurementOrders.totalCents, version: procurementOrders.version, createdAt: procurementOrders.createdAt };
async function attachItems(db: Database, rows: Omit<ProcurementOrder, "items">[], includeProfit = false) {
  const items = rows.length ? await db.select().from(procurementItems).where(inArray(procurementItems.orderId, rows.map(r => r.id))).orderBy(asc(procurementItems.position)) : [];
  const remotes = rows.length ? await db.select({orderId:procurementRemote.orderId,state:procurementRemote.state,paymentStatus:procurementRemote.paymentStatus}).from(procurementRemote).where(inArray(procurementRemote.orderId,rows.map(r=>r.id))) : [];
  const overviews=await procurementOverviews(db,rows.map(r=>r.id),includeProfit);
  const bills=rows.length?await db.select().from(procurementBills).where(and(inArray(procurementBills.orderId,rows.map(r=>r.id)),sql`${procurementBills.status}!='void'`)):[];
  return rows.map(r=>{
    const bill=bills.find(b=>b.orderId===r.id);let snapshot:Record<string,unknown>={};try{snapshot=record(JSON.parse(bill?.snapshot??"{}"));}catch{}
    const lines=Array.isArray(snapshot.lines)?snapshot.lines.map(record):[];
    return {...r,overview:overviews.find(o=>o.orderId===r.id),remote:remotes.find(remote=>remote.orderId===r.id)??null,
      items:items.filter(i=>i.orderId===r.id).map(({id,name,sku,quantity,unitPriceCents,productSnapshot,position})=>{
        const line=lines.find(l=>l.itemId===id)??lines.find(l=>l.itemId===String(position));
        return {id,name,sku,quantity,unitPriceCents,...readProductMedia(productSnapshot),sellingLineCents:typeof line?.goodsCents==="number"?line.goodsCents:null,sellingCurrency:bill?.currency??null};
      })};
  });
}
export async function orderDetail(db: Database, id: string, includeProfit = false) {
  const rows = await db.select(orderFields).from(procurementOrders).innerJoin(user, eq(user.id, procurementOrders.customerId)).where(eq(procurementOrders.id, id));
  if (!rows[0]) failMissing();
  const notes = await db.select({ id: procurementNotes.id, text: procurementNotes.text, kind: procurementNotes.kind, createdAt: procurementNotes.createdAt, author: user.name }).from(procurementNotes).innerJoin(user, eq(user.id, procurementNotes.createdBy)).where(eq(procurementNotes.orderId, id)).orderBy(asc(procurementNotes.createdAt), asc(procurementNotes.id));
  const activity = await db.select({ id: auditLogs.id, action: auditLogs.action, at: auditLogs.createdAt, author: user.name }).from(auditLogs).leftJoin(user, eq(user.id, auditLogs.actorId)).where(eq(auditLogs.target, id)).orderBy(asc(auditLogs.createdAt));
  const order = (await attachItems(db, rows,includeProfit))[0];
  const {itemOptions,...options} = await purchaseOptionsView(db,id,true);
  return { ...order, ...options, items: order.items.map(item => ({...item,...(itemOptions[item.id] ?? {remark:"",attachments:[]})})), notes, bills: await billsForOrder(db, id), activity, receiving: await receivingSummary(db, id) };
}
export async function createOrder(db: Database, actor: Actor, raw: unknown) {
  const input = parseInput(orderInput, raw), requestHash = await hash(input);
  const previous = (await db.select().from(procurementOrders).where(eq(procurementOrders.id, input.id)))[0];
  if (previous) { if (previous.requestHash !== requestHash || previous.createdBy !== actor.id) conflict(); return orderDetail(db, input.id); }
  const customer = (await db.select({ id: user.id }).from(user).where(and(eq(user.id, input.customerId), eq(user.status, "active"))))[0];
  if (!customer) throw new AppError("VALIDATION_ERROR", "Select an active customer.");
  const policy = await readProductPolicy(db);
  if (!policy || policy.currency !== (await productPricingSettings(db)).currency) throw new AppError("PRICING_REQUIRED", "Configure product pricing for the current customer currency.", 409);
  const items = input.items.map((item, position) => ({...item,id:crypto.randomUUID(),orderId:input.id,position}));
  const quote = productQuote(policy,items.map(item=>({itemId:item.id,name:item.name,sku:item.sku,quantity:item.quantity,costCnyCents:item.unitPriceCents})),input.shippingCents);
  const now = Date.now();
  try {
    await db.batch([
      db.insert(procurementOrders).values({ id: input.id, number: await allocateNumber(db, "procurement"), customerId: input.customerId, platform: input.platform, ...orderTotals(input.items, input.shippingCents), requestHash, createdBy: actor.id, createdAt: now, updatedAt: now }),
      db.insert(procurementItems).values(items),
      db.insert(procurementBills).values({id:crypto.randomUUID(),orderId:input.id,customerId:input.customerId,status:"issued",currency:quote.currency,goodsCents:quote.goodsCents,serviceCents:quote.serviceCents,shippingCents:quote.shippingCents,totalCents:quote.totalCents,snapshot:JSON.stringify(quote),requestHash,createdBy:actor.id,createdAt:now}),
      db.insert(auditLogs).values(audit(actor, "procurement.create", input.id)),
    ]);
  } catch (error) {
    const saved = (await db.select().from(procurementOrders).where(eq(procurementOrders.id, input.id)))[0];
    if (!saved) throw error;
    if (saved.requestHash !== requestHash || saved.createdBy !== actor.id) conflict();
  }
  return orderDetail(db, input.id);
}
export async function addOrderNote(db: Database, actor: Actor, orderId: string, raw: unknown) {
  const input = parseInput(noteInput, raw);
  if (!(await db.select({ id: procurementOrders.id }).from(procurementOrders).where(eq(procurementOrders.id, orderId)))[0]) failMissing();
  try {
    await db.batch([db.insert(procurementNotes).values({ ...input, orderId, createdBy: actor.id, createdAt: Date.now() }), db.insert(auditLogs).values(audit(actor, "procurement.note", orderId, { noteId: input.id }))]);
  } catch (error) {
    const previous = (await db.select().from(procurementNotes).where(eq(procurementNotes.id, input.id)))[0];
    if (!previous) throw error;
    if (previous.orderId !== orderId || previous.text !== input.text || previous.kind !== input.kind || previous.createdBy !== actor.id) conflict();
  }
  return orderDetail(db, orderId);
}
export async function cancelOrder(db: Database, actor: Actor, id: string, raw: unknown) {
  const { version } = parseInput(versionInput, raw);
  const entry = audit(actor, "procurement.cancel", id);
  const [updated] = await db.batch([
    db.update(procurementOrders).set({ status: "cancelled", version: version + 1, updatedAt: Date.now() }).where(and(eq(procurementOrders.id, id), eq(procurementOrders.version, version), eq(procurementOrders.status, "draft"), sql`NOT EXISTS (SELECT 1 FROM procurement_bills WHERE order_id = ${id} AND status != 'void') AND NOT EXISTS (SELECT 1 FROM procurement_item_packages WHERE order_id = ${id} AND active = 1) AND NOT EXISTS (SELECT 1 FROM procurement_remote WHERE order_id = ${id} AND state != 'ready') AND NOT EXISTS (SELECT 1 FROM procurement_aftersales WHERE order_id = ${id} AND status IN ('open', 'in_progress'))`)).returning({ id: procurementOrders.id }),
    // SQLite changes() refers to the immediately preceding statement in this atomic D1 batch.
    db.insert(auditLogs).select(sql`SELECT ${entry.id}, ${entry.actorId}, ${entry.actorEmail}, ${entry.action}, ${entry.target}, ${entry.detail}, ${entry.createdAt} WHERE changes() > 0`),
  ]);
  if (!updated.length) conflict();
  return orderDetail(db, id);
}

const tableFor = (group: "coupons" | "campaigns") => group === "coupons" ? marketingCoupons : marketingCampaigns;
function marketingView(row: typeof marketingCoupons.$inferSelect | typeof marketingCampaigns.$inferSelect, group: "coupons" | "campaigns"): MarketingRecord {
  const coupon = "discountValue" in row ? row : null;
  return { id: row.id, group, name: row.name, code: row.code, enabled: row.enabled, from: row.from, to: row.to, version: row.version, currency: coupon?.currency ?? "USD", kind: coupon?.kind ?? "percent", amount: (coupon?.discountValue ?? 1000) / 100, minimum: (coupon?.minimumCents ?? 0) / 100, limit: coupon?.usageLimit ?? 100, channel: "channel" in row ? row.channel : "Community", status: marketingStatus(row) };
}
export async function saveMarketing(db: Database, actor: Actor, raw: unknown, updateId?: string) {
  const input = parseInput(marketingInput, raw), table = tableFor(input.group);
  if (updateId && (input.id !== updateId || !input.version)) throw new AppError("VALIDATION_ERROR", "Record id and version are required.");
  const old = (await db.select().from(table).where(eq(table.id, input.id)))[0];
  const requestHash = await hash(input);
  if (!updateId && old) { if (old.requestHash !== requestHash || old.createdBy !== actor.id) conflict(); return marketingView(old, input.group); }
  if (updateId && !old) failMissing();
  if (old && (old.code !== input.code || old.version !== input.version)) conflict();
  const currency = normalizeCurrency((await db.select({ currency: platformSettings.customerCurrency }).from(platformSettings).limit(1))[0]?.currency);
  const mutationId = crypto.randomUUID(), now = Date.now();
  const values = { name: input.name, code: input.code, from: input.from, to: input.to, mutationId, updatedAt: now,
    ...(input.group === "coupons" ? { kind: input.kind, discountValue: Math.round(input.amount * 100), minimumCents: Math.round(input.minimum * 100), usageLimit: input.limit, currency: old && "currency" in old ? old.currency : currency } : { channel: input.channel }),
  };
  const entry = audit(actor, updateId ? "marketing.update" : "marketing.create", input.id, { group: input.group });
  try {
    if (updateId) {
      const [updated] = await db.batch([
        db.update(table).set({ ...values, version: input.version! + 1 }).where(and(eq(table.id, input.id), eq(table.version, input.version!))).returning({ id: table.id }),
        db.insert(auditLogs).select(sql`SELECT ${entry.id}, ${entry.actorId}, ${entry.actorEmail}, ${entry.action}, ${entry.target}, ${entry.detail}, ${entry.createdAt} WHERE EXISTS (SELECT 1 FROM ${table} WHERE ${table.id} = ${input.id} AND ${table.mutationId} = ${mutationId})`),
      ]);
      if (!updated.length) conflict();
    } else {
      await db.batch([db.insert(table).values({ ...values, id: input.id, requestHash, createdBy: actor.id, createdAt: now } as typeof marketingCoupons.$inferInsert), db.insert(auditLogs).values(entry)]);
    }
  } catch (error) {
    if (!updateId) {
      const saved = (await db.select().from(table).where(eq(table.id, input.id)))[0];
      if (saved) {
        if (saved.requestHash === requestHash && saved.createdBy === actor.id) return marketingView(saved, input.group);
        conflict();
      }
    }
    const duplicate = (await db.select({ id: table.id }).from(table).where(eq(table.code, input.code)))[0];
    if (duplicate && duplicate.id !== input.id) throw new AppError("DUPLICATE_CODE", "This code already exists.", 409);
    throw error;
  }
  return marketingView((await db.select().from(table).where(eq(table.id, input.id)))[0], input.group);
}
export async function setMarketingEnabled(db: Database, actor: Actor, group: "coupons" | "campaigns", id: string, raw: unknown) {
  const { version, enabled } = parseInput(z.object({ version: z.number().int().positive(), enabled: z.boolean() }).strict(), raw);
  const table = tableFor(group), mutationId = crypto.randomUUID(), entry = audit(actor, "marketing.enabled", id, { group, enabled });
  const [updated] = await db.batch([
    db.update(table).set({ enabled, version: version + 1, mutationId, updatedAt: Date.now() }).where(and(eq(table.id, id), eq(table.version, version))).returning({ id: table.id }),
    db.insert(auditLogs).select(sql`SELECT ${entry.id}, ${entry.actorId}, ${entry.actorEmail}, ${entry.action}, ${entry.target}, ${entry.detail}, ${entry.createdAt} WHERE EXISTS (SELECT 1 FROM ${table} WHERE ${table.id} = ${id} AND ${table.mutationId} = ${mutationId})`),
  ]);
  if (!updated.length) conflict();
  return marketingView((await db.select().from(table).where(eq(table.id, id)))[0], group);
}

export const operationsAdmin = new Hono<AdminEnv>();
operationsAdmin.route("/", procurementTrackingAdmin);
operationsAdmin.route("/", purchaseAdmin);
const ok = (c: Context<AdminEnv>, data: unknown) => c.json({ data, requestId: c.get("requestId") });
operationsAdmin.get("/procurement/customers", async c => {
  const { q } = parseInput(listInput, c.req.query());
  const pattern = `%${q}%`;
  const items = await c.get("db").select({ id: user.id, name: user.name, memberCode: user.memberCode }).from(user).where(and(eq(user.status, "active"), q ? or(like(user.name, pattern), like(user.memberCode, pattern), like(user.email, pattern)) : undefined)).orderBy(asc(user.name), asc(user.id)).limit(30);
  return ok(c, { items });
});
operationsAdmin.get("/procurement", async c => {
  const input = parseInput(listInput.extend({ status: z.enum(["", "draft", "cancelled"]).default(""), stage:z.enum(["","draft","awaiting_payment","pending","buying","awaiting_receipt","transit","partial","stocked","packed","shipped","exception","after","cancelled"]).default(""), payment:z.enum(["","issued","paid","unbilled"]).default(""), minAmount:z.coerce.number().min(0).max(9999999).optional(), orderType: z.enum(["", "standard", "manual"]).default(""), platform: z.enum(["", "1688", "Taobao", "Weidian", "jd", "pinduoduo", "poizon"]).default(""), from: dateInput.optional(), to: dateInput.optional() }).refine(v => !v.from || !v.to || v.from <= v.to, "Invalid date range."), c.req.query());
  const db = c.get("db"), pattern = `%${input.q}%`;
  const where = and(input.stage ? (input.stage==="awaiting_receipt"?sql`${procurementStage} IN ('transit','partial')`:input.stage==="exception"?sql`${procurementStage} IN ('exception','after')`:eq(procurementStage,input.stage)) : undefined,
    input.payment?eq(customerPayment,input.payment):undefined,
    input.minAmount!==undefined?sql`EXISTS(SELECT 1 FROM procurement_bills b WHERE b.order_id=${procurementOrders.id} AND b.status!='void' AND b.currency=COALESCE((SELECT customer_currency FROM platform_settings LIMIT 1),'USD') AND b.total_cents>=${Math.round(input.minAmount*100)})`:undefined,
    input.orderType ? eq(procurementOrders.orderType, input.orderType) : undefined, input.status ? eq(procurementOrders.status, input.status) : undefined, input.platform ? eq(procurementOrders.platform, input.platform) : undefined,
    input.from ? gte(procurementOrders.createdAt, Date.parse(`${input.from}T00:00:00Z`)) : undefined, input.to ? lte(procurementOrders.createdAt, Date.parse(`${input.to}T00:00:00Z`) + 86400000 - 1) : undefined,
    input.q ? or(like(procurementOrders.number, pattern), like(user.name, pattern), like(user.memberCode, pattern), sql`EXISTS (SELECT 1 FROM procurement_item_packages l JOIN packages p ON p.id=l.package_id WHERE l.order_id=${procurementOrders.id} AND l.active=1 AND (p.public_id LIKE ${pattern} OR p.domestic_tracking_number LIKE ${pattern}))`, exists(db.select({ id: procurementItems.id }).from(procurementItems).where(and(eq(procurementItems.orderId, procurementOrders.id), or(like(procurementItems.name, pattern), like(procurementItems.sku, pattern)))))) : undefined);
  const total = (await db.select({ total: count() }).from(procurementOrders).innerJoin(user, eq(user.id, procurementOrders.customerId)).where(where))[0].total;
  const page = Math.min(input.page, Math.max(1, Math.ceil(total / input.pageSize)));
  const rows = await db.select(orderFields).from(procurementOrders).innerJoin(user, eq(user.id, procurementOrders.customerId)).where(where).orderBy(desc(procurementOrders.createdAt), desc(procurementOrders.id)).limit(input.pageSize).offset((page - 1) * input.pageSize);
  const counts = await db.select({ status: procurementOrders.status, count: count() }).from(procurementOrders).groupBy(procurementOrders.status);
  const payments=await db.select({state:customerPayment,n:count()}).from(procurementOrders).groupBy(customerPayment);
  const stages=await db.select({stage:procurementStage,n:count()}).from(procurementOrders).groupBy(procurementStage);
  return ok(c, { items: await attachItems(db, rows,!!c.get("staff") && can(c.get("staff").role,"earnings.read")), total, page, pageSize: input.pageSize, counts: {...Object.fromEntries(counts.map(r => [r.status, r.count])),...Object.fromEntries(stages.map(r=>[`stage:${r.stage}`,r.n])),...Object.fromEntries(payments.map(r=>[`payment:${r.state}`,r.n]))} });
});
operationsAdmin.get("/procurement/:id", async c => ok(c, await orderDetail(c.get("db"), c.req.param("id"),!!c.get("staff") && can(c.get("staff").role,"earnings.read"))));
operationsAdmin.post("/procurement", async c => ok(c, await createOrder(c.get("db"), c.get("user"), await c.req.json())));
operationsAdmin.post("/procurement/:id/notes", async c => ok(c, await addOrderNote(c.get("db"), c.get("user"), c.req.param("id"), await c.req.json())));
operationsAdmin.post("/procurement/:id/cancel", async c => ok(c, await cancelOrder(c.get("db"), c.get("user"), c.req.param("id"), await c.req.json())));
operationsAdmin.get("/marketing", async c => {
  const input = parseInput(listInput.extend({ group: z.enum(["coupons", "campaigns"]).default("coupons"), status: z.enum(["", "Enabled", "Disabled", "Scheduled", "Expired"]).default("") }), c.req.query());
  const db = c.get("db"), table = tableFor(input.group), today = new Date().toISOString().slice(0, 10);
  const filters = { Enabled: and(eq(table.enabled, true), lte(table.from, today), gte(table.to, today)), Disabled: eq(table.enabled, false), Scheduled: and(eq(table.enabled, true), sql`${table.from} > ${today}`), Expired: and(eq(table.enabled, true), sql`${table.to} < ${today}`) };
  const where = and(input.q ? or(like(table.name, `%${input.q}%`), like(table.code, `%${input.q}%`)) : undefined, input.status ? filters[input.status] : undefined);
  const total = (await db.select({ total: count() }).from(table).where(where))[0].total;
  const page = Math.min(input.page, Math.max(1, Math.ceil(total / input.pageSize)));
  const rows = await db.select().from(table).where(where).orderBy(desc(table.createdAt), desc(table.id)).limit(input.pageSize).offset((page - 1) * input.pageSize);
  const coupons = (await db.select({ n: count() }).from(marketingCoupons))[0].n;
  const campaigns = (await db.select({ n: count() }).from(marketingCampaigns))[0].n;
  const enabled = (await db.select({ n: count() }).from(marketingCoupons).where(and(eq(marketingCoupons.enabled, true), lte(marketingCoupons.from, today), gte(marketingCoupons.to, today))))[0].n;
  return ok(c, { items: rows.map(row => marketingView(row, input.group)), total, page, pageSize: input.pageSize, counts: { coupons, campaigns, enabled } });
});
operationsAdmin.post("/marketing", async c => ok(c, await saveMarketing(c.get("db"), c.get("user"), await c.req.json())));
operationsAdmin.put("/marketing/:id", async c => ok(c, await saveMarketing(c.get("db"), c.get("user"), await c.req.json(), c.req.param("id"))));
operationsAdmin.put("/marketing/:group/:id/enabled", async c => ok(c, await setMarketingEnabled(c.get("db"), c.get("user"), parseInput(z.enum(["coupons", "campaigns"]), c.req.param("group")), c.req.param("id"), await c.req.json())));

operationsAdmin.get("/settings/product-pricing", async c => ok(c, await productPricingSettings(c.get("db"))));
operationsAdmin.put("/settings/product-pricing", async c => ok(c, await saveProductPolicy(c.get("db"), c.get("user"), await c.req.json())));
operationsAdmin.post("/procurement/:id/bill-preview", async c => ok(c, await quoteOrder(c.get("db"), c.req.param("id"), await c.req.json())));
operationsAdmin.post("/procurement/:id/bills", async c => {
  await issueBill(c.get("db"), c.get("user"), c.req.param("id"), await c.req.json());
  return ok(c, await billsForOrder(c.get("db"), c.req.param("id")));
});
operationsAdmin.post("/procurement/:id/bills/:billId/void", async c => ok(c, await voidBill(c.get("db"), c.get("user"), c.req.param("id"), c.req.param("billId"), await c.req.json())));
