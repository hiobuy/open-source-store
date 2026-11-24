import { afterEach, describe, expect, it, vi } from "vitest";
import { publicProductDetail, queryProducts } from "./purchase-products";
import { productDisplayPrice, productDisplayTiers } from "../src/domain/product-display-pricing";
import { clientEndpoints } from "./client-api/catalog";

const policy = { currency: "USD", markupBps: 1000, fixedCnyCents: 50, serviceBps: 600, serviceCnyCents: 99, cnyPerCurrencyE4: 72000, version: 1 };
const raw = { id: "p", channel: "1688", min_order_quantity: 2, order_quantity_multiple: 3,
  price: { original_currency: "CNY", original_amount: 10, promotion_amount: 9, display_currency: "USD", display_amount: 0.01 },
  price_tiers: [{ min_quantity: 10, price: 9, promotion_price: 8, currency: "CNY" }, { min_quantity: 2, price: 10, currency: "CNY" }],
  variants: [{ sku_id: "a", price: { original_currency: "CNY", original_amount: 12.34 } }, { sku_id: "b" }],
  seller: { secret: "private" }, metadata: { cost: 1000 },
};
afterEach(() => vi.unstubAllGlobals());
describe("customer product detail prices", () => {
  it("marks up product, SKU and sorted tier prices using CNY minor units without fees or FX", () => {
    const detail = publicProductDetail(raw, "1688", policy);
    expect(detail.price).toEqual({ currency: "CNY", displayOnly: true, unitPriceCents: 1150, promotionPriceCents: 1040 });
    expect(detail.variants[0].price.unitPriceCents).toBe(1407);
    expect(detail.variants[1].price.unitPriceCents).toBeNull();
    expect(detail.priceTiers).toEqual([{ minQuantity: 2, unitPriceCents: 1150, promotionPriceCents: null }, { minQuantity: 10, unitPriceCents: 1040, promotionPriceCents: 930 }]);
    expect(detail.orderQuantityMultiple).toBe(3); expect(detail.minOrderQuantity).toBe(2); expect(detail.pricing).toBe("preview_required");
    expect(JSON.stringify(detail)).not.toMatch(/original_amount|display_amount|markupBps|fixedCnyCents|metadata|seller|"cost"/);
  });
  it("does not expose costs when policy is missing, and rejects non-CNY or malformed amounts", () => {
    const detail = publicProductDetail(raw, "1688", null);
    expect(detail.price.unitPriceCents).toBeNull(); expect(detail.priceTiers.every(t => t.unitPriceCents === null)).toBe(true);
    for (const amount of [-1, 0, NaN, Infinity, 1.234, 1e20, "10"]) expect(productDisplayPrice({ original_currency: "CNY", original_amount: amount }, policy).unitPriceCents).toBeNull();
    expect(productDisplayPrice({ original_currency: "USD", original_amount: 10 }, policy).unitPriceCents).toBeNull();
    expect(productDisplayTiers([{ min_quantity: 0, price: 10, currency: "CNY" }, { min_quantity: 1.5, price: 10, currency: "CNY" }, { min_quantity: 1, price: 10, currency: "USD" }], policy)).toEqual([]);
    expect(publicProductDetail({ id: "p" }, "weidian", policy)).toMatchObject({ priceTiers: [], minOrderQuantity: null, orderQuantityMultiple: null });
  });
  it("returns only valid positive integer order multiples without inventing a default", () => {
    for (const multiple of [undefined, null, 0, -1, 1.5, "2", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(publicProductDetail({ ...raw, order_quantity_multiple: multiple }, "1688", policy).orderQuantityMultiple).toBeNull();
    }
    expect(publicProductDetail({ ...raw, order_quantity_multiple: 1 }, "1688", policy).orderQuantityMultiple).toBe(1);
  });
  it("applies current markup changes without applying an exchange rate", () => {
    expect(publicProductDetail(raw, "1688", { ...policy, cnyPerCurrencyE4: 0 }).price).toEqual(publicProductDetail(raw, "1688", policy).price);
    expect(publicProductDetail(raw, "1688", { ...policy, markupBps: 0, fixedCnyCents: 0 }).price.unitPriceCents).toBe(1000);
  });
  it("returns the same safe product-level price for all three search operations, detail and parse", async () => {
    const fetcher = vi.fn(async () => Response.json({ product: raw, items: [raw], page: 1, page_size: 1, total: 1 }));
    vi.stubGlobal("fetch", fetcher);
    for (const operation of ["detail", "parse"] as const) {
      const result = await queryProducts("test-only-token", operation, { channel: "1688", id: "p" }, policy);
      expect(result).toMatchObject({ product: { orderQuantityMultiple: 3, price: { unitPriceCents: 1150 }, priceTiers: [{ minQuantity: 2 }, { minQuantity: 10 }] } });
    }
    for (const [operation, path, input] of [
      ["search", "/api/products/search", { keyword: "test" }],
      ["sellerSearch", "/api/products/seller/search", { seller_open_id: "shop" }],
      ["imageSearch", "/api/products/search-by-image", { image_id: "image" }],
    ] as const) {
      const result = await queryProducts("test-only-token", operation, { channel: "1688", ...input }, policy);
      expect(result).toMatchObject({ items: [{ price: { currency: "CNY", displayOnly: true, unitPriceCents: 1150, promotionPriceCents: 1040 }, pricing: "preview_required" }], page: 1, pageSize: 1, total: 1 });
      expect(JSON.stringify(result)).not.toMatch(/original_amount|display_amount|markupBps|fixedCnyCents|seller|metadata/);
      expect(JSON.stringify(clientEndpoints.find(endpoint => endpoint.path === path)?.response)).toContain("promotionPriceCents");
    }
    expect(fetcher).toHaveBeenCalledTimes(5);
    for (const path of ["/api/products/detail", "/api/products/parse"]) {
      const schema = JSON.stringify(clientEndpoints.find(endpoint => endpoint.path === path)?.response);
      expect(schema).toContain("orderQuantityMultiple"); expect(schema).toContain("priceTiers"); expect(schema).toContain("promotionPriceCents");
    }
  });
});
