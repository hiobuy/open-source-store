import { describe, expect, it } from "vitest";
import { cartDisplay, cartSnapshot } from "./cart-display";
const policy = { currency: "USD", markupBps: 1000, fixedCnyCents: 5, serviceBps: 600, serviceCnyCents: 100, cnyPerCurrencyE4: 72000, version: 1 };
describe("cart reference prices", () => {
  const source = { seller: { id: "shop", name: "Store", shop_url: "https://example.com", secret: "hidden" }, variants: [{ sku_id: "sku", price: { original_currency: "CNY", original_amount: 12.34, display_amount: 1.23, promotion_amount: 1 } }] };
  it("uses original SKU CNY price plus existing markup and fixed price, without service fees or currency conversion", () => {
    const snapshot = cartSnapshot(source, 123);
    expect(cartDisplay(snapshot, "sku", 3, policy)).toMatchObject({ unitPriceCents: 1362, subtotalCents: 4086, currency: "CNY", displayOnly: true, snapshotAt: 123 });
    expect(cartDisplay(snapshot, "sku", 3, { ...policy, markupBps: 0, fixedCnyCents: 0 }).unitPriceCents).toBe(1234);
    expect(JSON.stringify(cartDisplay(snapshot, "sku", 3, policy))).not.toMatch(/secret|skuPrices|markup/);
  });
  it("keeps missing, non-CNY, excessive and invalid prices null instead of guessing product-level prices", () => {
    for (const price of [{ original_currency: "USD", original_amount: 10 }, { original_currency: "CNY", original_amount: -1 }, { original_currency: "CNY", original_amount: 1.123 }, { original_currency: "CNY", original_amount: 1e20 }, { original_currency: "CNY", original_amount: "10" }]) {
      const snapshot = cartSnapshot({ price: source.variants[0].price, variants: [{ sku_id: "sku", price }] });
      expect(cartDisplay(snapshot, "sku", 1, policy)).toMatchObject({ unitPriceCents: null, subtotalCents: null, priceComplete: false });
    }
    expect(cartDisplay(cartSnapshot(source), "sku", 1, null).subtotalCents).toBeNull();
    expect(cartDisplay(cartSnapshot(source), "missing", 1, policy).subtotalCents).toBeNull();
  });
});
