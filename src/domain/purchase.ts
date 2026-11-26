import { couponCodeInput, orderRemarkInput, orderAttachmentsInput } from "./purchase-options";
import { z } from "zod";
import { productQuote, type ProductPolicy } from "./product-pricing";

export const purchaseChannel = z.enum(["1688", "taobao", "weidian"]);
const identifier = z.string().trim().min(1).max(200);
export { productSearchInput } from "./product-search";
export const productDetailInput = z.object({ channel: purchaseChannel, id: identifier, language: z.string().max(20).default("en") }).strict();
export const productParseInput = z.object({ url: z.string().url().max(2000), language: z.string().max(20).default("en") }).strict();
export const purchasePreviewInput = z.object({ couponCode: couponCodeInput, channel: purchaseChannel, lines: z.array(z.object({ id: identifier, spec_id: identifier, quantity: z.number().int().min(1).max(999) }).strict()).min(1).max(50) }).strict().refine(v => new Set(v.lines.map(l => `${l.id}:${l.spec_id}`)).size === v.lines.length, "Combine duplicate SKUs into one line.");
const purchaseItemOptionsInput = z.object({ productId: identifier, skuId: identifier, remark: orderRemarkInput, attachmentUploadIds: orderAttachmentsInput }).strict();
export const purchaseCreateInput = z.object({ id: z.string().uuid(), quoteId: z.string().uuid(), remark: orderRemarkInput, attachmentUploadIds: orderAttachmentsInput, couponCode: couponCodeInput, items: z.array(purchaseItemOptionsInput).max(50).optional() }).strict()
  .refine(v => new Set((v.items ?? []).map(i => JSON.stringify([i.productId, i.skuId]))).size === (v.items?.length ?? 0), "Duplicate SKU options.")
  .refine(v => v.attachmentUploadIds.length + (v.items ?? []).reduce((n, i) => n + i.attachmentUploadIds.length, 0) <= 20, "Maximum 20 attachments per order.");
export const purchasePaymentInput = z.object({confirm:z.literal(true),billVersion:z.number().int().positive().optional(),amountCents:z.number().int().min(0).max(999999999).optional()}).strict();
export const purchaseActionInput = z.object({ confirm: z.literal(true), reason: z.string().trim().min(2).max(500).optional(), code:z.string().trim().max(40).optional(), maxCostCnyCents:z.number().int().min(0).max(999999999).optional() }).strict();
export type PurchaseInput = z.infer<typeof purchasePreviewInput>;
export function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
const purchaseTimestamp = z.iso.datetime({ local: true, offset: true });

/** Standard purchase detail may confirm payment with order.times.paid_at alone. */
export function purchaseDetailPayment(detail: Record<string, unknown>): "paid" | "paid_at" | "conflict" | "unconfirmed" {
  const order = record(detail.order);
  const status = String(order.payment_status ?? detail.payment_status ?? "").trim().toLowerCase();
  if (status === "paid" || status === "success") return "paid";
  const paidAt = record(order.times).paid_at;
  if (typeof paidAt !== "string" || !purchaseTimestamp.safeParse(paidAt.trim().replace(" ", "T")).success) return "unconfirmed";
  return status ? "conflict" : "paid_at";
}
export function stringId(value: unknown): string | null { return typeof value === "string" && value.length > 0 ? value : typeof value === "number" && Number.isSafeInteger(value) ? String(value) : null; }
function minor(value: unknown) { const m = record(value); if (m.currency !== "CNY" || !Number.isSafeInteger(m.amount) || Number(m.amount) < 0) throw new Error("HioBuy did not return a confirmed CNY amount."); return Number(m.amount); }
/** Prices come only from a validated standard preview, never product yuan fields or the browser. */
export function pricePurchase(input: PurchaseInput, raw: Record<string, unknown>, policy: ProductPolicy) {
  if (raw.success !== true || raw.channel !== input.channel || raw.monetary_unit !== "CNY_minor" || !Array.isArray(raw.unavailable_lines) || raw.unavailable_lines.length || !Array.isArray(raw.sellers) || raw.sellers.length !== 1) throw new Error("Preview must contain available items from exactly one seller.");
  const seller = record(raw.sellers[0]);
  if ((!stringId(seller.seller_id) && new Set(input.lines.map(l=>l.id)).size !== 1) || !Array.isArray(seller.lines) || seller.lines.length !== input.lines.length) throw new Error("Seller or line verification failed.");
  const lines = input.lines.map((line, index) => {
    const matches = (seller.lines as unknown[]).map(record).filter(l => stringId(l.offer_id) === line.id && stringId(l.spec_id) === line.spec_id);
    if (matches.length !== 1 || matches[0].quantity !== line.quantity) throw new Error("Preview lines do not match the request.");
    const cost = minor(matches[0].unit_price);
    if (cost <= 0 || minor(matches[0].line_total) !== cost * line.quantity) throw new Error("Unsupported line pricing; ask an operator to review.");
    return { itemId: String(index), name: line.id, sku: line.spec_id, quantity: line.quantity, costCnyCents: cost };
  });
  const total = record(raw.total), merchandise = minor(total.merchandise), shipping = minor(total.shipping), payment = minor(total.payment);
  if (lines.reduce((n,l)=>n+l.quantity*l.costCnyCents,0) !== merchandise || payment < merchandise+shipping) throw new Error("Preview totals do not reconcile.");
  // Include any explicit upstream fee already in payment, without adding a guessed gateway percentage.
  const quote = productQuote(policy, lines, shipping);
  const upstreamFeeCnyCents = payment-merchandise-shipping;
  const upstreamFeeCents = Number((BigInt(upstreamFeeCnyCents)*10000n+BigInt(policy.cnyPerCurrencyE4)/2n)/BigInt(policy.cnyPerCurrencyE4));
  if(!Number.isSafeInteger(upstreamFeeCents)||quote.totalCents+upstreamFeeCents>999999999)throw new Error("Purchase total is too large.");
  quote.serviceCents+=upstreamFeeCents;quote.totalCents+=upstreamFeeCents;
  quote.lines[0].serviceCents+=upstreamFeeCents;
  if (input.channel === "weidian" && !stringId(raw.preview_id)) throw new Error("Weidian preview id is missing.");
  return { quote:{...quote,upstreamFeeCnyCents,upstreamFeeCents}, costCnyCents: payment, sellerId: stringId(seller.seller_id), upstreamFeeCnyCents };
}
export function customerPurchaseQuote(quote: ReturnType<typeof productQuote> & { upstreamFeeCnyCents?: number; discountCents?: number; coupon?: {code:string} }) {
  const goods = quote.lines.reduce((sum, line) => sum + line.sellingUnitCnyCents * line.quantity, 0);
  const service = quote.lines.reduce((sum, line) => sum + line.serviceUnitCnyCents * line.quantity, 0) + (quote.upstreamFeeCnyCents ?? 0);
  const discountCents = quote.discountCents ?? 0;
  const discountCnyCents = Math.min(goods + service + quote.domesticCnyCents, Number((BigInt(discountCents) * BigInt(quote.policy.cnyPerCurrencyE4) + 5000n) / 10000n));
  const referencePrice = { discountCents: discountCnyCents, currency: "CNY" as const, displayOnly: true, goodsCents: goods, serviceCents: service, shippingCents: quote.domesticCnyCents, totalCents: goods + service + quote.domesticCnyCents - discountCnyCents };
  return { referencePrice, discountCents, couponCode: quote.coupon?.code ?? null, currency: quote.currency, goodsCents: quote.goodsCents, serviceCents: quote.serviceCents, shippingCents: quote.shippingCents, totalCents: quote.totalCents, lines: quote.lines.map(({ name, sku, quantity, goodsCents, serviceCents })=>({ name, sku, quantity, goodsCents, serviceCents })) };
}
