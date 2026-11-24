import { z } from "zod";
import { clientImageIdPattern } from "./client-images";

export const couponCodeInput = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,32}$/).optional();
export const orderRemarkInput = z.string().trim().max(1000).default("");
export const orderAttachmentsInput = z.array(z.string().regex(clientImageIdPattern)).max(5).default([])
  .refine(ids => new Set(ids).size === ids.length, "Duplicate attachment upload IDs.");

export function purchaseCouponDiscount(coupon: { kind: string; discountValue: number; minimumCents: number; currency: string }, currency: string, amount: number) {
  if (coupon.currency !== currency || !Number.isSafeInteger(amount) || amount < coupon.minimumCents || amount <= 0 || !Number.isSafeInteger(coupon.discountValue) || coupon.discountValue <= 0) throw new Error("Coupon is not applicable to this order.");
  if (coupon.kind !== "fixed" && coupon.kind !== "percent" || coupon.kind === "percent" && coupon.discountValue > 10000) throw new Error("Invalid coupon configuration.");
  const discount = coupon.kind === "fixed" ? coupon.discountValue : Number((BigInt(amount) * BigInt(coupon.discountValue) + 5000n) / 10000n);
  return Math.min(amount, discount);
}
