import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { currencyCatalog } from "../src/domain/locale";
import { exchangeCurrency, exchangeRateInput, unitsPerCnyE8 } from "../src/domain/exchange-rates";
import type { Database } from "./db/client";
import { exchangeRates, exchangeRateHistory, productPricing } from "./db/schema";
import { parseInput } from "./operations-input";
import { AppError } from "./errors";
import { customerCurrency } from "./locale";

export async function getExchangeRate(db: Database, currency: string) {
  return (await db.select().from(exchangeRates).where(eq(exchangeRates.currency, currency)))[0] ?? null;
}
export async function requireExchangeRate(db: Database, currency: string) {
  const rate = await getExchangeRate(db, currency);
  if (!rate?.enabled || rate.cnyPerUnitE4 <= 0) throw new AppError("EXCHANGE_RATE_REQUIRED", "Configure an enabled exchange rate for this currency.", 409);
  return rate;
}
function presentRate<T extends { cnyPerUnitE4: number }>(rate: T) { return { ...rate, unitsPerCnyE8: unitsPerCnyE8(rate.cnyPerUnitE4) }; }
export async function exchangeRateSettings(db: Database) {
  return { baseCurrency: "CNY", scale: 10000, unitsPerCnyScale: 100000000, settlementCurrency: await customerCurrency(db), currencies: currencyCatalog, items: (await db.select().from(exchangeRates).orderBy(exchangeRates.currency)).map(presentRate) };
}
export async function publicExchangeRates(db: Database) {
  const rows = await db.select().from(exchangeRates).where(eq(exchangeRates.enabled, true)).orderBy(exchangeRates.currency);
  return { baseCurrency: "CNY", scale: 10000, unitsPerCnyScale: 100000000, settlementCurrency: await customerCurrency(db), displayOnly: true,
    items: rows.map(({ currency, cnyPerUnitE4, version, updatedAt }) => ({ currency, cnyPerUnitE4, unitsPerCnyE8: unitsPerCnyE8(cnyPerUnitE4), version, updatedAt })) };
}
export async function saveExchangeRate(db: Database, actorId: string, code: string, raw: unknown) {
  const currency = parseInput(exchangeCurrency, code), input = parseInput(exchangeRateInput, raw);
  const submittedForward = raw && typeof raw === "object" && "unitsPerCnyE8" in raw ? raw.unitsPerCnyE8 : undefined;
  if (submittedForward !== undefined) {
    if (currency === "CNY" && submittedForward !== 100000000) throw new AppError("VALIDATION_ERROR", "CNY must stay enabled at a rate of 1.");
    const existing = await getExchangeRate(db, currency);
    // A display-only round trip must not change the persisted rate; the write below still uses version CAS.
    if (existing?.version === input.version && unitsPerCnyE8(existing.cnyPerUnitE4) === submittedForward) input.cnyPerUnitE4 = existing.cnyPerUnitE4;
  }
  if (currency === "CNY" && (input.cnyPerUnitE4 !== 10000 || !input.enabled)) throw new AppError("VALIDATION_ERROR", "CNY must stay enabled at a rate of 1.");
  // Freight remains USD in this stage; procurement retains the configured settlement currency.
  if (!input.enabled && (currency === "USD" || currency === await customerCurrency(db))) throw new AppError("VALIDATION_ERROR", "A settlement exchange rate cannot be disabled.");
  const mutationId = crypto.randomUUID(), updatedAt = Date.now();
  const values = { currency, ...input, version: input.version + 1, mutationId, source: "manual", updatedAt, updatedBy: actorId };
  const [saved] = await db.batch([
    input.version === 0
      ? db.insert(exchangeRates).values(values).onConflictDoNothing().returning()
      : db.update(exchangeRates).set(values).where(and(eq(exchangeRates.currency, currency), eq(exchangeRates.version, input.version))).returning(),
    db.insert(exchangeRateHistory).select(sql`SELECT currency, version, cny_per_unit_e4, enabled, source, updated_at, updated_by FROM exchange_rates WHERE mutation_id = ${mutationId}`),
    // Invalidate outstanding admin billing previews in the same transaction.
    db.update(productPricing).set({ version: sql`${productPricing.version} + 1`, cnyPerCurrencyE4: input.cnyPerUnitE4, updatedAt, updatedBy: actorId }).where(and(eq(productPricing.currency, currency), sql`EXISTS (SELECT 1 FROM exchange_rates WHERE mutation_id = ${mutationId})`)),
  ]);
  if (!saved.length) throw new AppError("CONFLICT", "Exchange rate changed. Reload before saving.", 409);
  return presentRate(saved[0]);
}
export async function exchangeHistory(db: Database, code: string, raw: unknown) {
  const currency = parseInput(exchangeCurrency, code);
  const { page } = parseInput(z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) }).strict(), raw);
  return { items: (await db.select().from(exchangeRateHistory).where(eq(exchangeRateHistory.currency, currency)).orderBy(desc(exchangeRateHistory.version)).limit(20).offset((page - 1) * 20)).map(presentRate), page, pageSize: 20 };
}
