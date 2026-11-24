import { describe, expect, it } from "vitest";
import { productQuote, type ProductPolicy } from "./product-pricing";

const policy: ProductPolicy = { currency: "USD", markupBps: 1000, fixedCnyCents: 100, serviceBps: 500, serviceCnyCents: 50, cnyPerCurrencyE4: 70000, version: 1 };
const item = { itemId: "i", name: "Product", sku: "L", quantity: 3, costCnyCents: 1000 };
describe("product pricing snapshots", () => {
  it("applies percentage and per-item fixed fees before converting each line", () => {
    const result = productQuote(policy, [item], 700);
    expect(result).toMatchObject({ currency: "USD", goodsCents: 514, serviceCents: 47, shippingCents: 100, totalCents: 661 });
    expect(result.lines[0]).toMatchObject({ sellingUnitCnyCents: 1200, serviceUnitCnyCents: 110 });
    expect(result.policy).not.toBe(policy);
  });
  it("rounds half-up with integers, including small amounts", () => {
    const result = productQuote({ ...policy, markupBps: 5000, serviceBps: 0, fixedCnyCents: 0, serviceCnyCents: 0, cnyPerCurrencyE4: 10000 }, [{ ...item, quantity: 1, costCnyCents: 1 }], 0);
    expect(result.totalCents).toBe(2);
  });
  it("rejects missing rates, fractions, negative inputs and overflowing totals", () => {
    for (const rate of [0, -1, NaN, 7.2]) expect(() => productQuote({ ...policy, cnyPerCurrencyE4: rate }, [item], 0)).toThrow();
    expect(() => productQuote(policy, [{ ...item, quantity: 1.5 }], 0)).toThrow();
    expect(() => productQuote(policy, [item], -1)).toThrow();
    expect(() => productQuote(policy, [{ ...item, costCnyCents: 99999999, quantity: 999 }], 0)).toThrow();
  });
});
