"use client";
import { ShippingChannelIcon } from "@/components/shipping-channel-icon";

import { useTranslations as useUiTranslations } from "next-intl";
import { useMemo } from "react";
import { usePriceConvert } from "@/lib/store/common";
import type { ShippingLine } from "@/lib/client/services/shipping-line-types";
type Props = {
  displayLine: ShippingLine;
};
/**
 * 渠道详情正文（与 EstimationDetails 页面内容一致，不含顶部返回栏，供弹窗内使用）
 */
export function ShippingLineDetailBody({ displayLine }: Props) {
  const translateUi = useUiTranslations();

  const priceConvert = usePriceConvert();
  const getTypeName = (type?: number): string => {
    const obj: Record<number, string> = {
      1: translateUi.raw("First Weight + Additional Weight Mode"),
      2: translateUi.raw("Tiered Pricing Mode"),
      3: translateUi.raw("Multi-level Additional Weight Mode"),
      4: translateUi.raw("Multi-level First Weight + Additional Weight Mode"),
    };
    return obj[type || 0] || "";
  };
  const getBillingMethodText = (): string => {
    const baseMode = displayLine.base_mode;
    const mode = displayLine.mode;
    const billingType =
      baseMode === 0
        ? translateUi.raw("Weight-based Billing")
        : translateUi.raw("Volume-based Billing");
    const modeName = getTypeName(mode);
    if (modeName) {
      return `${billingType}-${modeName}`;
    }
    return displayLine.billing_method || "";
  };
  const formatPriceDisplay = (item: {
    regionPrice?: string | number;
    price?: string | number;
    renewPrice?: string | number;
    regionUnit?: string;
  }): string => {
    const regionPrice = item.regionPrice ?? item.price;
    const renewPrice = item.renewPrice;
    const regionUnit = item.regionUnit || "";
    let priceText = "";
    if (regionPrice !== undefined && regionPrice !== null) {
      if (typeof regionPrice === "number") {
        priceText = priceConvert(regionPrice, { needFormat: true });
      } else {
        priceText = String(regionPrice);
      }
    }
    if (renewPrice !== undefined && renewPrice !== null && renewPrice !== "") {
      const renewText =
        typeof renewPrice === "number"
          ? priceConvert(renewPrice, { needFormat: true })
          : String(renewPrice);
      priceText += priceText ? `+${renewText}` : renewText;
    }
    if (regionUnit) {
      priceText += ` ${regionUnit}`;
    }
    return priceText || "";
  };
  const getValueByType = (item: { type?: number; value?: number }): string => {
    const type = Number(item.type);
    const amount = item.value
      ? priceConvert(item.value, { needFormat: true })
      : "0.00";
    const percent = String(item.value ? item.value / 100 : 0);
    if (type === 1)
      return translateUi.raw("Actual Freight {pct}%").replace("{pct}", percent);
    if (type === 2)
      return translateUi.raw("Price {amt}").replace("{amt}", amount);
    if (type === 3)
      return translateUi.raw("Price {amt} /Box").replace("{amt}", amount);
    if (type === 4)
      return translateUi
        .raw("Price {amt} /Box (Billing Weight)")
        .replace("{amt}", amount);
    if (type === 5)
      return translateUi
        .raw("Price {amt} /Box (Actual Weight)")
        .replace("{amt}", amount);
    return translateUi.raw("Declared Value {pct}%").replace("{pct}", percent);
  };
  const getPayType = (item: { type?: number }): string => {
    const obj: Record<number, string> = {
      1: translateUi.raw("Charge per Order"),
      2: translateUi.raw("Charge per Box"),
      3: translateUi.raw("Charge per Unit Weight"),
    };
    return obj[item.type || 0] || translateUi.raw("Restriction on Outbound");
  };
  const generateRange = (
    item: {
      start?: number;
      end?: number;
      type?: number;
    },
    mode?: number,
    maxWeight?: number,
  ): string => {
    if (mode === 4) {
      if (item.type === 0) {
        return item.start === item.end
          ? String((item.start ?? 0) / 1000)
          : `[${(item.start ?? 0) / 1000},${(item.end ?? 0) / 1000})`;
      }
      return maxWeight ? String(maxWeight / 1000) : "";
    }
    return item.start === item.end
      ? String((item.start ?? 0) / 1000)
      : `[${(item.start ?? 0) / 1000},${(item.end ?? 0) / 1000})`;
  };
  const processPriceListData = useMemo(() => {
    if (
      !displayLine?.region?.prices ||
      !Array.isArray(displayLine.region.prices)
    ) {
      return [];
    }
    let tableData = [...displayLine.region.prices].sort(
      (
        a: {
          start?: number;
        },
        b: {
          start?: number;
        },
      ) => (a.start || 0) - (b.start || 0),
    );
    const weightSymbol = displayLine.base_mode === 0 ? "KG" : "m³";
    if (displayLine.mode === 2) {
      const groupedByRange = new Map<
        string,
        {
          start?: number;
          end?: number;
          basePrice?: number;
          unitPrice?: number;
        }
      >();
      tableData.forEach(
        (item: {
          type?: number;
          price?: number;
          start?: number;
          end?: number;
        }) => {
          const key = `${item.start ?? ""}-${item.end ?? ""}`;
          if (!groupedByRange.has(key)) {
            groupedByRange.set(key, { start: item.start, end: item.end });
          }
          const group = groupedByRange.get(key)!;
          if (item.type === 8) {
            if (item.price != null) group.basePrice = item.price;
          } else if (item.type === 2) {
            if (item.price != null) group.unitPrice = item.price;
          } else if (item.price != null) {
            if (group.unitPrice == null) {
              group.unitPrice = item.price;
            }
          }
        },
      );
      return Array.from(groupedByRange.values()).map((group) => {
        const range = generateRange(
          { start: group.start, end: group.end, type: 0 },
          displayLine.mode,
          displayLine.max_weight,
        );
        const hasBasePrice = group.basePrice != null;
        const hasUnitPrice = group.unitPrice != null;
        let regionPrice: string | number = "";
        let regionUnit = "";
        let renewPrice: string | number = "";
        if (hasBasePrice && !hasUnitPrice) {
          regionPrice = group.basePrice!;
        } else if (!hasBasePrice && hasUnitPrice) {
          regionPrice = group.unitPrice!;
          regionUnit = `/${weightSymbol}`;
        } else if (hasBasePrice || hasUnitPrice) {
          regionPrice = hasBasePrice ? group.basePrice! : "";
          regionUnit = `/${weightSymbol}`;
          renewPrice = hasUnitPrice ? group.unitPrice! : "";
        }
        return { range, regionPrice, renewPrice, regionUnit };
      });
    }
    if (displayLine.mode === 1) {
      const uniqueData: typeof tableData = [];
      tableData.forEach((item) => {
        const existingIndex = uniqueData.findIndex(
          (ele: { start?: number; end?: number }) =>
            ele.start === item.start && ele.end === item.end,
        );
        if (existingIndex !== -1) {
          uniqueData[existingIndex] = { ...uniqueData[existingIndex], ...item };
        } else {
          uniqueData.push(item);
        }
      });
      tableData = uniqueData;
    }
    return tableData.map((item) => {
      const range = generateRange(
        item as {
          start?: number;
          end?: number;
          type?: number;
        },
        displayLine.mode,
        displayLine.max_weight,
      );
      if ([1, 4].includes(displayLine.mode || 0)) {
        const regionPrice = item.price as number;
        const unitWeight = item.unit_weight as number | undefined;
        const regionUnit = unitWeight
          ? `/${unitWeight / 1000}${weightSymbol}`
          : "";
        const priceType =
          item.type === 0
            ? translateUi.raw("Initial Fee")
            : translateUi.raw("Renewal Fee");
        return { range, priceType, regionPrice, regionUnit };
      }
      if (displayLine.mode === 5) {
        const regionPrice = item.price as number;
        const unitWeight = item.unit_weight as number | undefined;
        const regionUnit = unitWeight
          ? `/${unitWeight / 1000}${weightSymbol}`
          : "";
        const firstWeight = item.first_weight as number | undefined;
        const priceType =
          item.type === 6
            ? translateUi
                .raw("Initial Fee ({amount}{unit})")
                .replace("{amount}", String((firstWeight ?? 0) / 1000))
                .replace("{unit}", weightSymbol)
            : translateUi.raw("Renewal Fee");
        return { range, priceType, regionPrice, regionUnit };
      }
      return {
        range,
        regionPrice: item.price as number,
        regionUnit: "",
      };
    });
  }, [
    displayLine?.region?.prices,
    displayLine?.mode,
    displayLine?.base_mode,
    displayLine?.max_weight,
    translateUi,
  ]);
  return (
    <div className="space-y-4 pb-2">
      {/* Service Overview */}
      <div className="rounded-[12px] bg-white">
        <div
          className="hidden gap-4 md:grid md:gap-6"
          style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
        >
          <div className="col-span-10 flex items-start gap-3 md:gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-[#E5E7EB] bg-white text-sm font-bold shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]">
              {displayLine.icon?.icon ? (
                <ShippingChannelIcon
                  alt=""
                  src={displayLine.icon.icon}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-xs">
                  {displayLine.logo || displayLine.name || ""}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <h2 className="text-xl font-bold text-[#333333]">
                  {displayLine.name || translateUi.raw("Shipping Service")}
                </h2>
                <img
                  src="/assets/images/estimation/check.png"
                  alt=""
                  className="h-5 w-5 shrink-0"
                />
              </div>
              <p className="mb-2 text-sm text-gray-600">
                {displayLine.remark || ""}
              </p>
              {displayLine.labels && displayLine.labels.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {displayLine.labels.map((label, index) => {
                    const labelText =
                      typeof label === "string"
                        ? label
                        : (
                            label as {
                              name?: string;
                              label?: string;
                            }
                          )?.name ||
                          (
                            label as {
                              label?: string;
                            }
                          )?.label ||
                          String(label);
                    return (
                      <span
                        key={index}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${index === 0 ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}
                      >
                        {labelText}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="col-span-10 flex items-start gap-4 border-s border-e border-[#E5E7EB] px-4 md:gap-6 md:px-6">
            <div className="flex w-full flex-col gap-4">
              <div className="flex items-start gap-4 md:gap-6">
                <div>
                  <div className="mb-1 text-xs text-gray-500">
                    {translateUi.raw("Delivery Time")}
                  </div>
                  <div className="text-sm font-bold text-[#333333]">
                    {displayLine.region?.reference_time ||
                      displayLine.regions?.[0]?.reference_time ||
                      ""}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs text-gray-500">
                    {translateUi.raw("Max Weight")}
                  </div>
                  <div className="text-sm font-bold text-[#333333]">
                    {displayLine.max_weight
                      ? `${(displayLine.max_weight / 1000).toFixed(0)}kg`
                      : "—"}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="col-span-4 flex flex-col items-end">
            <div className="text-primary text-end text-3xl font-bold">
              <bdi dir="ltr">
                {priceConvert(displayLine.expire_fee || 0, {
                  needFormat: true,
                })}
              </bdi>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 md:hidden">
          <div className="flex items-start gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-[#E5E7EB] bg-white text-sm font-bold shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]">
              {displayLine.icon?.icon ? (
                <ShippingChannelIcon
                  alt=""
                  src={displayLine.icon.icon}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-xs">
                  {displayLine.logo || displayLine.name || ""}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <h2 className="text-xl font-bold text-[#333333]">
                  {displayLine.name || translateUi.raw("Shipping Service")}
                </h2>
                <img
                  src="/assets/images/estimation/check.png"
                  alt=""
                  className="h-5 w-5 shrink-0"
                />
              </div>
              <p className="mb-2 text-sm text-gray-600">
                {displayLine.remark || ""}
              </p>
              {displayLine.labels && displayLine.labels.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {displayLine.labels.map((label, index) => {
                    const labelText =
                      typeof label === "string"
                        ? label
                        : (
                            label as {
                              name?: string;
                            }
                          )?.name || String(label);
                    return (
                      <span
                        key={index}
                        className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700"
                      >
                        {labelText}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 items-start gap-4">
              <div>
                <div className="mb-1 text-xs text-gray-500">
                  {translateUi.raw("Delivery Time")}
                </div>
                <div className="text-sm font-bold text-[#333333]">
                  {displayLine.region?.reference_time ||
                    displayLine.regions?.[0]?.reference_time ||
                    ""}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs text-gray-500">
                  {translateUi.raw("Min Weight")}
                </div>
                <div className="text-sm font-normal text-[#333333]">
                  {displayLine.min_weight
                    ? (displayLine.min_weight / 1000).toFixed(2)
                    : ""}
                </div>
              </div>
            </div>
            {displayLine.max_weight ? (
              <div>
                <div className="mb-1 text-xs text-gray-500">
                  {translateUi.raw("Max Weight")}
                </div>
                <div className="text-sm font-normal text-[#333333]">
                  {(displayLine.max_weight / 1000).toFixed(2)}
                </div>
              </div>
            ) : null}
          </div>
          {/* <div className="flex flex-col items-end">
<div className="text-3xl font-bold text-primary">
    {priceConvert(displayLine.expire_fee || 0, { needFormat: true })}
</div>
</div> */}
        </div>
      </div>

      {/* Route + billing */}
      <div className="rounded-[12px] bg-white">
        <div className="space-y-4">
          {displayLine.props && displayLine.props.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-medium text-[#333333]">
                {translateUi.raw("Route Properties:")}
              </div>
              <div className="flex flex-wrap gap-2">
                {displayLine.props.map((prop, index) => (
                  <span
                    key={index}
                    className="border-primary text-primary rounded-[4px] border px-2 py-1 text-[9px] font-normal"
                  >
                    {prop.name || ""}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="mb-2 text-sm font-medium text-[#333333]">
              {translateUi.raw("Billing method:")}
            </div>
            <div className="text-sm text-gray-600">
              {getBillingMethodText()}
            </div>
          </div>
        </div>
      </div>

      {/* Price list */}
      <div className="rounded-[12px] bg-white">
        <div className="mb-4 text-sm font-medium text-[#333333]">
          {translateUi.raw("Price List:")}
        </div>
        <div className="overflow-x-auto">
          <div className="border border-[#cccccc]">
            <div className="flex border-b border-[#cccccc]">
              <div className="flex-1 flex-shrink-0 border-e border-[#cccccc] text-center text-[10px] leading-[34px] font-bold text-[#1a1a1a]">
                {displayLine.base_mode === 0
                  ? translateUi.raw("Weight Range (KG)")
                  : translateUi.raw("Volume Range (m³)")}
              </div>
              {displayLine.mode !== 2 && (
                <div className="flex-1 flex-shrink-0 border-e border-[#cccccc] text-center text-[10px] leading-[34px] font-bold text-[#1a1a1a]">
                  {translateUi.raw("Price Type")}
                </div>
              )}
              <div className="flex-1 flex-shrink-0 text-center text-[10px] leading-[34px] font-bold text-[#1a1a1a]">
                {translateUi.raw("Price")}
              </div>
            </div>
            {processPriceListData && processPriceListData.length > 0 ? (
              processPriceListData.map(
                (item: Record<string, unknown>, index: number) => (
                  <div
                    key={index}
                    className={`flex min-h-[34px] ${index < processPriceListData.length - 1 ? "border-b border-[#cccccc]" : ""}`}
                  >
                    <div className="flex flex-1 flex-shrink-0 items-center justify-center border-e border-[#cccccc] text-center text-[10px] font-normal text-[#1a1a1a]">
                      {(item.range as string) || ""}
                    </div>
                    {displayLine.mode !== 2 && (
                      <div className="flex flex-1 flex-shrink-0 items-center justify-center border-e border-[#cccccc] text-center text-[10px] font-normal text-[#1a1a1a]">
                        {(item.priceType as string) || ""}
                      </div>
                    )}
                    <div className="flex flex-1 flex-shrink-0 items-center justify-center text-center text-[10px] font-normal text-[#1a1a1a]">
                      {formatPriceDisplay(
                        item as Parameters<typeof formatPriceDisplay>[0],
                      )}
                    </div>
                  </div>
                ),
              )
            ) : (
              <div className="flex min-h-[34px] items-center justify-center">
                <div className="text-sm text-[#666666]">
                  {translateUi.raw("No Price List")}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Value-added */}
      <div className="rounded-[12px] bg-white">
        <div className="mb-2 text-sm font-bold text-[#333333]">
          {translateUi.raw("Channel Value-Added Services")}
        </div>
        {displayLine.region?.services &&
        displayLine.region.services.length > 0 ? (
          <div className="space-y-4">
            {displayLine.region.services.map((service, index) => (
              <div key={index} className="text-sm leading-6 text-[#666666]">
                <span>
                  {index + 1}. {service.name || ""}
                  {service.is_is_forced == 1
                    ? translateUi.raw(" (Required)")
                    : translateUi.raw(" (Optional)")}
                </span>
                <span className="ms-2">{getValueByType(service)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-[#666666]">
            {translateUi.raw("No Value-Added Services")}
          </div>
        )}
      </div>

      {/* Rules */}
      <div className="rounded-[12px] bg-white">
        <div className="mb-2 text-sm font-bold text-[#333333]">
          {translateUi.raw("Channel Restriction Rules")}
        </div>
        {(() => {
          const rules =
            displayLine.region?.rules ||
            displayLine.rules ||
            (
              displayLine as {
                region_rules?: unknown;
              }
            ).region_rules;
          return rules && Array.isArray(rules) && rules.length > 0 ? (
            <div className="space-y-4">
              {rules.map((rule: Record<string, unknown>, index: number) => (
                <div key={index} className="text-sm leading-6 text-[#666666]">
                  <span>{index + 1}. </span>
                  {(
                    rule.conditions as
                      Array<Record<string, unknown>> | undefined
                  )?.map((condition, condIndex, arr) => (
                    <span key={condIndex}>
                      <span>{(condition.param_name as string) || ""}</span>
                      <span className="mx-1">
                        {condition.comparison === "contains"
                          ? translateUi.raw("Contains")
                          : (condition.comparison as string) || ""}
                      </span>
                      <span>
                        {condition.comparison === "contains"
                          ? (
                              condition.address_tags as
                                | Array<{
                                    name?: string;
                                  }>
                                | undefined
                            )
                              ?.map((tag) => tag.name)
                              .join(",") || ""
                          : (condition.value as string) || ""}
                      </span>
                      {condIndex < arr.length - 1 && (
                        <span className="mx-1">
                          {rule.is_and == 1
                            ? translateUi.raw("And")
                            : translateUi.raw("Or")}
                        </span>
                      )}
                    </span>
                  ))}
                  <span className="mx-1">, </span>
                  <span>
                    【
                    {getPayType(
                      rule as {
                        type?: number;
                      },
                    )}
                    】
                  </span>
                  {rule.value !== undefined &&
                    rule.value !== null &&
                    rule.value !== 0 && (
                      <span className="ms-1">
                        <bdi dir="ltr">
                          {priceConvert(rule.value as number, {
                            needFormat: true,
                          })}
                        </bdi>
                      </span>
                    )}
                  {(() => {
                    const minC = rule.min_charge as number | undefined;
                    const maxC = rule.max_charge as number | undefined;
                    const hasMinCharge =
                      minC !== undefined && minC !== null && minC !== 0;
                    const hasMaxCharge =
                      maxC !== undefined && maxC !== null && maxC !== 0;
                    if (hasMinCharge && hasMaxCharge) {
                      return (
                        <span className="ms-1">
                          {translateUi.raw("(Minimum Charge")}{" "}
                          <bdi dir="ltr">
                            {priceConvert(minC!, { needFormat: true })}
                          </bdi>
                          {translateUi.raw(", Maximum Charge")}
                          <bdi dir="ltr">
                            {priceConvert(maxC!, { needFormat: true })}
                          </bdi>
                          )
                        </span>
                      );
                    }
                    if (hasMinCharge) {
                      return (
                        <span className="ms-1">
                          {translateUi.raw("(Minimum Charge")}{" "}
                          <bdi dir="ltr">
                            {priceConvert(minC!, { needFormat: true })}
                          </bdi>
                          )
                        </span>
                      );
                    }
                    if (hasMaxCharge) {
                      return (
                        <span className="ms-1">
                          {translateUi.raw("(Maximum Charge")}{" "}
                          <bdi dir="ltr">
                            {priceConvert(maxC!, { needFormat: true })}
                          </bdi>
                          )
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[#666666]">
              {translateUi.raw("No Restriction Rules")}
            </div>
          );
        })()}
      </div>

      {displayLine.remark ? (
        <div className="rounded-[12px] bg-white">
          <div className="mb-2 text-sm font-bold text-[#333333]">
            {translateUi.raw("Channel Description")}
          </div>
          <div className="text-sm leading-6 whitespace-pre-line text-[#666666]">
            {displayLine.remark}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export type { ShippingLine };
