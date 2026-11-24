import { couponCodeInput } from "./purchase-options";
import { clientImageIdPattern } from "./client-images";
import { z } from "zod";
import { purchaseChannel } from "./purchase";

const identifier = z.string().trim().min(1).max(200);
const paging = { page: z.number().int().min(1).max(400).default(1), page_size: z.number().int().min(1).max(50).default(20), language: z.string().max(20).default("en") };
export const favoriteInput = z.object({ channel: purchaseChannel, productId: identifier }).strict();
export const cartInput = favoriteInput.extend({ skuId: identifier, quantity: z.number().int().min(1).max(999) }).strict();
export const cartUpdateInput = z.object({ quantity: z.number().int().min(1).max(999), version: z.number().int().positive() }).strict();
export const cartPreviewInput = z.object({ couponCode: couponCodeInput, items: z.array(z.object({ id: z.string().uuid(), type: z.enum(["standard", "manual"]).default("standard"), version: z.number().int().positive() }).strict()).min(1).max(50) }).strict().refine(v => new Set(v.items.map(i => `${i.type}:${i.id}`)).size === v.items.length, "Duplicate cart items.");
export const cartCheckoutInput = z.object({ id: z.string().uuid(), previewId: z.string().uuid(), confirm: z.literal(true) }).strict();
export const shoppingPageInput = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) }).strict();
export const sellerSearchInput = z.object({ channel: z.enum(["1688", "weidian"]), seller_open_id: identifier.optional(), shop_id: identifier.optional(), keyword: z.string().trim().max(120).optional(), ...paging }).strict().refine(v => v.channel === "1688" ? !!v.seller_open_id : !!v.shop_id, "1688 requires seller_open_id; Weidian requires shop_id.");
const publicImageUrl = z.string().url().max(2000).refine(value => {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  const host = url.hostname.toLowerCase();
  return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && host.includes(".") && !/^[\d.]+$/.test(host) && !host.includes(":") && !/(^|\.)(localhost|local|internal|test|invalid)$/.test(host);
}, "Use a public HTTPS image URL.");
const imageBase64 = z.string().min(4).max(4_194_350).refine(value => {
  const raw = value.replace(/^data:image\/(jpeg|png|gif);base64,/, "");
  return raw.length <= 4_194_304 && raw.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(raw);
}, "Use JPEG/PNG/GIF base64 up to 3 MB.");
export const imageSearchInput = z.object({ channel: purchaseChannel, image_id: identifier.optional(), image_url: publicImageUrl.optional(), image_base64: imageBase64.optional(), uploadId: z.string().regex(clientImageIdPattern).optional(), keyword: z.string().trim().max(120).optional(), ...paging }).strict()
  .refine(v => [v.image_id, v.image_url, v.image_base64, v.uploadId].filter(Boolean).length === 1, "Provide exactly one image source.")
  .refine(v => v.channel !== "weidian" || !!v.image_url || !!v.uploadId, "Weidian requires image_url or uploadId.");
