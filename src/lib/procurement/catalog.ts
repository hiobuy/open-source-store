import type { ProcurementProductChannel } from "./types";

export function procurementChannel(
  platform: string | number | undefined,
): ProcurementProductChannel | undefined {
  const value = String(platform ?? "")
    .trim()
    .toLowerCase();
  if (value === "1688" || value === "taobao" || value === "weidian") {
    return value;
  }
}

/** Platforms whose shop listings `products/seller/search` supports. */
export function procurementShopBrowsable(
  channel: ProcurementProductChannel | undefined,
): channel is "1688" | "weidian" {
  return channel === "1688" || channel === "weidian";
}

export function procurementShopPath(
  channel: string,
  shopId: string,
  name?: string | null,
  listingShopId?: string,
) {
  const params = new URLSearchParams({ platform: channel, shop_id: shopId });
  if (name) params.set("shop_name", name);
  if (listingShopId && listingShopId !== shopId)
    params.set("listing_shop_id", listingShopId);
  return `/shop?${params}`;
}
