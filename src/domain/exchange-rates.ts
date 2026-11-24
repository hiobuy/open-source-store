import { z } from "zod";
import { currencyCatalog } from "./locale";
export const exchangeCurrency = z.enum(currencyCatalog.map(c => c.code));
const legacyExchangeRateInput = z.object({
  cnyPerUnitE4: z.number().int().min(1).max(999999999),
  enabled: z.boolean(), version: z.number().int().min(0),
}).strict();
export function cnyToDisplayMinor(cnyMinor: number, cnyPerUnitE4: number) {
  if (!Number.isSafeInteger(cnyMinor) || cnyMinor < 0 || !Number.isSafeInteger(cnyPerUnitE4) || cnyPerUnitE4 <= 0) throw new Error("Invalid amount or exchange rate.");
  const value = Number((BigInt(cnyMinor) * 10000n + BigInt(cnyPerUnitE4) / 2n) / BigInt(cnyPerUnitE4));
  if (!Number.isSafeInteger(value)) throw new Error("Converted amount is too large.");
  return value;
}

// Keep persisted settlement snapshots in their original direction.
export function unitsPerCnyE8(cnyPerUnitE4: number) {
  if (!Number.isSafeInteger(cnyPerUnitE4) || cnyPerUnitE4 < 1) throw new Error("Invalid exchange rate.");
  return Number((1000000000000n + BigInt(cnyPerUnitE4) / 2n) / BigInt(cnyPerUnitE4));
}
export function cnyPerUnitFromE8(rate: number) {
  if (!Number.isSafeInteger(rate) || rate < 1) throw new Error("Invalid exchange rate.");
  return Number((1000000000000n + BigInt(rate) / 2n) / BigInt(rate));
}
export function formatCnyRate(rate: number) {
  return String(unitsPerCnyE8(rate) / 100000000);
}
const forwardExchangeRateInput = z.object({
  unitsPerCnyE8: z.number().int().min(1).max(1000000000000),
  enabled: z.boolean(), version: z.number().int().min(0),
}).strict().transform(({ unitsPerCnyE8, ...rest }) => ({ ...rest, cnyPerUnitE4: cnyPerUnitFromE8(unitsPerCnyE8) })).pipe(legacyExchangeRateInput);
export const exchangeRateInput = z.union([forwardExchangeRateInput, legacyExchangeRateInput]);
