/** All CNY/customer amounts use integer minor units; rates are CNY per customer unit × 10000. */
export type ProductPolicy = { currency: string; markupBps: number; fixedCnyCents: number; serviceBps: number; serviceCnyCents: number; cnyPerCurrencyE4: number; version: number; exchangeRateVersion?: number };
export type ProductCost = { itemId: string; name: string; sku: string; quantity: number; costCnyCents: number };
const limit = 999_999_999;
function integer(value: number, min = 0, max = limit) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error("Invalid pricing amount.");
  return value;
}
function rounded(numerator: bigint, denominator: bigint): number {
  return integer(Number((numerator + denominator / 2n) / denominator));
}
/** Shared merchandise-only display and checkout unit price, in CNY minor units. */
export function productSellingUnitCnyCents(costCnyCents: number, policy: Pick<ProductPolicy, "markupBps" | "fixedCnyCents">) {
  integer(costCnyCents, 1, 99_999_999); integer(policy.markupBps, 0, 10000); integer(policy.fixedCnyCents);
  return integer(costCnyCents + rounded(BigInt(costCnyCents) * BigInt(policy.markupBps), 10000n) + policy.fixedCnyCents);
}
export function productQuote(policy: ProductPolicy, items: ProductCost[], domesticCnyCents: number) {
  integer(policy.markupBps, 0, 10000); integer(policy.serviceBps, 0, 10000);
  integer(policy.fixedCnyCents); integer(policy.serviceCnyCents); integer(policy.cnyPerCurrencyE4, 1);
  if (!items.length || items.length > 50) throw new Error("Invalid product count.");
  const convert = (cny: number) => rounded(BigInt(cny) * 10000n, BigInt(policy.cnyPerCurrencyE4));
  const lines = items.map(item => {
    integer(item.quantity, 1, 999); integer(item.costCnyCents, 1, 99_999_999);
    const sellingUnitCnyCents = productSellingUnitCnyCents(item.costCnyCents, policy);
    const serviceUnitCnyCents = integer(rounded(BigInt(sellingUnitCnyCents) * BigInt(policy.serviceBps), 10000n) + policy.serviceCnyCents);
    const goodsCents = convert(integer(sellingUnitCnyCents * item.quantity));
    const serviceCents = convert(integer(serviceUnitCnyCents * item.quantity));
    return { ...item, sellingUnitCnyCents, serviceUnitCnyCents, goodsCents, serviceCents };
  });
  const goodsCents = integer(lines.reduce((sum, line) => sum + line.goodsCents, 0));
  const serviceCents = integer(lines.reduce((sum, line) => sum + line.serviceCents, 0));
  const shippingCents = convert(integer(domesticCnyCents));
  return { policy: { ...policy }, lines, domesticCnyCents, currency: policy.currency, goodsCents, serviceCents, shippingCents, totalCents: integer(goodsCents + serviceCents + shippingCents) };
}
export type ProductQuote = ReturnType<typeof productQuote>;
