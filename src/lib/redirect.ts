/** Auth flows may return only to a path within this storefront. */
export function safeRedirectPath(
  value: string | null | undefined,
  fallback = "/",
) {
  const path = value?.trim();
  return path &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !/[\\\u0000-\u001f]/.test(path)
    ? path
    : fallback;
}
