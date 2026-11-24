import { and, count, eq, sql } from "drizzle-orm";
import type { Database } from "./db/client";
import { marketingCoupons, purchaseCouponRedemptions, procurementBills } from "./db/schema";
import type { ProductQuote } from "../src/domain/product-pricing";
import { purchaseCouponDiscount } from "../src/domain/purchase-options";
import { AppError } from "./errors";

export type CouponSnapshot = { id: string; code: string; version: number; discountCents: number };
export type DiscountedQuote = ProductQuote & { coupon?: CouponSnapshot; discountCents?: number; upstreamFeeCnyCents?: number };
export const unavailableCoupon = () => new AppError("COUPON_UNAVAILABLE", "Coupon is invalid, expired, exhausted or not applicable. Refresh the quote.", 409);
export async function applyPurchaseCoupon(db: Database, quote: DiscountedQuote, code?: string): Promise<DiscountedQuote> {
  const { coupon: _old, discountCents: _discount, ...base } = quote;
  const totalCents = quote.goodsCents + quote.serviceCents + quote.shippingCents;
  if (!code) return { ...base, totalCents, discountCents: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const [coupon] = await db.select().from(marketingCoupons).where(eq(marketingCoupons.code, code));
  if (!coupon?.enabled || coupon.from > today || coupon.to < today) throw unavailableCoupon();
  const [usage] = await db.select({ n: count() }).from(purchaseCouponRedemptions).where(and(eq(purchaseCouponRedemptions.couponId, coupon.id), sql`${purchaseCouponRedemptions.state} != 'released'`));
  if (usage.n >= coupon.usageLimit) throw unavailableCoupon();
  let discountCents: number;
  try { discountCents = purchaseCouponDiscount(coupon, quote.currency, totalCents); } catch { throw unavailableCoupon(); }
  return { ...base, totalCents: totalCents - discountCents, discountCents, coupon: { id: coupon.id, code: coupon.code, version: coupon.version, discountCents } };
}
/** A failed scalar subquery yields NULL and violates coupon_id NOT NULL: the whole D1 batch rolls back. */
export function reservePurchaseCoupon(db: Database, orderId: string, billId: string, quote: DiscountedQuote, now: number) {
  const coupon = quote.coupon!;
  return db.insert(purchaseCouponRedemptions).values({ orderId, billId, code: coupon.code, currency: quote.currency, discountCents: coupon.discountCents, state: "reserved", createdAt: now, updatedAt: now,
    couponId: sql`(SELECT c.id FROM marketing_coupons c WHERE c.id=${coupon.id} AND c.version=${coupon.version} AND c.enabled=1 AND c.currency=${quote.currency} AND c.starts_on<=date('now') AND c.ends_on>=date('now') AND (SELECT COUNT(*) FROM purchase_coupon_redemptions r WHERE r.coupon_id=c.id AND r.state!='released')<c.usage_limit)`,
  });
}
export function releasePurchaseCoupon(db: Database, billId: string) {
  return db.update(purchaseCouponRedemptions).set({ state: "released", updatedAt: Date.now() }).where(and(eq(purchaseCouponRedemptions.billId, billId), eq(purchaseCouponRedemptions.state, "reserved"), sql`EXISTS (SELECT 1 FROM ${procurementBills} WHERE id=${billId} AND status='void')`));
}
