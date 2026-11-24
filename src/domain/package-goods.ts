export type PackageGoodsItem = { name: string; quantity: number; imageUrl: string | null };
export type PackageGoods = { items: PackageGoodsItem[]; valueCents: number | null; currency: string | null };

/** HioBuy package total_value is in major currency units, unlike procurement amount objects. */
export function readPackageGoods(raw: Record<string, unknown>): PackageGoods | null {
  if (!Array.isArray(raw.items) || !raw.items.length || raw.items.length > 500) return null;
  const items: PackageGoodsItem[] = [];
  for (const value of raw.items) {
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    if (typeof row.name !== "string" || !row.name.trim() || row.name.length > 2000 || !Number.isSafeInteger(row.quantity) || Number(row.quantity) <= 0) return null;
    let imageUrl: string | null = null;
    try { const url = new URL(String(row.image_url)); if (url.protocol === "https:" && !url.username && !url.password) imageUrl = url.href; } catch { /* Missing image is valid. */ }
    items.push({ name: row.name.trim(), quantity: Number(row.quantity), imageUrl });
  }
  const currency = typeof raw.currency === "string" && /^[A-Z]{3}$/.test(raw.currency) ? raw.currency : null;
  const amount = String(raw.total_value ?? ""), match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  const cents = match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : NaN;
  return { items, currency, valueCents: currency && Number.isSafeInteger(cents) ? cents : null };
}

export function savedPackageGoods(raw: string | null | undefined): PackageGoodsItem[] {
  try { const value = JSON.parse(raw ?? "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
}

export function packageGoodsPatch(local: { productName: string | null; quantity: number | null; declaredValueFen: number | null }, goods?: PackageGoods | null) {
  if (!goods) return {};
  const quantity = goods.items.reduce((sum, item) => sum + item.quantity, 0);
  return {
    fulfillmentItems: JSON.stringify(goods.items),
    ...(local.productName ? {} : { productName: goods.items.map(item => item.name).join(" / ") }),
    ...(local.quantity !== null || !Number.isSafeInteger(quantity) ? {} : { quantity }),
    ...(local.declaredValueFen !== null || goods.valueCents === null ? {} : { declaredValueFen: goods.valueCents, declaredCurrency: goods.currency! }),
  };
}
