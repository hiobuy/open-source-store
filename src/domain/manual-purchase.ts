import { z } from "zod";
import { record, stringId } from "./purchase";
import { productQuote, type ProductPolicy } from "./product-pricing";

const webUrl = z.string().url().max(2048).refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Use an HTTPS URL without credentials.");
const cents = z.number().int().min(0).max(99_999_999);
export const manualPurchaseInput = z.object({
  id: z.string().uuid(), sourcePlatform: z.enum(["jd", "pinduoduo", "poizon"]),
  sellerName: z.string().trim().min(1).max(200), domesticShippingCents: cents,
  remark: z.string().trim().max(1000).default(""),
  items: z.array(z.object({
    productUrl: webUrl, name: z.string().trim().min(1).max(500),
    specification: z.string().trim().min(1).max(500), unitPriceCents: cents.min(1),
    quantity: z.number().int().min(1).max(999), imageUrl: webUrl.nullable().default(null),
    remark: z.string().trim().max(1000).default(""),
  }).strict()).min(1).max(20),
}).strict().refine(v => v.items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, v.domesticShippingCents) <= 999_999_999, "Purchase total is too large.");
export type ManualPurchaseInput = z.infer<typeof manualPurchaseInput>;
export function manualRequest(input: ManualPurchaseInput) {
  return { channel: "manual", external_order_id: input.id, source_platform: input.sourcePlatform,
    seller_name: input.sellerName, domestic_shipping_fee: input.domesticShippingCents,
    currency: "CNY", monetary_unit: "CNY_minor", response_format: "standard", remark: input.remark,
    items: input.items.map((item, index) => ({ item_ref: String(index), product_url: item.productUrl,
      product_name: item.name, specification: item.specification, unit_price: item.unitPriceCents,
      quantity: item.quantity, product_image: item.imageUrl, remark: item.remark })) };
}
/** Only a complete warehouse response can determine the customer bill. */
export function priceManualPurchase(input: ManualPurchaseInput, data: Record<string, unknown>, policy: ProductPolicy) {
  const fail = () => { throw new Error("Manual purchase amounts or item mappings require review."); };
  const amount = (value: unknown): number => {
    const money = record(value);
    if (money.currency !== "CNY" || !Number.isSafeInteger(money.amount) || Number(money.amount) < 0 || Number(money.amount) > 999_999_999) return fail();
    return Number(money.amount);
  };
  if (data.success !== true || data.channel !== "manual" || data.external_order_id !== input.id || data.source_platform !== input.sourcePlatform || data.seller_name !== input.sellerName || data.currency !== "CNY" || data.monetary_unit !== "CNY_minor" || !stringId(data.order_id) || !Array.isArray(data.failed_offers) || data.failed_offers.length || !Array.isArray(data.order_list) || data.order_list.length !== 1) fail();
  const order = record((data.order_list as unknown[])[0]), lines = Array.isArray(order.lines) ? order.lines.map(record) : [];
  if (stringId(order.order_id) !== stringId(data.order_id) || lines.length !== input.items.length || new Set(lines.map(l => stringId(l.sub_order_id))).size !== lines.length) fail();
  const items = input.items.map((item, index) => {
    const matched = lines.filter(l => l.item_ref === String(index));
    if (matched.length !== 1 || !stringId(matched[0].sub_order_id) || matched[0].quantity !== item.quantity) return fail();
    const cost = amount(matched[0].unit_price);
    if (cost < 1 || amount(matched[0].line_total) !== cost * item.quantity) return fail();
    return { itemId: String(index), name: item.name, sku: item.specification, quantity: item.quantity, costCnyCents: cost };
  });
  const total = record(data.total), goods = amount(total.merchandise), shipping = amount(total.shipping), fee = amount(total.procurement_fee), payment = amount(total.payment);
  if (goods !== items.reduce((sum, i) => sum + i.costCnyCents * i.quantity, 0) || payment !== goods + shipping + fee || amount(order.shipping) !== shipping) fail();
  const quote = productQuote(policy, items, shipping);
  const feeCustomer = Number((BigInt(fee) * 10000n + BigInt(policy.cnyPerCurrencyE4) / 2n) / BigInt(policy.cnyPerCurrencyE4));
  if (!Number.isSafeInteger(feeCustomer) || quote.totalCents + feeCustomer > 999_999_999) fail();
  quote.serviceCents += feeCustomer; quote.totalCents += feeCustomer; quote.lines[0].serviceCents += feeCustomer;
  return { mappings: lines.map(l=>({ itemRef: String(l.item_ref), subOrderId: stringId(l.sub_order_id)! })), quote: { ...quote, upstreamFeeCnyCents: fee, upstreamFeeCents: feeCustomer }, goods, shipping, fee, payment, remoteId: stringId(data.order_id)! };
}

export const manualCartVersion = z.object({ version: z.number().int().positive() }).strict();
export const manualCartUpdate = z.object({ version: z.number().int().positive(), form: manualPurchaseInput }).strict();
