import { productSellingUnitCnyCents, type ProductPolicy } from "./product-pricing";
import { record } from "./purchase";

function displayCents(amount: unknown, currency: unknown, policy: ProductPolicy | null) {
  if (!policy || currency !== "CNY" || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(amount * 100 - cents) > 0.00001) return null;
  try { return productSellingUnitCnyCents(cents, policy); } catch { return null; }
}
export function productDisplayPrice(value: unknown, policy: ProductPolicy | null) {
  const price = record(value);
  return {
    currency: "CNY" as const, displayOnly: true as const,
    unitPriceCents: displayCents(price.original_amount, price.original_currency, policy),
    promotionPriceCents: displayCents(price.promotion_amount, price.original_currency, policy),
  };
}
export function productDisplayTiers(value: unknown, policy: ProductPolicy | null) {
  if (!Array.isArray(value)) return [];
  return value.map(record)
    .filter(tier => Number.isSafeInteger(tier.min_quantity) && Number(tier.min_quantity) > 0 && tier.currency === "CNY")
    .map(tier => ({ minQuantity: Number(tier.min_quantity), unitPriceCents: displayCents(tier.price, tier.currency, policy), promotionPriceCents: displayCents(tier.promotion_price, tier.currency, policy) }))
    .sort((a, b) => a.minQuantity - b.minQuantity);
}
