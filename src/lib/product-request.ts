function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Rebuild `/product/...` from catch-all params. vinext passes the raw
 * (still percent-encoded) segments while Next.js decodes them, so decode
 * first to avoid double-encoding (e.g. a pasted external URL).
 */
export function productPathFromSlug(slug: string[]) {
  return `/product/${slug.map((s) => encodeURIComponent(decodeSegment(s))).join("/")}`;
}

/**
 * Parse `/product/{platform}/{titleSlug}/{id}` (the title segment is optional).
 * The last segment may also be an encoded external product URL pasted into search.
 */
export function resolveProductRequest(pathname: string): {
  keyword: string;
  platform: string;
} {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "product") {
    return { keyword: "", platform: "" };
  }
  return {
    keyword: decodeSegment(parts[parts.length - 1]),
    platform: decodeSegment(parts[1]),
  };
}
