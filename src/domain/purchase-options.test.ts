import { purchaseCreateInput } from "./purchase";
import { describe, expect, it } from "vitest";
import { purchaseCouponDiscount } from "./purchase-options";
describe("purchase coupon amounts", () => {
  const coupon = { kind: "percent", discountValue: 1000, minimumCents: 100, currency: "USD" };
  it("rounds percentage discounts in minor units and caps fixed discounts at payable amount", () => {
    expect(purchaseCouponDiscount(coupon, "USD", 105)).toBe(11);
    expect(purchaseCouponDiscount({ ...coupon, discountValue: 10000 }, "USD", 105)).toBe(105);
    expect(purchaseCouponDiscount({ ...coupon, kind: "fixed", discountValue: 1000 }, "USD", 105)).toBe(105);
  });
  it("rejects mismatched currency, thresholds and invalid discount configuration", () => {
    expect(() => purchaseCouponDiscount(coupon, "CNY", 200)).toThrow();
    expect(() => purchaseCouponDiscount(coupon, "USD", 99)).toThrow();
    expect(() => purchaseCouponDiscount({ ...coupon, discountValue: 10001 }, "USD", 200)).toThrow();
    expect(() => purchaseCouponDiscount({ ...coupon, kind: "other" }, "USD", 200)).toThrow();
  });
});

describe("SKU order options limits", () => {
  it("enforces per-SKU and combined attachment limits while retaining legacy request normalization", () => {
    const base={id:crypto.randomUUID(),quoteId:crypto.randomUUID()};
    expect(purchaseCreateInput.parse(base)).toEqual({...base,remark:"",attachmentUploadIds:[]});
    const images=Array.from({length:6},()=>`20261116T120000000Z_${crypto.randomUUID()}.png`);
    const items=Array.from({length:4},(_,i)=>({productId:`p${i}`,skuId:"s",attachmentUploadIds:images.slice(0,5)}));
    expect(purchaseCreateInput.safeParse({...base,items}).success).toBe(true);
    expect(purchaseCreateInput.safeParse({...base,items,attachmentUploadIds:[images[0]]}).success).toBe(false);
    expect(purchaseCreateInput.safeParse({...base,items:[{...items[0],attachmentUploadIds:images}]}).success).toBe(false);
    expect(purchaseCreateInput.safeParse({...base,items:[{...items[0],remark:"a".repeat(1001)}]}).success).toBe(false);
  });
});
