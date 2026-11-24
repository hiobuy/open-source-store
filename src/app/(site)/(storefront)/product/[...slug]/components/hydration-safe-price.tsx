"use client";
import { useHydrated } from "@/hooks/use-hydrated";

import type { PriceConvertOptions } from "@/lib/store/common";
import { usePriceConvert } from "@/lib/store/common";
function formatDefaultCnyPrice(
  data: number | string | null | undefined,
  {
    needFormat = false,
    formatInt = false,
    showSymbol = true,
    useSymbol = false,
    needShow = false,
  }: PriceConvertOptions = {},
): string {
  const effectiveSymbol = useSymbol ? "¥" : "CNY";
  if (!data) {
    if (needShow) {
      return (showSymbol ? `${effectiveSymbol} ` : "") + "0.00";
    }
    return "0";
  }
  const parsed =
    typeof data === "string" ? Number.parseFloat(data) : Number(data);
  if (Number.isNaN(parsed)) return "0";
  const formatData = parsed / (needFormat ? 100 : 1);
  let truncatedNum = Math.floor(formatData * 10000) / 10000;
  truncatedNum =
    Math.ceil(Number((truncatedNum * 100).toFixed(2).replace(/\.?0+$/, ""))) /
    100;
  return (
    (showSymbol ? `${effectiveSymbol} ` : "") +
    truncatedNum.toFixed(Number.isInteger(truncatedNum) && formatInt ? 0 : 2)
  );
}
export function HydrationSafePrice({
  value,
  options,
}: {
  value: number | string | null | undefined;
  options?: PriceConvertOptions;
}) {
  const priceConvert = usePriceConvert();
  const hydrated = useHydrated();

  return (
    <bdi dir="ltr">
      {value == null
        ? "—"
        : hydrated
          ? priceConvert(value, options)
          : formatDefaultCnyPrice(value, options)}
    </bdi>
  );
}
