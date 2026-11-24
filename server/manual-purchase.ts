import { chunks } from "./batch-utils";
import { productQuote, type ProductQuote } from "../src/domain/product-pricing";
import { and, eq, sql } from "drizzle-orm";
import { manualPurchaseInput, manualRequest, priceManualPurchase } from "../src/domain/manual-purchase";
import { record } from "../src/domain/purchase";
import type { Database } from "./db/client";
import { auditLogs, procurementBills, procurementItems, procurementOrders, procurementRemote, purchaseAttempts, purchaseQuotes, user } from "./db/schema";
import { AppError } from "./errors";
import { allocateNumber } from "./numbering";
import { parseInput } from "./operations-input";
import { productPricingSettings, readProductPolicy } from "./product-billing";
import { callProcurement } from "./services/hiobuy/procurement";

type Actor = { id: string; email: string };
const conflict = () => { throw new AppError("PURCHASE_CONFLICT", "This purchase changed. Refresh and review it before continuing.", 409); };
export async function createManualPurchase(db: Database, actor: Actor, raw: unknown) {
  const input = parseInput(manualPurchaseInput, raw), requestHash = JSON.stringify(input);
  const readExisting = async () => (await db.select().from(procurementOrders).where(eq(procurementOrders.id, input.id)))[0];
  const previous = await readExisting();
  if (previous) {
    if (previous.customerId !== actor.id || previous.requestHash !== requestHash) conflict();
    return { id: previous.id };
  }
  const statements=await prepareManualCreation(db,actor,input);
  try { await db.batch(statements);
  } catch (error) {
    const saved = await readExisting();
    if (!saved) throw error;
    if (saved.customerId !== actor.id || saved.requestHash !== requestHash) conflict();
  }
  return { id: input.id };
}

export async function quoteManualPurchase(db: Database, raw: unknown) {
  const input=parseInput(manualPurchaseInput,raw);
  const policy = await readProductPolicy(db);
  if (!policy || policy.currency !== (await productPricingSettings(db)).currency) throw new AppError("PRICING_REQUIRED", "Configure product pricing for the current customer currency.",409);
  return {...productQuote(policy,input.items.map((item,i)=>({itemId:String(i),name:item.name,sku:String(i),quantity:item.quantity,costCnyCents:item.unitPriceCents})),input.domesticShippingCents),estimated:true};
}
/** Trusted frozenQuote is supplied only by the persisted unified cart preview. */
export async function prepareManualCreation(db: Database, actor: Actor, raw: unknown, frozenQuote?: Awaited<ReturnType<typeof quoteManualPurchase>>) {
  const input=parseInput(manualPurchaseInput,raw), requestHash=JSON.stringify(input);
  const [customer] = await db.select().from(user).where(and(eq(user.id, actor.id), eq(user.status, "active")));
  if (!customer?.memberCode) throw new AppError("FORBIDDEN", "An active customer account is required.", 403);
  const initialQuote = frozenQuote ?? await quoteManualPurchase(db,input);
  const now = Date.now(), quoteId = crypto.randomUUID();
  const goods = input.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const statements = [
      db.insert(purchaseQuotes).values({ id: quoteId, customerId: actor.id, channel: "manual", request: JSON.stringify(manualRequest(input)), preview: JSON.stringify({ manualInput: input }), pricing: JSON.stringify(initialQuote), costCnyCents: 0, createdAt: now, expiresAt: now }),
      db.insert(procurementOrders).values({ id: input.id, number: await allocateNumber(db, "procurement"), customerId: actor.id, platform: input.sourcePlatform, orderType: "manual", goodsCents: goods, shippingCents: input.domesticShippingCents, totalCents: goods + input.domesticShippingCents, requestHash, createdBy: actor.id, createdAt: now, updatedAt: now }),
      ...chunks(input.items.map((item, position) => ({ id: crypto.randomUUID(), orderId: input.id, position, name: item.name, sku: String(position), quantity: item.quantity, unitPriceCents: item.unitPriceCents, productSnapshot: JSON.stringify({ sourceUrl: item.productUrl, imageUrl: item.imageUrl, variantLabel: item.specification }) })), 8).map(items => db.insert(procurementItems).values(items)),
      db.insert(procurementBills).values({id:crypto.randomUUID(),orderId:input.id,customerId:actor.id,status:"issued",currency:initialQuote.currency,goodsCents:initialQuote.goodsCents,serviceCents:initialQuote.serviceCents,shippingCents:initialQuote.shippingCents,totalCents:initialQuote.totalCents,snapshot:JSON.stringify(initialQuote),requestHash,createdBy:actor.id,createdAt:now}),
      db.insert(procurementRemote).values({ orderId: input.id, quoteId, channel: "manual", costCnyCents: 0, syncNextAt: null, updatedAt: now }),
      db.insert(auditLogs).values({ id: crypto.randomUUID(), actorId: actor.id, actorEmail: actor.email, action: "procurement.manual.request", target: input.id, detail: "{}", createdAt: now }),
  ] as const;
  return statements;
}

/** Operator-authorized creation only. Retries reuse the exact persisted body and key; never pay here. */
export async function submitManualPurchase(db: Database, token: string, actor: Actor, id: string) {
  const [remote] = await db.select().from(procurementRemote).where(eq(procurementRemote.orderId, id));
  const [order] = await db.select().from(procurementOrders).where(eq(procurementOrders.id, id));
  if (!remote || remote.channel !== "manual" || order?.status !== "draft") conflict();
  const [saved] = await db.select().from(purchaseQuotes).where(eq(purchaseQuotes.id, remote.quoteId));
  const input = parseInput(manualPurchaseInput, record(JSON.parse(saved.preview)).manualInput);
  const risk = await db.get(sql`SELECT 1 FROM purchase_stripe_payments s JOIN payments p ON p.id=s.id WHERE s.order_id=${id} AND p.risk_status IS NOT NULL LIMIT 1`);
  if (risk) conflict();
  const [activeBill] = await db.select().from(procurementBills).where(and(eq(procurementBills.orderId, id), sql`${procurementBills.status} != 'void'`));
  if (activeBill && activeBill.status !== "paid" || !["ready", "unknown", "creating"].includes(remote.state)) conflict();
  const [attempt] = await db.select().from(purchaseAttempts).where(and(eq(purchaseAttempts.orderId, id), eq(purchaseAttempts.action, "create")));
  if (attempt && attempt.updatedAt > Date.now() - 60_000) conflict();
  const policy = activeBill ? (JSON.parse(activeBill.snapshot) as ProductQuote).policy : await readProductPolicy(db);
  if (!policy || policy.currency !== (await productPricingSettings(db)).currency) throw new AppError("PRICING_REQUIRED", "Configure product pricing for the current customer currency.", 409);
  const now = Date.now(), attemptId = attempt?.id ?? `manual-create-${crypto.randomUUID()}`;
  const [claimed] = await db.batch([
    db.update(procurementRemote).set({ state: "creating", updatedAt: now }).where(and(eq(procurementRemote.orderId, id), eq(procurementRemote.state, remote.state), eq(procurementRemote.updatedAt, remote.updatedAt), sql`EXISTS (SELECT 1 FROM procurement_orders WHERE id=${id} AND status='draft') AND NOT EXISTS (SELECT 1 FROM procurement_bills WHERE order_id=${id} AND status='issued') AND NOT EXISTS (SELECT 1 FROM purchase_stripe_payments s JOIN payments p ON p.id=s.id WHERE s.order_id=${id} AND p.risk_status IS NOT NULL)`)).returning(),
    db.insert(purchaseAttempts).select(sql`SELECT ${attemptId},${id},'create','executing',${saved.request},NULL,${actor.id},${now},${now} WHERE EXISTS (SELECT 1 FROM procurement_remote WHERE order_id=${id} AND state='creating' AND updated_at=${now})`).onConflictDoUpdate({ target: purchaseAttempts.id, set: { state: "executing", updatedAt: now } }),
  ]);
  if (!claimed.length) conflict();
  const result = await callProcurement(token, "manual", JSON.parse(saved.request), attemptId);
  let priced: ReturnType<typeof priceManualPurchase>;
  try {
    if (result.uncertain || result.status < 200 || result.status >= 300) throw new Error("Upstream manual order was not confirmed.");
    priced = priceManualPurchase(input, result.data, policy);
  } catch {
    await db.batch([
      db.update(procurementRemote).set({ state: "unknown", lastResult: JSON.stringify(result.data), updatedAt: Date.now() }).where(and(eq(procurementRemote.orderId, id), eq(procurementRemote.state, "creating"), eq(procurementRemote.updatedAt, now))),
      db.update(purchaseAttempts).set({ state: "unknown", result: JSON.stringify(result.data), updatedAt: Date.now() }).where(and(eq(purchaseAttempts.id, attemptId), eq(purchaseAttempts.updatedAt, now))),
    ]);
    throw new AppError("MANUAL_ORDER_UNCONFIRMED", "Manual order is unconfirmed. Review HioBuy access and retry the same submission after one minute; do not create another request.", 409);
  }
  const mutationId = crypto.randomUUID(), finishedAt = Date.now(), quote = priced.quote;
  const guard = sql`EXISTS (SELECT 1 FROM procurement_orders WHERE id=${id} AND mutation_id=${mutationId})`;
  await db.batch([
    db.update(procurementOrders).set({ goodsCents: priced.goods, shippingCents: priced.shipping + priced.fee, totalCents: priced.payment, mutationId, version: sql`${procurementOrders.version}+1`, updatedAt: finishedAt }).where(and(eq(procurementOrders.id, id), eq(procurementOrders.status, "draft"), activeBill ? sql`EXISTS (SELECT 1 FROM procurement_bills WHERE id=${activeBill.id} AND version=${activeBill.version} AND status='paid')` : undefined, sql`EXISTS (SELECT 1 FROM procurement_remote WHERE order_id=${id} AND state='creating' AND updated_at=${now})`)),
    ...quote.lines.map((line, position) => db.update(procurementItems).set({ unitPriceCents: line.costCnyCents, productSnapshot: JSON.stringify({sourceUrl:input.items[position].productUrl,imageUrl:input.items[position].imageUrl,variantLabel:input.items[position].specification,manualItemRef:String(position),manualSubOrderId:priced.mappings.find(m=>m.itemRef===String(position))!.subOrderId}) }).where(and(eq(procurementItems.orderId, id), eq(procurementItems.position, position), guard))),
    db.update(purchaseQuotes).set({ pricing: JSON.stringify(quote), preview: JSON.stringify({ ...result.data, manualInput: input, initialBillingSnapshot: activeBill ? JSON.parse(activeBill.snapshot) : null }), costCnyCents: priced.payment }).where(and(eq(purchaseQuotes.id, saved.id), guard)),
    ...(activeBill ? [db.update(procurementBills).set({goodsCents:quote.goodsCents,serviceCents:quote.serviceCents,shippingCents:quote.shippingCents,totalCents:quote.totalCents,snapshot:JSON.stringify({...quote,estimated:false}),status:activeBill.paidCents >= quote.totalCents ? "paid" : "issued",version:sql`${procurementBills.version}+1`}).where(and(eq(procurementBills.id,activeBill.id),eq(procurementBills.version,activeBill.version),guard))] : [db.insert(procurementBills).select(sql`SELECT ${crypto.randomUUID()},${id},${order.customerId},'issued',${quote.currency},${quote.goodsCents},${quote.serviceCents},${quote.shippingCents},0,${quote.totalCents},${JSON.stringify(quote)},${saved.id},1,${actor.id},${finishedAt},NULL,NULL,0 WHERE ${guard}`)]),
    db.update(procurementRemote).set({ state: "created", remoteId: priced.remoteId, remoteStatus: typeof result.data.status === "string" ? result.data.status : null, costCnyCents: priced.payment, lastResult: JSON.stringify(result.data), updatedAt: finishedAt, syncNextAt: finishedAt + 300_000 }).where(and(eq(procurementRemote.orderId, id), guard)),
    db.update(purchaseAttempts).set({ state: "succeeded", result: JSON.stringify(result.data), updatedAt: finishedAt }).where(and(eq(purchaseAttempts.id, attemptId), guard)),
    db.insert(auditLogs).select(sql`SELECT ${crypto.randomUUID()},${actor.id},${actor.email},'procurement.manual.submit',${id},'{}',${finishedAt} WHERE ${guard}`),
  ]);
}
