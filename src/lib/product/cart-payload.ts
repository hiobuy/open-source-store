import type { GoodsInfo, SkuItem } from "../client/services/goods-types";
import type { ImmediatePurchase } from "@/lib/client/services/checkout-types";
import type { PriceConvertOptions } from "@/lib/store/common";
export function getSkuPrice(sku: SkuItem | string | null | undefined): number {
  const p =
    typeof sku === "string"
      ? sku
      : (sku?.price ?? sku?.origin_price ?? sku?.sku_original_price);
  return typeof p === "string" ? parseFloat(p) || 0 : Number(p) || 0;
}
/** 根据总数量从阶梯价格中取对应的单价；仅一条阶梯时视为无阶梯价，由调用方用选中 SKU 的 price */
export function getTierPrice(
  totalQty: number,
  priceRangeList: {
    startQuantity: number;
    price: number;
  }[],
): number | null {
  if (!priceRangeList?.length || totalQty <= 0) return null;
  if (priceRangeList.length <= 1) return null;
  const sorted = [...priceRangeList]
    .filter(
      (r) =>
        r && typeof r.price === "number" && typeof r.startQuantity === "number",
    )
    .sort((a, b) => a.startQuantity - b.startQuantity);
  let tier = sorted[0];
  for (const t of sorted) {
    if (t.startQuantity <= totalQty) tier = t;
    else break;
  }
  return tier?.price ?? null;
}
/** 弹窗头部 SPU 单价：有阶梯价时按总数量匹配 startQuantity 区间，否则用 goodsInfo.price */
export function getSpuDisplayPrice(
  totalQty: number,
  priceRangeList: {
    startQuantity: number;
    price: number;
  }[],
  fallbackPrice: number,
): number {
  if (!priceRangeList?.length) return fallbackPrice;
  const sorted = [...priceRangeList]
    .filter(
      (r) =>
        r && typeof r.price === "number" && typeof r.startQuantity === "number",
    )
    .sort((a, b) => a.startQuantity - b.startQuantity);
  if (!sorted.length) return fallbackPrice;
  let tier = sorted[0];
  if (totalQty <= 0) return tier.price;
  for (const t of sorted) {
    if (t.startQuantity <= totalQty) tier = t;
    else break;
  }
  return tier.price;
}
/** 重组 sku 参数为购物车接口格式 */
export function reformatSkusByCart(
  quantityMap: Record<string, number>,
  skuList: SkuItem[],
  productInfo: GoodsInfo,
  freightFee: number,
  priceConvert: (v: number | string, o?: PriceConvertOptions) => string,
  shopName: string,
  quantity: number,
  isConvert: boolean = true,
): Array<
  Omit<ImmediatePurchase["skus"][number], "freight_fee"> & {
    freight_fee?: number | string;
  }
> {
  const skus: Array<
    Omit<ImmediatePurchase["skus"][number], "freight_fee"> & {
      freight_fee?: number | string;
    }
  > = [];
  const propsImg = productInfo?.props_img ?? {};
  if (
    Object.values(quantityMap).some(
      (value) => !Number.isSafeInteger(value) || value < 0,
    )
  )
    return [];
  const priceRangeList =
    productInfo?.priceRangeList ??
    productInfo?.price_pange_list?.priceRangeList ??
    [];
  const totalQty = Object.values(quantityMap).reduce(
    (s, q) => s + (q > 0 ? q : 0),
    0,
  );
  const tierPrice = getTierPrice(totalQty, priceRangeList);
  for (const [key, quantity] of Object.entries(quantityMap)) {
    if (quantity <= 0) continue;
    const sku = skuList.find(
      (s) =>
        String(s.sku_id) === key ||
        String(s.spec_id) === key ||
        s.properties === key,
    );
    if (!sku || (sku.quantity != null && quantity > sku.quantity)) return [];
    let specs: {
      label: string;
      value: string;
    }[] = [];
    let specs_cn: {
      label: string;
      value: string;
    }[] = [];
    if (sku.properties) {
      const skuProperties = sku.properties.split(";");
      specs = (productInfo.props_list ?? []).map((p) => {
        const checkedItem = p.children.find((c) =>
          skuProperties.includes(`${p.id}:${c.id}`),
        );
        return { label: p.name, value: checkedItem ? checkedItem.name : "" };
      });
    }
    if (sku.properties_cn) {
      const skuPropertiesCn = sku.properties_cn.split(";");
      specs_cn = (productInfo.props_list_cn ?? []).map((p) => {
        const checkedItem = p.children.find((c) =>
          skuPropertiesCn.includes(`${p.id}:${c.id}`),
        );
        return { label: p.name, value: checkedItem ? checkedItem.name : "" };
      });
    }
    // 无规格时后端要求 specs 必填，使用默认值
    if (specs.length === 0) {
      specs = [{ label: "Specifications", value: "Default" }];
      specs_cn = [{ label: "规格", value: "默认" }];
    }
    let sku_img = productInfo?.pic_url ?? "";
    if (propsImg && Object.keys(propsImg).length > 0) {
      const propKeys = Object.keys(propsImg).filter((propKey) =>
        key.includes(propKey),
      );
      const matchedPropKey = propKeys.reduce(
        (a, b) => (a.length > b.length ? a : b),
        "",
      );
      sku_img = matchedPropKey ? (propsImg[matchedPropKey] ?? "") : sku_img;
    }
    const sku_info = {
      shop_id: productInfo?.shop_id + "",
      shop_name: shopName || productInfo?.nick,
      sku_img,
      sku_id: sku.sku_id,
      min_order_quantity: productInfo?.min_order_quantity ?? 1,
      batch_number: productInfo?.batch_number ?? 1,
      imgs: productInfo?.item_imgs ?? [],
      specs,
      specs_cn,
      spec_id: sku.spec_id ?? "0",
      priceRangeList,
    };
    const unitPrice = tierPrice != null ? tierPrice : getSkuPrice(sku);
    skus.push({
      price: isConvert
        ? priceConvert(unitPrice, {
            needFormat: false,
            showSymbol: false,
          })
        : unitPrice,
      freight_fee: isConvert
        ? priceConvert(freightFee, {
            needFormat: false,
            showSymbol: false,
          })
        : freightFee,
      platform_sku: sku.sku_id,
      quantity,
      sku_info,
    });
  }
  // 无 sku
  if (
    !skus.length &&
    !skuList.length &&
    !productInfo.props_list?.length &&
    Number.isSafeInteger(quantity) &&
    quantity > 0
  ) {
    skus.push({
      price: isConvert
        ? priceConvert(productInfo.price ?? 0, {
            needFormat: false,
            showSymbol: false,
          })
        : productInfo.price,
      freight_fee: isConvert
        ? priceConvert(freightFee, {
            needFormat: false,
            showSymbol: false,
          })
        : freightFee,
      platform_sku: productInfo.num_iid,
      quantity,
      sku_info: {
        shop_id: productInfo?.shop_id + "",
        shop_name: shopName || productInfo?.nick,
        sku_img: productInfo?.pic_url ?? "",
        imgs: productInfo?.item_imgs ?? [],
        specs: [{ label: "Specifications", value: "Default" }],
        specs_cn: [{ label: "规格", value: "默认" }],
        spec_id: "0",
      },
    });
  }
  return skus;
}
