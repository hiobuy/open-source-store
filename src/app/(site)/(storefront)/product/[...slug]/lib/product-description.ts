const blockedTag =
  /<\/?(?:script|iframe|object|embed|link|meta|base|form|input|button|textarea|style)\b[^>]*>/gi;
const quotedAttribute = /(?:"[^"]*"|'[^']*'|[^\s>]+)/;

/** Keep upstream product HTML readable while dropping executable markup. */
export function sanitizeProductDescription(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(blockedTag, "")
    .replace(new RegExp(String.raw`\s+on[a-z]+\s*=\s*${quotedAttribute.source}`, "gi"), "")
    .replace(
      new RegExp(
        String.raw`\s(?:href|src|xlink:href)\s*=\s*(["'])\s*javascript:[^"']*\1`,
        "gi",
      ),
      "",
    )
    .replace(/<img\b([^>]*?)\/?>/gi, (_tag, attrs: string) => {
      const clean = attrs.replace(
        new RegExp(String.raw`\sreferrerpolicy\s*=\s*${quotedAttribute.source}`, "gi"),
        "",
      );
      return `<img${clean} referrerpolicy="no-referrer">`;
    });
}
