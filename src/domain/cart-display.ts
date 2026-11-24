import { productQuote, type ProductPolicy } from "./product-pricing";
import { record, stringId } from "./purchase";

export type CartShop = { id: string | null; name: string | null; url: string | null };
export type CartSnapshot = { shop: CartShop; skuPrices: Record<string, number | null>; capturedAt: number };
const url = (value: unknown) => {
  if (typeof value !== "string") return null;
  try { const parsed = new URL(value); return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : null; } catch { return null; }
};
function cnyCents(value: unknown) {
  const price = record(value), amount = price.original_amount;
  if (price.original_currency !== "CNY" || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 99_999_999 && Math.abs(amount * 100 - cents) < 0.00001 ? cents : null;
}
/** Internal snapshot only: raw costs must never be returned to a customer. */
export function cartSnapshot(value: unknown, capturedAt = Date.now()): CartSnapshot {
  const product = record(value), seller = record(product.seller);
  return {
    shop: { id: stringId(seller.id), name: typeof seller.name === "string" ? seller.name.slice(0, 200) : null, url: url(seller.shop_url) },
    skuPrices: Object.fromEntries((Array.isArray(product.variants) ? product.variants : []).map(value => {
      const variant = record(value); return [stringId(variant.sku_id), cnyCents(variant.price)];
    }).filter(([id]) => id !== null)),
    capturedAt,
  };
}
export function cartDisplay(snapshot: CartSnapshot | undefined, skuId: string, quantity: number, policy: ProductPolicy | null) {
  let unitPriceCents: number | null = null, subtotalCents: number | null = null;
  const cost = snapshot?.skuPrices[skuId];
  if (policy && cost != null) {
    try {
      const quote = productQuote({ ...policy, currency: "CNY", cnyPerCurrencyE4: 10000, serviceBps: 0, serviceCnyCents: 0 }, [{ itemId: "display", name: "", sku: skuId, quantity, costCnyCents: cost }], 0);
      unitPriceCents = quote.lines[0].sellingUnitCnyCents;
      subtotalCents = quote.goodsCents;
    } catch { /* Missing/invalid prices are not zero-price goods. */ }
  }
  return { shop: snapshot?.shop ?? { id: null, name: null, url: null }, currency: "CNY" as const, displayOnly: true as const,
    unitPriceCents, subtotalCents, priceComplete: subtotalCents !== null, snapshotAt: snapshot?.capturedAt ?? null };
}
