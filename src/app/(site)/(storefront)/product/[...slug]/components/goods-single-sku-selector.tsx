"use client";
import { useTranslations } from "next-intl";
import type { GoodsSelectionSnapshot } from "@/lib/client/services/goods-types";
import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useGoods } from "./goods-context";
import type {
  PropChild,
  PropItem,
  SkuItem,
} from "@/lib/client/services/goods-types";
import { fixImageUrl } from "@/lib/utils/image-url";
const SELECTION_CHANGE_EVENT = "daigouSelectionChange";
const SELECTION_REQUEST_EVENT = "daigouSelectionRequest";
export interface GoodsSingleSkuSelectorClientProps {
  className?: string;
}
function getChildImage(
  propsImg: Record<string, string>,
  prop: PropItem,
  child: PropChild,
): string {
  return propsImg[`${prop.id}:${child.id}`] ?? "";
}
function getDefaultSelectedProps(
  skuList: SkuItem[],
  propsList: PropItem[],
): Record<string, string> {
  const firstSkuWithStock =
    skuList.find((sku) => sku.quantity !== 0) ?? skuList[0];
  if (!firstSkuWithStock?.properties) return {};
  const allowedPropIds = new Set(propsList.map((prop) => String(prop.id)));
  return firstSkuWithStock.properties
    .split(";")
    .reduce<Record<string, string>>((acc, item) => {
      const [propId, childId] = item.split(":");
      if (propId && childId && allowedPropIds.has(propId)) {
        acc[propId] = childId;
      }
      return acc;
    }, {});
}
export function GoodsSingleSkuSelectorClient({
  className,
}: GoodsSingleSkuSelectorClientProps) {
  const t = useTranslations();
  const { goodsInfo, loading } = useGoods();
  const [selectedProps, setSelectedProps] = useState<Record<string, string>>(
    {},
  );
  const [quantity, setQuantity] = useState(1);
  const latestSelectionRef = useRef<GoodsSelectionSnapshot | null>(null);
  const propsList = useMemo(() => goodsInfo?.props_list ?? [], [goodsInfo]);
  const displayPropsList = propsList;
  const propsImg = useMemo(() => goodsInfo?.props_img ?? {}, [goodsInfo]);
  const skuList = useMemo(() => goodsInfo?.skus?.sku ?? [], [goodsInfo]);
  const minQty = goodsInfo?.min_order_quantity ?? 1;
  const step = goodsInfo?.batch_number ?? 1;
  const inStockProps = useMemo(
    () =>
      skuList
        .filter((sku) => sku.quantity !== 0)
        .map((sku) => sku.properties ?? ""),
    [skuList],
  );
  const propsListWithStock = useMemo(() => {
    const stockList = inStockProps.map((item) => {
      const temp: Record<string, string> = {};
      item.split(";").forEach((ele) => {
        const [key, value] = ele.split(":");
        if (key && value) temp[key] = value;
      });
      return temp;
    });
    return propsList.map((prop) => ({
      ...prop,
      children: prop.children.map((child) => {
        if (!skuList.length) return child;
        const nextProps = {
          ...selectedProps,
          [String(prop.id)]: String(child.id),
        };
        const hasStock = stockList.some((stockItem) =>
          Object.keys(nextProps).every(
            (key) => stockItem[key] === nextProps[key],
          ),
        );
        return { ...child, noStock: !hasStock };
      }),
    }));
  }, [inStockProps, propsList, selectedProps, skuList.length]);
  const selectedSku = useMemo(() => {
    if (!skuList.length) return null;
    if (!propsList.length) return skuList[0] ?? null;
    if (Object.keys(selectedProps).length !== propsList.length) return null;
    const propsStr = Object.entries(selectedProps)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}:${value}`);
    return (
      skuList.find((sku) => {
        const parts = (sku.properties ?? "").split(";");
        return propsStr.every((item) => parts.includes(item));
      }) ?? null
    );
  }, [propsList.length, selectedProps, skuList]);
  const selectedSkuImage = useMemo(() => {
    const fromSku = selectedSku?.sku_img;
    if (typeof fromSku === "string" && fromSku.trim()) return fromSku;
    const selectedPairs = Object.entries(selectedProps)
      .filter(([, value]) => !!value)
      .map(([key, value]) => `${key}:${value}`);
    const matchedKey = selectedPairs.find(
      (pair) => typeof propsImg[pair] === "string" && propsImg[pair].trim(),
    );
    return matchedKey ? String(propsImg[matchedKey] ?? "") : "";
  }, [propsImg, selectedProps, selectedSku]);
  const selectedStock = selectedSku?.quantity;
  const selectedSkuKey = selectedSku
    ? String(selectedSku.sku_id ?? selectedSku.spec_id ?? "")
    : "";
  const maxQty = Math.min(selectedStock ?? 999, 999);
  const totalQty = quantity > 0 ? quantity : 0;
  const canAdd =
    !!goodsInfo && totalQty >= minQty && totalQty <= maxQty && !!selectedSku;
  const selectionKey = JSON.stringify([
    goodsInfo?.platform,
    goodsInfo?.num_iid,
    minQty,
    propsList,
    skuList,
  ]);
  const [previousSelectionKey, setPreviousSelectionKey] = useState<
    string | null
  >(null);
  if (previousSelectionKey !== selectionKey) {
    setPreviousSelectionKey(selectionKey);
    setQuantity(minQty);
    setSelectedProps(getDefaultSelectedProps(skuList, propsList));
  }
  useEffect(() => {
    if (!goodsInfo) return;
    const quantityMap: Record<string, number> = {};
    if (selectedSku && totalQty > 0) {
      quantityMap[String(selectedSku.sku_id ?? selectedSku.spec_id)] = totalQty;
    }
    const detail = {
      canAdd,
      totalQty,
      qtyBySku: quantityMap,
      selectedSku,
      selectedSkuImage,
      sizeProp: false,
    };
    latestSelectionRef.current = detail;
    window.dispatchEvent(
      new CustomEvent(SELECTION_CHANGE_EVENT, {
        detail,
      }),
    );
  }, [
    canAdd,
    goodsInfo,
    selectedSku,
    selectedSkuKey,
    selectedSkuImage,
    totalQty,
  ]);
  useEffect(() => {
    const handleSelectionRequest = () => {
      if (!latestSelectionRef.current) return;
      window.dispatchEvent(
        new CustomEvent(SELECTION_CHANGE_EVENT, {
          detail: latestSelectionRef.current,
        }),
      );
    };
    window.addEventListener(SELECTION_REQUEST_EVENT, handleSelectionRequest);
    return () =>
      window.removeEventListener(
        SELECTION_REQUEST_EVENT,
        handleSelectionRequest,
      );
  }, []);
  const onSelectProp = (prop: PropItem, child: PropChild) => {
    if (child.noStock) return;
    setSelectedProps((prev) => ({
      ...prev,
      [String(prop.id)]: String(child.id),
    }));
    setQuantity(minQty);
  };
  const selectedValue = (prop: PropItem, propIndex: number) => {
    const displayProp = displayPropsList[propIndex] ?? prop;
    const selected = displayProp.children.find(
      (child) => String(child.id) === selectedProps[String(prop.id)],
    );
    return selected?.name ?? "";
  };
  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-12 w-2/3" />
      </div>
    );
  }
  if (!goodsInfo) return null;
  return (
    <div className={cn("space-y-5", className)}>
      {propsListWithStock.map((prop, propIndex) => {
        const displayProp = displayPropsList[propIndex] ?? prop;
        const hasImages = prop.children.some((child) =>
          getChildImage(propsImg, prop, child),
        );
        return (
          <div key={String(prop.id)}>
            <div className="mb-2 text-[16px] font-bold">
              {displayProp.name}:
              <span className="text-primary">
                {selectedValue(prop, propIndex)}
              </span>
            </div>
            <div className="flex flex-wrap gap-3">
              {prop.children.map((child, childIndex) => {
                const displayChild = displayProp.children[childIndex] ?? child;
                const selected =
                  selectedProps[String(prop.id)] === String(child.id);
                const img = getChildImage(propsImg, prop, child);
                return (
                  <button
                    key={String(child.id)}
                    type="button"
                    disabled={child.noStock}
                    onClick={() => onSelectProp(prop, child)}
                    className={
                      hasImages
                        ? `relative h-[52px] w-[52px] shrink-0 overflow-hidden border ${selected ? "border-primary" : "border-transparent"} ${child.noStock ? "opacity-40" : ""}`
                        : `min-w-12 rounded border px-3 py-1 text-center text-xs font-semibold transition-colors ${selected ? "border-primary text-primary" : "border-[#D6DCE3] text-[#333333]"} ${child.noStock ? "opacity-40" : "hover:border-primary"}`
                    }
                  >
                    {hasImages ? (
                      img ? (
                        <img
                          src={fixImageUrl(img)}
                          alt={child.name}
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="block h-full w-full bg-[#f5f5f5]" />
                      )
                    ) : (
                      displayChild.name
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div>
        <div className="mb-2 text-sm font-bold text-[#999999]">
          {t("Quantity")}:
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex h-10 overflow-hidden rounded-md border border-[#D6DCE3]">
            <button
              type="button"
              onClick={() => setQuantity((prev) => Math.max(0, prev - step))}
              disabled={quantity <= 0}
              className="flex w-10 items-center justify-center border-e border-[#D6DCE3] text-[#999999] disabled:opacity-40"
            >
              <Minus className="h-4 w-4" />
            </button>
            <Input
              value={quantity}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10);
                if (Number.isNaN(next) || next < 0) return;
                setQuantity(Math.min(maxQty, next));
              }}
              className="h-10 w-14 rounded-none border-0 bg-white p-0 text-center text-sm font-bold shadow-none focus-visible:ring-0"
            />
            <button
              type="button"
              onClick={() =>
                setQuantity((prev) => {
                  const next = prev < minQty ? minQty : prev + step;
                  return Math.min(maxQty, next);
                })
              }
              disabled={quantity >= maxQty}
              className="flex w-10 items-center justify-center border-s border-[#D6DCE3] disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <span className="text-xs font-bold text-[#D6DCE3]">
            {t("Inventory")}({selectedSku ? (selectedStock ?? "—") : 0})
          </span>
          <span className="text-xs font-bold">
            {t("Minimum order quantity")} : {minQty}
          </span>
        </div>
      </div>
    </div>
  );
}
