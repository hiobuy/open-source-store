import { record, stringId } from "../src/domain/purchase";

const text = (value: unknown, limit: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null;
function mediaUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 4000) return null;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
export function publicProductContent(value: unknown) {
  const product = record(value), description = typeof product.description === "string" ? { original: product.description } : record(product.description);
  const original = typeof description.original === "string" ? description.original : null;
  const translated = typeof description.translated === "string" ? description.translated : null;
  const language = text(description.language, 40), seller = record(product.seller), videos = record(product.videos);
  return {
    attributes: Array.isArray(product.attributes) ? product.attributes.filter(item => item && typeof item === "object" && !Array.isArray(item)).map(item => {
      const attribute = record(item);
      const field = (key: string) => typeof attribute[key] === "string" ? attribute[key] : null;
      return { attribute_id: stringId(attribute.attribute_id), name: field("name"), value: field("value"), original_name: field("original_name"), original_value: field("original_value") };
    }) : [],
    description: { original, translated, language },
    shop: { id: stringId(seller.id), name: text(seller.name, 200), url: mediaUrl(seller.shop_url) },
    videos: { main: mediaUrl(videos.main), detail: mediaUrl(videos.detail) },
  };
}
