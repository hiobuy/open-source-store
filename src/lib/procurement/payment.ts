export function parseProcurementAmount(
  value: string,
  allowZero = false,
): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const amount =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(amount) && (amount > 0 || allowZero)
    ? amount
    : null;
}

export function safeProcurementPaymentUrl(value: string | null): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

export function procurementAbsoluteUrl(path: string) {
  const url = new URL(path, window.location.origin);
  url.username = "";
  url.password = "";
  url.hash = "";
  return url.href;
}

export function procurementCurrentPageUrl() {
  return procurementAbsoluteUrl(
    `${window.location.pathname}${window.location.search}`,
  );
}
