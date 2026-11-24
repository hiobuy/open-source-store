import { parseGoodsExternalUrl, slugifyProductTitleForPath } from "@/lib/utils";
import { localizedText } from "./localized-text";
import type {
  ProcurementManualOrderForm,
  ProcurementManualPlatform,
  ProcurementProduct,
  ProcurementProductChannel,
  ProcurementProductVariant,
  ProcurementPurchaseQuote,
} from "./types";

export const manualPurchasePlatformLabels: Record<
  ProcurementManualPlatform,
  string
> = {
  jd: "JD",
  pinduoduo: "Pinduoduo",
  poizon: "Dewu (POIZON)",
};

export function purchaseProductTitle(
  product: ProcurementProduct,
  language: string,
) {
  return localizedText(product.title, language) || product.id;
}

const variantAttributeMetadata = new Set([
  "name",
  "value",
  "original_name",
  "original_value",
  "prop_id",
  "attribute_id",
  "language",
  "translated",
  "image",
]);

export function purchaseVariantLabel(variant: ProcurementProductVariant) {
  const labels = variant.attributes.flatMap((attribute) => {
    const name = attribute.name?.trim();
    const value = attribute.value?.trim();
    if (name && value) return [`${name}: ${value}`];
    return Object.entries(attribute).flatMap(([label, entry]) => {
      const option = entry?.trim();
      if (!option || variantAttributeMetadata.has(label)) return [];
      return [`${label}: ${option}`];
    });
  });
  return labels.join(" / ") || variant.skuId;
}

export function purchaseLoginHref(path: string) {
  return `/login?redirect=${encodeURIComponent(path)}`;
}

/** Query flag the fill-and-buy page reads to toast that a product could not be recognized. */
export const UNRECOGNIZED_PRODUCT_NOTICE = "unrecognized-product";
export const unrecognizedProductHref = `/fill-and-buy?notice=${UNRECOGNIZED_PRODUCT_NOTICE}`;

export function purchasePaymentHref(id: string) {
  return `/payment?id=${encodeURIComponent(id)}`;
}

export function purchaseOrderDetailHref(id: string) {
  return `/member-center/purchase-orders/${encodeURIComponent(id)}`;
}

export function purchaseProductHref(
  channel: ProcurementProductChannel,
  id: string,
  title = "",
) {
  const titlePart = slugifyProductTitleForPath(title);
  return `/product/${channel}/${titlePart ? `${encodeURIComponent(titlePart)}/` : ""}${encodeURIComponent(id)}`;
}

/**
 * 站外商品详情链接 → 站内商品详情页；解析失败则退回完整外链。
 */
export function getGoodsLink(detailUrl: string | undefined, title = "") {
  if (!detailUrl) return "#";
  if (detailUrl.startsWith("/")) return detailUrl;
  const parsed = parseGoodsExternalUrl(detailUrl);
  if (parsed?.num_iid) {
    return purchaseProductHref(parsed.api_type, parsed.num_iid, title);
  }
  if (/^https?:\/\//i.test(detailUrl)) return detailUrl;
  return `https:${detailUrl}`;
}

export const procurementCartChanged = "procurement:cart-changed";

interface CheckoutItem {
  productId: string;
  skuId: string;
  title: string;
  variant: string;
  image?: string;
  href: string;
}

export function purchaseManualCheckoutItems(form: ProcurementManualOrderForm) {
  return form.items.map((line, index) => ({
    productId: form.id,
    skuId: String(index),
    title: line.name,
    variant: line.specification,
    image: line.imageUrl || undefined,
    href: line.productUrl,
  }));
}

export function purchaseCheckoutItem(
  product: ProcurementProduct,
  skuId: string,
  language: string,
): CheckoutItem {
  const variant = product.variants.find((item) => item.skuId === skuId);
  return {
    productId: product.id,
    skuId,
    title: purchaseProductTitle(product, language),
    variant: variant ? purchaseVariantLabel(variant) : skuId,
    image: variant?.image ?? product.images[0],
    href: purchaseProductHref(product.channel, product.id),
  };
}

export interface CheckoutRemark {
  remarkText: string;
  remarkImages: string[];
  remarkImageIds?: string[];
}

const remarkUploadId =
  /^(?:tmp_)?\d{8}T\d{9}Z_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpg)$/i;

function checkoutItemForLine(
  items: CheckoutItem[],
  line: { name: string; sku: string },
  index: number,
) {
  const matches = items.filter((item) => item.skuId === line.sku);
  const matchingTitles = items.filter((item) => item.title === line.name);
  return (
    matches.find((item) => item.title === line.name) ??
    (matches.length === 1 ? matches[0] : undefined) ??
    (matchingTitles.length === 1 ? matchingTitles[0] : undefined) ??
    (items.length === 1 ? items[0] : items[index])
  );
}

export function purchaseQuoteLines(quote: ProcurementPurchaseQuote) {
  if (quote.groups?.length) {
    return quote.groups.flatMap((group) => group.quote.lines ?? []);
  }
  return quote.lines ?? [];
}

export function purchaseOrderRemarkItems(draft: QuotedCheckoutDraft) {
  const items: {
    productId: string;
    skuId: string;
    remark: string;
    attachmentUploadIds: string[];
  }[] = [];
  const stored = draft.items ?? [];
  let images = 0;
  for (const [index, line] of purchaseQuoteLines(draft.quote).entries()) {
    const item = checkoutItemForLine(stored, line, index);
    if (!item?.productId) continue;
    const note = draft.remarks?.[index];
    const remark = note?.remarkText.trim().slice(0, 1000) ?? "";
    const attachmentUploadIds: string[] = [];
    for (const id of note?.remarkImageIds ?? []) {
      if (!remarkUploadId.test(id) || attachmentUploadIds.length >= 5) continue;
      if (images >= 20) return { error: "too-many-images" as const };
      attachmentUploadIds.push(id);
      images += 1;
    }
    if (!remark && !attachmentUploadIds.length) continue;
    items.push({
      productId: item.productId,
      skuId: item.skuId,
      remark,
      attachmentUploadIds,
    });
  }
  return { items };
}

interface CheckoutDraftBase {
  attempted: boolean;
  sourcePath: string;
  remarks?: Record<number, CheckoutRemark>;
}

interface QuotedCheckoutDraft extends CheckoutDraftBase {
  form?: never;
  quote: ProcurementPurchaseQuote;
  items?: CheckoutItem[];
  channel?: ProcurementProductChannel;
}

interface ManualCheckoutDraft extends CheckoutDraftBase {
  form: ProcurementManualOrderForm;
  quote?: never;
}

type CheckoutDraft = QuotedCheckoutDraft | ManualCheckoutDraft;

export function readPurchaseDraft(id: string): CheckoutDraft | undefined {
  const value = sessionStorage.getItem(`purchase-checkout:${id}`);
  return value ? (JSON.parse(value) as CheckoutDraft) : undefined;
}

export function savePurchaseDraft(id: string, draft: CheckoutDraft) {
  sessionStorage.setItem(`purchase-checkout:${id}`, JSON.stringify(draft));
}

export function startPurchaseCheckout(
  quote: ProcurementPurchaseQuote,
  sourcePath: string,
  items?: CheckoutItem[],
  channel?: ProcurementProductChannel,
) {
  const id = crypto.randomUUID();
  savePurchaseDraft(id, {
    quote,
    attempted: false,
    sourcePath,
    items,
    channel,
  });
  return `/checkout?draft=${id}`;
}

export function startManualPurchaseCheckout(form: ProcurementManualOrderForm) {
  if (!readPurchaseDraft(form.id)) {
    savePurchaseDraft(form.id, {
      form,
      attempted: false,
      sourcePath: "/fill-and-buy",
    });
  }
  return `/checkout?draft=${form.id}`;
}
