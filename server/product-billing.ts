import { releasePurchaseCoupon } from "./purchase-coupons";
import { getExchangeRate, requireExchangeRate } from "./exchange-rates";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "./db/client";
import { auditLogs, procurementBills, procurementItems, procurementOrders, productPricing, platformSettings } from "./db/schema";
import { AppError } from "./errors";
import { parseInput } from "./operations-input";
import { isCurrencyCode } from "../src/domain/locale";
import { productQuote, type ProductQuote } from "../src/domain/product-pricing";

type Actor = { id: string; email: string };
const audit = (a: Actor, action: string, target: string) => ({ id: crypto.randomUUID(), actorId: a.id, actorEmail: a.email, action, target, detail: "{}", createdAt: Date.now() });
const clash = () => { throw new AppError("CONFLICT", "This record changed. Refresh and try again.", 409); };
export const policyInput = z.object({ currency: z.string().refine(isCurrencyCode), markupBps: z.number().int().min(0).max(10000), fixedCnyCents: z.number().int().min(0).max(99999999), serviceBps: z.number().int().min(0).max(10000), serviceCnyCents: z.number().int().min(0).max(99999999), cnyPerCurrencyE4: z.number().int().min(1).max(999999999).optional(), version: z.number().int().min(0) }).strict();
export async function readProductPolicy(db: Database) {
  const policy = (await db.select().from(productPricing).where(eq(productPricing.id, "current")))[0];
  if (!policy) return null;
  const rate = await requireExchangeRate(db, policy.currency);
  return { ...policy, cnyPerCurrencyE4: rate.cnyPerUnitE4, exchangeRateVersion: rate.version };
}
export async function productPricingSettings(db: Database) {
  const currency = (await db.select({ currency: platformSettings.customerCurrency }).from(platformSettings).limit(1))[0]?.currency ?? "USD";
  const stored = (await db.select().from(productPricing).where(eq(productPricing.id, "current")))[0] ?? null;
  const rate = await getExchangeRate(db, currency);
  return { policy: stored ? { ...stored, cnyPerCurrencyE4: rate?.enabled ? rate.cnyPerUnitE4 : 0, exchangeRateVersion: rate?.version ?? null } : null, currency, exchangeRate: rate?.enabled ? { cnyPerUnitE4: rate.cnyPerUnitE4, version: rate.version } : null };
}
export async function saveProductPolicy(db: Database, actor: Actor, raw: unknown) {
  const input = parseInput(policyInput, raw), mutationId = crypto.randomUUID(), entry = audit(actor, "product-pricing.update", "current");
  const currency = (await db.select({ currency: platformSettings.customerCurrency }).from(platformSettings).limit(1))[0]?.currency ?? "USD";
  if (input.currency !== currency) throw new AppError("VALIDATION_ERROR", "Pricing currency must match the configured customer currency.");
  if (input.currency === "CNY" && input.cnyPerCurrencyE4 !== undefined && input.cnyPerCurrencyE4 !== 10000) throw new AppError("VALIDATION_ERROR", "CNY pricing requires an exchange rate of 1.");
  const rate = await requireExchangeRate(db, currency);
  if (input.cnyPerCurrencyE4 !== undefined && input.cnyPerCurrencyE4 !== rate.cnyPerUnitE4) throw new AppError("CONFLICT", "Exchange rate is managed in Exchange rates. Reload the pricing settings.");
  const existing = (await db.select().from(productPricing).where(eq(productPricing.id, "current")))[0];
  if ((existing?.version ?? 0) !== input.version) clash();
  const values = { ...input, cnyPerCurrencyE4: rate.cnyPerUnitE4, id: "current", version: input.version + 1, mutationId, updatedBy: actor.id, updatedAt: Date.now() };
  const [saved] = await db.batch([
    db.insert(productPricing).values(values).onConflictDoUpdate({ target: productPricing.id, set: values, setWhere: eq(productPricing.version, input.version) }).returning({ version: productPricing.version }),
    db.insert(auditLogs).select(sql`SELECT ${entry.id}, ${entry.actorId}, ${entry.actorEmail}, ${entry.action}, ${entry.target}, ${entry.detail}, ${entry.createdAt} WHERE EXISTS (SELECT 1 FROM product_pricing WHERE mutation_id = ${mutationId})`),
  ]);
  if (!saved.length) clash();
  return readProductPolicy(db);
}
const quoteInput = z.object({ orderVersion: z.number().int().positive(), policyVersion: z.number().int().positive(), costs: z.array(z.object({ itemId: z.string().min(1), costCnyCents: z.number().int().min(1).max(99999999) }).strict()).min(1).max(20) }).strict();
export async function quoteOrder(db: Database, orderId: string, raw: unknown) {
  const input = parseInput(quoteInput, raw), policy = await readProductPolicy(db);
  if (!policy) throw new AppError("PRICING_REQUIRED", "Configure product pricing before issuing a bill.", 409);
  if (policy.currency !== (await productPricingSettings(db)).currency) throw new AppError("PRICING_REQUIRED", "Update product pricing for the current customer currency.", 409);
  const order = (await db.select().from(procurementOrders).where(eq(procurementOrders.id, orderId)))[0];
  if (!order) throw new AppError("NOT_FOUND", "Record not found.", 404);
  if (order.orderType === "manual") throw new AppError("MANUAL_BILL_MANAGED", "Manual purchase bills are generated from confirmed warehouse amounts.", 409);
  if (order.status !== "draft" || order.version !== input.orderVersion || policy.version !== input.policyVersion) clash();
  const items = await db.select().from(procurementItems).where(eq(procurementItems.orderId, orderId));
  if (new Set(input.costs.map(i => i.itemId)).size !== items.length || input.costs.length !== items.length || items.some(i => !input.costs.some(c => c.itemId === i.id))) throw new AppError("VALIDATION_ERROR", "Enter a purchase cost for every item.");
  try { return productQuote(policy, items.map(i => ({ itemId: i.id, name: i.name, sku: i.sku, quantity: i.quantity, costCnyCents: input.costs.find(c => c.itemId === i.id)!.costCnyCents })), order.shippingCents); }
  catch (error) { throw new AppError("VALIDATION_ERROR", error instanceof Error ? error.message : "Invalid pricing amount."); }
}
export async function issueBill(db: Database, actor: Actor, orderId: string, raw: unknown) {
  const input = parseInput(quoteInput.extend({ id: z.string().uuid() }).strict(), raw);
  const requestHash = JSON.stringify({ orderId, ...input });
  const previous = (await db.select().from(procurementBills).where(eq(procurementBills.id, input.id)))[0];
  if (previous) { if (previous.requestHash !== requestHash || previous.createdBy !== actor.id) clash(); return previous; }
  const { id, ...quoteParams } = input;
  const quote = await quoteOrder(db, orderId, quoteParams), mutationId = crypto.randomUUID(), now = Date.now();
  const order = (await db.select().from(procurementOrders).where(eq(procurementOrders.id, orderId)))[0];
  const entry = audit(actor, "procurement.bill.issue", orderId);
  try {
    const [changed] = await db.batch([
      db.update(procurementOrders).set({ version: input.orderVersion + 1, mutationId, updatedAt: now }).where(and(eq(procurementOrders.id, orderId), eq(procurementOrders.status, "draft"), eq(procurementOrders.version, input.orderVersion), sql`EXISTS (SELECT 1 FROM product_pricing WHERE id = 'current' AND version = ${input.policyVersion} AND currency = COALESCE((SELECT customer_currency FROM platform_settings LIMIT 1), 'USD'))`)).returning({ id: procurementOrders.id }),
      db.insert(procurementBills).select(sql`SELECT ${id}, ${orderId}, ${order.customerId}, 'issued', ${quote.currency}, ${quote.goodsCents}, ${quote.serviceCents}, ${quote.shippingCents}, 0, ${quote.totalCents}, ${JSON.stringify(quote)}, ${requestHash}, 1, ${actor.id}, ${now}, NULL, NULL, 0 WHERE EXISTS (SELECT 1 FROM procurement_orders WHERE id = ${orderId} AND mutation_id = ${mutationId})`),
      db.insert(auditLogs).select(sql`SELECT ${entry.id}, ${entry.actorId}, ${entry.actorEmail}, ${entry.action}, ${entry.target}, ${entry.detail}, ${entry.createdAt} WHERE EXISTS (SELECT 1 FROM procurement_orders WHERE id = ${orderId} AND mutation_id = ${mutationId})`),
    ]);
    if (!changed.length) clash();
  } catch (error) {
    const saved = (await db.select().from(procurementBills).where(eq(procurementBills.id, id)))[0];
    if (saved?.requestHash === requestHash && saved.createdBy === actor.id) return saved;
    if ((await db.select({ id: procurementBills.id }).from(procurementBills).where(and(eq(procurementBills.orderId, orderId), sql`status != 'void'`)))[0]) throw new AppError("ACTIVE_BILL", "Void the existing unpaid bill before issuing another.", 409);
    throw error;
  }
  return (await db.select().from(procurementBills).where(eq(procurementBills.id, id)))[0];
}
export async function voidBill(db: Database, actor: Actor, orderId: string, billId: string, raw: unknown) {
  const input = parseInput(z.object({ version: z.number().int().positive(), reason: z.string().trim().min(2).max(500) }).strict(), raw);
  const entry = audit(actor, "procurement.bill.void", orderId);
  const [changed] = await db.batch([
    db.update(procurementBills).set({ status: "void", voidReason: input.reason, version: input.version + 1 }).where(and(eq(procurementBills.id, billId), eq(procurementBills.orderId, orderId), eq(procurementBills.status, "issued"), eq(procurementBills.paidCents, 0), eq(procurementBills.version, input.version), sql`NOT EXISTS (SELECT 1 FROM purchase_stripe_payments WHERE bill_id=${billId} AND state IN ('pending','review'))`)).returning({ id: procurementBills.id }),
    db.insert(auditLogs).select(sql`SELECT ${entry.id}, ${entry.actorId}, ${entry.actorEmail}, ${entry.action}, ${entry.target}, ${entry.detail}, ${entry.createdAt} WHERE changes() > 0`),
    releasePurchaseCoupon(db,billId),
  ]);
  if (!changed.length) clash();
  return { ok: true };
}
export async function billsForOrder(db: Database, orderId: string) {
  const rows = await db.select().from(procurementBills).where(eq(procurementBills.orderId, orderId)).orderBy(desc(procurementBills.createdAt));
  // Cost and rule snapshots remain private. Staff get only the customer-facing breakdown here.
  return rows.map(({ id, status, currency, goodsCents, serviceCents, shippingCents, discountCents, totalCents, createdAt, version, voidReason, paidAt, paidCents, snapshot }) => {
    const saved = JSON.parse(snapshot) as ProductQuote;
    return { paidCents,dueCents:status === "void" ? 0 : Math.max(0,totalCents-paidCents),overpaidCents:Math.max(0,paidCents-totalCents),estimated:!!(saved as ProductQuote & {estimated?:boolean}).estimated, id, status, currency, goodsCents, serviceCents, shippingCents, discountCents, totalCents, createdAt, version, voidReason, paidAt, exchangeRate: Number.isSafeInteger(saved.policy.cnyPerCurrencyE4) ? saved.policy.cnyPerCurrencyE4 : null, policyVersion: saved.policy.version, lines: saved.lines.map(({ name, sku, quantity, goodsCents, serviceCents }) => ({ name, sku, quantity, goodsCents, serviceCents })) };
  });
}

/** CNY merchandise display needs the current markup, not a currency conversion. */
export async function readProductDisplayPolicy(db: Database) {
  const settings = await productPricingSettings(db);
  return settings.policy?.currency === settings.currency ? settings.policy : null;
}
