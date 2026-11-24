/** 修复图片 URL */
export function fixImageUrl(url: string | undefined): string {
  if (!url || typeof url !== "string") return "";
  return url.replace(/ /g, "%20").trim();
}
