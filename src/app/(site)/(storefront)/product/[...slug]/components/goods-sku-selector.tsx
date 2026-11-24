/**
 * 代购商品 SKU 选择器组件
 * 支持 Color 等单选规格、Size 批量数量
 */
"use client";
import { useTranslations as useUiTranslations } from "next-intl";
import { useGoods } from "./goods-context";
import { useState, useMemo, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import type {
  PropItem,
  PropChild,
  SkuItem,
} from "@/lib/client/services/goods-types";
import { fixImageUrl } from "@/lib/utils/image-url";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Minus } from "lucide-react";
import { HydrationSafePrice } from "./hydration-safe-price";
export interface GoodsSKUSelectorProps {
  fontSize?: string;
  unitPrice?: number | null;
}
export function GoodsSKUSelectorClient({
  fontSize = "14px",
  unitPrice,
}: GoodsSKUSelectorProps) {
  const translateUi = useUiTranslations();

  const { goodsInfo, loading } = useGoods();
  const [tempSelectProps, setTempSelectProps] = useState<
    Record<string, string>
  >({});
  const [qty, setQty] = useState(1);
  const [qtyBySku, setQtyBySku] = useState<Record<string, number>>({});
  const [sizeListExpanded, setSizeListExpanded] = useState(false);
  const SIZE_LIST_COLLAPSE_LIMIT = 5;
  const propsList = useMemo(() => goodsInfo?.props_list ?? [], [goodsInfo]);
  const propsImg = useMemo(() => goodsInfo?.props_img ?? {}, [goodsInfo]);
  const skuList = useMemo(() => goodsInfo?.skus?.sku ?? [], [goodsInfo]);
  const minQty = goodsInfo?.min_order_quantity ?? 1;
  const step = goodsInfo?.batch_number ?? 1;
  const hasStockSkus = useMemo(
    () =>
      skuList.filter((s) => s.quantity !== 0).map((s) => s.properties ?? ""),
    [skuList],
  );
  const propsListWithStock = useMemo(() => {
    const stockList = hasStockSkus.map((item) => {
      const temp: Record<string, string> = {};
      item.split(";").forEach((ele) => {
        const [k, v] = ele.split(":");
        if (k && v) temp[k] = v;
      });
      return temp;
    });
    return propsList.map((p) => ({
      ...p,
      children: p.children.map((c) => {
        const tempProps = { ...tempSelectProps, [p.id]: String(c.id) };
        const hasStock = stockList.some((stockItem) =>
          Object.keys(tempProps).every(
            (key) => stockItem[key] === tempProps[key],
          ),
        );
        return { ...c, noStock: !hasStock };
      }),
    }));
  }, [propsList, tempSelectProps, hasStockSkus]);
  // 最后一个规格使用批发样式（每项带数量输入），单个或多个规格都适用
  const mainPropsList = propsListWithStock.slice(0, -1);
  const sizeProp = propsListWithStock.at(-1) ?? null;
  /** 无规格时直接使用唯一 SKU，不做属性匹配 */
  const isNoSpec = propsList.length === 0 && skuList.length > 0;
  const selectedSku = useMemo(() => {
    if (isNoSpec) return skuList[0] ?? null;
    const sizePropItem = sizeProp;
    const requiredKeys = sizePropItem ? propsList.length - 1 : propsList.length;
    if (Object.keys(tempSelectProps).length !== requiredKeys) return null;
    const propsStr = Object.entries(tempSelectProps)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}:${v}`);
    return (
      skuList.find((sku) => {
        const parts = (sku.properties ?? "").split(";");
        return propsStr.every((p) => parts.includes(p));
      }) ?? null
    );
  }, [isNoSpec, tempSelectProps, propsList, skuList, sizeProp]);
  const selectedSkuImage = useMemo(() => {
    const fromSku = selectedSku?.sku_img;
    if (typeof fromSku === "string" && fromSku.trim()) return fromSku;
    const selectedPairs = Object.entries(tempSelectProps)
      .filter(([, v]) => !!v)
      .map(([k, v]) => `${k}:${v}`);
    if (selectedPairs.length === 0) return "";
    const matchedKey = selectedPairs.find((pair) => {
      const img = propsImg[pair];
      return typeof img === "string" && img.trim().length > 0;
    });
    return matchedKey ? String(propsImg[matchedKey] ?? "") : "";
  }, [selectedSku, tempSelectProps, propsImg]);
  const getBadgeNum = (propId: string, childId: string): number => {
    const propKey = `${propId}:${childId}`;
    return Object.entries(qtyBySku).reduce((sum, [skuKey, qty]) => {
      if (qty <= 0) return sum;
      const sku = skuList.find((s) => String(s?.sku_id) === skuKey);
      if (!sku) return sum;
      const props = sku.properties ?? "";
      if (props.includes(propKey + ";") || props.endsWith(propKey))
        return sum + qty;
      return sum;
    }, 0);
  };
  const getSkuForSizeChild = (sizeChild: PropChild): SkuItem | null => {
    if (!sizeProp) return null;
    const nextProps = {
      ...tempSelectProps,
      [String(sizeProp.id)]: String(sizeChild.id),
    };
    const propsStr = Object.entries(nextProps)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}:${v}`);
    return (
      skuList.find((sku) => {
        const parts = (sku.properties ?? "").split(";");
        return propsStr.every((p) => parts.includes(p));
      }) ?? null
    );
  };
  const onSelectProps = (propItem: PropItem, child: PropChild) => {
    if (child.noStock) return;
    const propId = String(propItem.id);
    const childId = String(child.id);
    setTempSelectProps({ ...tempSelectProps, [propId]: childId });
  };
  const selectionKey = JSON.stringify([
    goodsInfo?.platform,
    goodsInfo?.num_iid,
    goodsInfo?.min_order_quantity,
    propsList,
    skuList,
  ]);
  const [previousSelectionKey, setPreviousSelectionKey] = useState<
    string | null
  >(null);
  if (previousSelectionKey !== selectionKey) {
    setPreviousSelectionKey(selectionKey);
    setQtyBySku({});
    setQty(minQty);
    setSizeListExpanded(false);
    const sizePropIndex = propsList.length >= 1 ? propsList.length - 1 : -1;
    const propsToSelect =
      sizePropIndex >= 0 ? propsList.slice(0, sizePropIndex) : propsList;
    const buildDefault = (): Record<string, string> => {
      const sel: Record<string, string> = {};
      for (const prop of propsToSelect) {
        const propId = String(prop.id);
        const testProps = { ...sel };
        const firstWithStock = prop.children.find((child) => {
          testProps[propId] = String(child.id);
          const propsStr = Object.entries(testProps)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}:${v}`);
          return hasStockSkus.some((s) => {
            const parts = s.split(";");
            return propsStr.every((p) => parts.includes(p));
          });
        });
        if (firstWithStock) sel[propId] = String(firstWithStock.id);
        else break;
      }
      return sel;
    };
    setTempSelectProps(buildDefault());
  }
  const maxQty = Math.min(selectedSku?.quantity ?? 999, 999);
  const totalQty = useMemo(() => {
    if (sizeProp) return Object.values(qtyBySku).reduce((a, b) => a + b, 0);
    return qty;
  }, [sizeProp, qtyBySku, qty]);
  const hasBulkSelection = sizeProp && totalQty > 0;
  const canAddSingle =
    !sizeProp && !!selectedSku && qty >= minQty && qty <= maxQty;
  const canAdd = hasBulkSelection || canAddSingle;
  const dispatchSelectionChange = useCallback(
    (previewImage?: string) => {
      window.dispatchEvent(
        new CustomEvent("daigouSelectionChange", {
          detail: {
            canAdd,
            totalQty,
            qtyBySku,
            selectedSku,
            selectedSkuImage:
              typeof previewImage === "string"
                ? previewImage
                : selectedSkuImage,
            sizeProp: !!sizeProp,
          },
        }),
      );
    },
    [canAdd, totalQty, qtyBySku, selectedSku, selectedSkuImage, sizeProp],
  );
  useEffect(() => {
    dispatchSelectionChange();
  }, [dispatchSelectionChange]);
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (!goodsInfo) return null;
  if (!propsList.length && !skuList.length) {
    return (
      <div className="mt-5 mb-3">
        <div className="flex shrink-0 items-center overflow-hidden">
          <button
            type="button"
            onClick={() =>
              setQty((prev) =>
                prev <= minQty ? 0 : Math.max(minQty, prev - step),
              )
            }
            disabled={qty <= 1}
            className="flex h-9 w-9 items-center justify-center bg-gray-100 text-base font-medium hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            −
          </button>
          <Input
            value={qty}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (isNaN(v) || v < 0) return;
              const valid = v === 0 ? 0 : Math.max(minQty, v);
              setQty(valid);
            }}
            min={1}
            className="mx-2 h-9 w-16 rounded-none border-0 text-center text-base font-medium"
          />
          <button
            type="button"
            onClick={() =>
              setQty((prev) => (prev < minQty ? minQty : prev + step))
            }
            className="flex h-9 w-9 items-center justify-center bg-gray-100 text-base font-medium hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            +
          </button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ fontSize }} className="text-black">
      {mainPropsList.map((propItem, propIndex) => {
        const hasImgGroup = propItem.children.some(
          (c) => propsImg[`${propItem.id}:${c.id}`],
        );
        return (
          <div key={String(propItem.id)} className="mt-5 mb-3">
            <label className="mb-2 block text-base font-semibold text-gray-700">
              {propItem.name}
            </label>
            <div className="flex min-w-0 flex-wrap gap-2">
              {propItem.children.map((child) => {
                const isSelected =
                  tempSelectProps[String(propItem.id)] === String(child.id);
                const hasImg = propsImg[`${propItem.id}:${child.id}`];
                const badgeNum =
                  propIndex === 0
                    ? getBadgeNum(String(propItem.id), String(child.id))
                    : 0;
                return (
                  <div
                    key={String(child.id)}
                    className="relative max-w-full min-w-0"
                  >
                    <button
                      type="button"
                      disabled={child.noStock}
                      onClick={() => onSelectProps(propItem, child)}
                      className={`flex max-w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border text-center transition-colors ${child.noStock ? "cursor-not-allowed opacity-50" : ""} ${hasImg || hasImgGroup ? "overflow-hidden p-1" : "px-3 py-2"} ${isSelected ? "border-primary" : "border-gray-200 hover:border-gray-300"} ${
                        !hasImg && !hasImgGroup && isSelected
                          ? "bg-primary border-primary text-white"
                          : ""
                      } ${
                        !hasImg && !hasImgGroup && child.noStock
                          ? "border-dashed border-gray-300 bg-gray-50"
                          : ""
                      }`}
                    >
                      {hasImg ? (
                        <>
                          <img
                            src={fixImageUrl(
                              propsImg[`${propItem.id}:${child.id}`],
                            )}
                            alt={child.name}
                            className="h-7 w-7 shrink-0 rounded object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <span className="line-clamp-1 min-w-0 flex-1 truncate text-xs">
                            {child.name}
                          </span>
                        </>
                      ) : (
                        <span className="block max-w-full min-w-0 truncate text-xs">
                          {child.name}
                        </span>
                      )}
                    </button>
                    {badgeNum > 0 && (
                      <span className="absolute -end-1 -top-3 z-10 flex h-[22px] min-w-[22px] items-center justify-center rounded-md bg-red-500 px-1.5 text-xs font-medium text-white">
                        x {badgeNum}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* 无规格：直接对唯一 SKU 操作，显示购买数量 + 价格 + 库存 */}
      {isNoSpec && selectedSku && (
        <div className="mt-5 mb-3">
          <div className="flex items-center justify-between gap-4 border-b border-gray-100 py-2">
            <span className="text-base font-semibold text-gray-700">
              {translateUi.raw("purchase quantity")}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-red-500">
                <HydrationSafePrice
                  value={
                    selectedSku.sku_original_price ??
                    selectedSku.origin_price ??
                    selectedSku.price ??
                    unitPrice
                  }
                  options={{ useSymbol: true }}
                />
              </span>
              <span className="text-xs text-gray-600">
                {translateUi("Stock")}: ({selectedSku.quantity ?? "—"})
              </span>
              <div className="flex shrink-0 items-center overflow-hidden">
                <button
                  type="button"
                  onClick={() =>
                    setQty((prev) =>
                      prev <= minQty ? 0 : Math.max(minQty, prev - step),
                    )
                  }
                  disabled={qty <= 0}
                  className="flex h-9 w-9 items-center justify-center bg-gray-100 text-base font-medium hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  −
                </button>
                <Input
                  value={qty}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (isNaN(v) || v < 0) return;
                    const valid = v === 0 ? 0 : Math.max(minQty, v);
                    setQty(Math.min(maxQty, valid));
                  }}
                  min={0}
                  max={maxQty}
                  className="mx-2 h-9 w-16 rounded-none border-0 text-center text-base font-medium"
                />
                <button
                  type="button"
                  onClick={() =>
                    setQty((prev) =>
                      Math.min(maxQty, prev < minQty ? minQty : prev + step),
                    )
                  }
                  disabled={qty >= maxQty}
                  className="flex h-9 w-9 items-center justify-center bg-gray-100 text-base font-medium hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {sizeProp && (
        <div className="mt-5 mb-3">
          <label className="mb-3 block text-base font-semibold text-gray-700">
            {sizeProp.name}
          </label>
          <div className="space-y-3">
            {(sizeProp.children.length > SIZE_LIST_COLLAPSE_LIMIT &&
            !sizeListExpanded
              ? sizeProp.children.slice(0, SIZE_LIST_COLLAPSE_LIMIT)
              : sizeProp.children
            ).map((child) => {
              const sku = getSkuForSizeChild(child);
              const skuKey = sku?.sku_id ?? `${sizeProp.id}:${child.id}`;
              const skuQty = qtyBySku[String(skuKey)] ?? 0;
              const stock = sku ? Math.min(sku.quantity ?? 999, 999) : 0;
              const canIncrease = skuQty < stock;
              const propImg = propsImg[`${sizeProp.id}:${child.id}`];
              return (
                <div
                  key={String(child.id)}
                  className="flex items-center justify-between gap-4"
                >
                  <div className="flex flex-1 items-center gap-2">
                    {!!propImg && (
                      <img
                        src={fixImageUrl(propImg)}
                        alt={child.name}
                        className="size-8 shrink-0 cursor-pointer rounded object-cover transition-all duration-500 hover:scale-110"
                        referrerPolicy="no-referrer"
                        onMouseEnter={() => dispatchSelectionChange(propImg)}
                        onClick={() => dispatchSelectionChange(propImg)}
                      />
                    )}
                    <span className="text-xs font-medium">{child.name}</span>
                  </div>
                  <span className="text-xs text-gray-600">
                    {translateUi("Stock")}: {sku ? (sku.quantity ?? "—") : 0}
                  </span>
                  <div className="flex shrink-0 items-center overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setQtyBySku((prev) => {
                          const v = prev[String(skuKey)] ?? 0;
                          if (v <= 0) return prev;
                          let next = v - (step ?? minQty);
                          // 减到小于最小购买数量时，直接置为 0（移除）
                          if (next > 0 && next < minQty) next = 0;
                          if (next < 0) next = 0;
                          return {
                            ...prev,
                            [String(skuKey)]: next,
                          };
                        })
                      }
                      disabled={skuQty <= 0}
                      className="flex size-7 shrink-0 items-center justify-center rounded bg-[#F0F0F0] hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Minus className="size-4" />
                    </button>
                    <Input
                      value={skuQty}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (isNaN(v) || v < 0) return;
                        // 大于 0 且小于最小购买数量时，按最小数量处理
                        const valid = v === 0 ? 0 : Math.max(minQty, v);
                        setQtyBySku((prev) => ({
                          ...prev,
                          [String(skuKey)]: Math.min(stock, valid),
                        }));
                      }}
                      min={0}
                      max={stock}
                      className="mx-2 h-7 w-14 rounded-none border-0 p-0 text-center text-base font-medium focus-visible:ring-0"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setQtyBySku((prev) => {
                          const v = prev[String(skuKey)] ?? 0;
                          if (v >= stock) return prev;
                          // 第一次添加按最小购买数量，之后按 step 递增
                          const next =
                            v === 0 || v < minQty
                              ? minQty
                              : v + (step ?? minQty);
                          return {
                            ...prev,
                            [String(skuKey)]: Math.min(next, stock),
                          };
                        })
                      }
                      disabled={!canIncrease}
                      className="flex size-7 shrink-0 items-center justify-center rounded bg-[#F0F0F0] hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>
              );
            })}
            {sizeProp.children.length > SIZE_LIST_COLLAPSE_LIMIT &&
              !sizeListExpanded && (
                <button
                  type="button"
                  onClick={() => setSizeListExpanded(true)}
                  className="text-primary w-full cursor-pointer py-2 text-center font-medium hover:underline"
                >
                  {translateUi("More ({count} more)", {
                    count: sizeProp.children.length - SIZE_LIST_COLLAPSE_LIMIT,
                  })}
                </button>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
