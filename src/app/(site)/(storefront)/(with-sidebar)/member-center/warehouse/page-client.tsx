/* eslint-disable @next/next/no-img-element -- Original list thumbnails use authenticated or external image URLs. */
/**
 * ParcelList 组件
 * 包裹列表组件，支持勾选和批量操作
 */
"use client";
import { ImagePreviewLightbox } from "@/components/image-preview-lightbox";
import { Section } from "@/components/layout/section";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { LogisticsLoadState } from "@/components/features/logistics/procurement-logistics";
import { getProcurementParcels } from "@/lib/procurement/client";
import { useProcurementResource } from "@/hooks/use-procurement-resource";
import { setSubmittedParcels } from "@/lib/store/parcel";
import { copyToClipboard } from "@/lib/utils";
import { useHydrated } from "@/hooks/use-hydrated";
import dayjs from "dayjs";
import { ChevronDown, Clock, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

async function loadWarehouseParcels() {
  const query = { page: 1, pageSize: 50, status: "received", q: "" };
  const first = await getProcurementParcels(query);
  const parcels = [...first.items];
  for (let page = 2; page <= Math.ceil(first.total / first.pageSize); page++) {
    const result = await getProcurementParcels({ ...query, page });
    parcels.push(...result.items);
  }
  return parcels;
}

function ParcelListLoadingSkeleton() {
  return (
    <>
      <div className="mb-4 hidden gap-4 rounded-lg bg-gray-100 px-4 py-3 md:grid md:grid-cols-6">
        <Skeleton className="col-span-2 h-4 w-32" />
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-4 w-20" />
        ))}
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="min-w-0 rounded-lg border border-gray-200 bg-white p-4"
          >
            <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="hidden h-4 w-28 md:block" />
            </div>
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-6">
              <div className="flex items-start gap-2 md:col-span-2">
                <Skeleton className="h-16 w-16 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
              <Skeleton className="hidden h-4 w-12 md:block" />
              <Skeleton className="hidden h-4 w-16 md:block" />
              <Skeleton className="hidden h-16 w-full rounded-lg md:block" />
              <Skeleton className="hidden h-6 w-16 md:block" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const QC_PREVIEW_LIMIT = 2;
function WeightText({
  weight,
  className,
}: {
  weight: number | null;
  className?: string;
}) {
  if (weight == null) return <span className={className}>—</span>;
  const value = (weight / 1000).toFixed(3);
  return (
    <span className={className}>
      <span className="font-bold">{value}</span> KG
    </span>
  );
}
function QcImageThumbnails({
  pictures,
  onImageClick,
}: {
  pictures: string[];
  onImageClick: (imgs: string[], index: number) => void;
}) {
  const t = useTranslations();
  if (!pictures.length) return null;
  const visiblePictures = pictures.slice(0, QC_PREVIEW_LIMIT);
  const remainingCount = pictures.length - QC_PREVIEW_LIMIT;
  return (
    <div className="flex flex-nowrap gap-1">
      {visiblePictures.map((img, idx) => (
        <img
          key={idx}
          src={img}
          alt={`${t("Package")} ${idx + 1}`}
          className="h-10 w-10 shrink-0 cursor-pointer rounded border border-gray-200 object-cover hover:opacity-90"
          referrerPolicy="no-referrer"
          onClick={(e) => {
            e.stopPropagation();
            onImageClick(pictures, idx);
          }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ))}
      {remainingCount > 0 && (
        <button
          type="button"
          className="text-primary hover:bg-primary/5 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded border border-dashed border-gray-300 text-xs font-medium"
          onClick={(e) => {
            e.stopPropagation();
            onImageClick(pictures, QC_PREVIEW_LIMIT);
          }}
        >
          +{remainingCount}
        </button>
      )}
    </div>
  );
}
function escapeHtmlForInner(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

// 客户端组件
export default function PageClient() {
  const t = useTranslations();

  const noImageHtml = useMemo(
    () => ({
      plain: `<div class="w-full h-full bg-gray-100 rounded border border-gray-200 flex items-center justify-center"><span class="text-xs text-gray-400">${escapeHtmlForInner(t("No Image"))}</span></div>`,
      withErr: `<div class="w-full h-full bg-gray-100 rounded border border-gray-200 flex items-center justify-center error-placeholder"><span class="text-xs text-gray-400">${escapeHtmlForInner(t("No Image"))}</span></div>`,
    }),
    [t],
  );
  const router = useRouter();
  const mounted = useHydrated();
  const result = useProcurementResource(loadWarehouseParcels, true);
  const rawParcels = result.data ?? [];
  const parcels = rawParcels.map((parcel) => ({
    id: parcel.id,
    eligible: parcel.eligible,
    express_num: parcel.domesticTrackingNumber || parcel.publicId,
    package_name: parcel.productName,
    package_weight: parcel.weightGrams,
    length: parcel.lengthMm,
    width: parcel.widthMm,
    height: parcel.heightMm,
    created_at: parcel.createdAt,
    freeDays: parcel.freeStorageRemainingDays,
    package_pictures: parcel.photos.flatMap((photo) =>
      photo.url ? [photo.url] : [],
    ),
    details: parcel.goodsItems.map((item, index) => ({
      id: index,
      name: item.name,
      qty: item.quantity,
      image: item.imageUrl,
    })),
    attributes: parcel.cargoAttributes,
  }));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedParcels, setExpandedParcels] = useState<Set<string>>(
    new Set(),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [containerLeft, setContainerLeft] = useState<number | null>(null);
  const [qcLightboxOpen, setQcLightboxOpen] = useState(false);
  const [qcLightboxSlides, setQcLightboxSlides] = useState<
    {
      src: string;
    }[]
  >([]);
  const [qcLightboxIndex, setQcLightboxIndex] = useState(0);
  function handleQcImageClick(imgs: string[], index: number) {
    setQcLightboxSlides(imgs.map((src) => ({ src })));
    setQcLightboxIndex(index);
    setQcLightboxOpen(true);
  }
  // 切换展开/收起
  const toggleExpand = (parcelId: string) => {
    setExpandedParcels((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(parcelId)) {
        newSet.delete(parcelId);
      } else {
        newSet.add(parcelId);
      }
      return newSet;
    });
  };
  // 切换单个选择
  const toggleSelect = (parcelId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(parcelId)) {
        return prev.filter((id) => id !== parcelId);
      } else {
        return [...prev, parcelId];
      }
    });
  };
  const eligibleIds = parcels
    .filter((parcel) => parcel.eligible)
    .map((parcel) => parcel.id);
  const selected = selectedIds.filter((id) => eligibleIds.includes(id));
  const isAllSelected =
    eligibleIds.length > 0 && selected.length === eligibleIds.length;
  const totalWeight = parcels.reduce(
    (sum, parcel) =>
      selected.includes(parcel.id) ? sum + (parcel.package_weight ?? 0) : sum,
    0,
  );

  function handleSubmit() {
    if (!selected.length) {
      toast.warning(t("Please select at least one parcel"));
      return;
    }
    // 保存选中的原始包裹数据，合箱页直接读取，避免逐个重新请求
    setSubmittedParcels(
      rawParcels.filter((parcel) => selected.includes(parcel.id)),
    );
    router.push("/member-center/shipments/new");
  }

  function handleCopyExpressNum(value: string) {
    void copyToClipboard(value, {
      success: t("Successfully copied to clipboard"),
      error: t("Failed to copy to clipboard"),
    });
  }

  function formatDimension(
    length: number | null,
    width: number | null,
    height: number | null,
  ) {
    if (length == null || width == null || height == null) return "—";
    return `${(length / 10).toFixed(2)}*${(width / 10).toFixed(2)}*${(height / 10).toFixed(2)} CM`;
  }
  // 监听容器宽度和位置变化
  useEffect(() => {
    if (!mounted || !containerRef.current) return;
    const updatePosition = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerWidth(rect.width);
        setContainerLeft(rect.left);
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [mounted]);
  return (
    <Section className="px-0">
      {
        <div
          ref={containerRef}
          className="mt-4 rounded-lg pb-20 md:bg-white md:p-4 md:pb-20"
        >
          {result.loading ? (
            <ParcelListLoadingSkeleton />
          ) : result.error ? (
            <LogisticsLoadState {...result} />
          ) : parcels.length === 0 ? (
            <div className="px-4 py-12 text-center text-gray-500">
              <img
                src="/assets/images/empty/no-parcel.png"
                alt={t("No parcels")}
                className="mx-auto mb-4 h-24 w-24"
              />
              <p className="mx-auto max-w-md text-sm leading-relaxed">
                {t(
                  "After the order is placed successfully, the seller will send the items to the warehouse Once the warehouse receives the items, you can view and manage them on this page",
                )}
              </p>
            </div>
          ) : (
            <>
              {/* 大屏幕：表格头部 */}
              <div className="mb-4 hidden gap-4 rounded-lg bg-gray-100 px-4 py-3 text-sm font-medium text-gray-600 md:grid md:grid-cols-6">
                <div className="md:col-span-2">{t("Product Details")}</div>
                <div>{t("Weight(kg)")}</div>
                <div>{t("Dimension(cm)")}</div>
                <div>{t("Standard QC")}</div>
                <div>{t("Attributes")}</div>
              </div>

              {/* 大屏幕：包裹列表 */}
              <div className="hidden space-y-4 md:block">
                {parcels.map((parcel) => {
                  const details = parcel.details || [];
                  const isExpanded = expandedParcels.has(parcel.id);
                  const hasMultipleItems = details.length > 1;
                  const isSelected = selected.includes(parcel.id);
                  return (
                    <div
                      key={parcel.id}
                      className="min-w-0 rounded-lg border border-gray-200 p-4 transition-shadow hover:shadow-md"
                    >
                      {/* 第一行：复选框、包裹号、时间、Remaining Storage 和 contact */}
                      <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-3">
                        <div className="flex items-center gap-3">
                          {parcel.eligible && (
                            <Checkbox
                              className="size-4"
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(parcel.id)}
                            />
                          )}
                          <span className="text-sm font-medium">
                            {parcel.express_num}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyExpressNum(parcel.express_num);
                            }}
                            className="text-gray-400 transition-colors hover:text-gray-600"
                            title={t("Copy parcel number")}
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <div className="text-xs text-gray-400">
                            {dayjs(parcel.created_at).format(
                              "YYYY-MM-DD HH:mm:ss",
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {parcel.freeDays != null && (
                            <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1 text-sm text-blue-600">
                              <Clock className="h-4 w-4" />
                              <span>
                                {t("Remaining Storage ")}
                                {parcel.freeDays} {t("days")}
                              </span>
                            </div>
                          )}
                          {/* <div className="flex items-center gap-1 text-sm text-gray-600">
                    <MessageCircle className="w-4 h-4" />
                    <span>contact</span>
                  </div> */}
                        </div>
                      </div>

                      {/* 分隔线下面的内容 */}
                      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-6">
                        {/* Product Details */}
                        <div className="md:col-span-2">
                          <div className="space-y-2">
                            {details.length === 0 ? (
                              <div className="flex items-start gap-2">
                                <div className="h-16 w-16 shrink-0">
                                  <img
                                    src="/assets/images/package/package.png"
                                    alt={t("Parcel")}
                                    className="h-full w-full rounded border border-gray-200 object-cover"
                                    onError={(e) => {
                                      (
                                        e.target as HTMLImageElement
                                      ).style.display = "none";
                                      (
                                        e.target as HTMLImageElement
                                      ).parentElement!.innerHTML =
                                        noImageHtml.plain;
                                    }}
                                  />
                                </div>
                                <div className="flex-1 text-sm font-bold text-gray-700">
                                  {parcel.package_name || t("Parcel")}
                                </div>
                              </div>
                            ) : (
                              <>
                                {/* 显示第一个 detail */}
                                {details.length > 0 && (
                                  <div className="flex items-start gap-2">
                                    <div className="h-16 w-16 shrink-0">
                                      {details[0].image ? (
                                        <img
                                          src={details[0].image}
                                          alt={details[0].name || t("Package")}
                                          className="h-full w-full rounded border border-gray-200 object-cover"
                                          referrerPolicy="no-referrer"
                                          onError={(e) => {
                                            (
                                              e.target as HTMLImageElement
                                            ).style.display = "none";
                                            const parent = (
                                              e.target as HTMLImageElement
                                            ).parentElement;
                                            if (
                                              parent &&
                                              !parent.querySelector(
                                                ".error-placeholder",
                                              )
                                            ) {
                                              parent.innerHTML =
                                                noImageHtml.withErr;
                                            }
                                          }}
                                        />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center rounded border border-gray-200 bg-gray-100">
                                          <span className="text-xs text-gray-400">
                                            {t("No Image")}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="line-clamp-2 flex-1 text-sm font-bold text-gray-700">
                                      {details[0].name ||
                                        parcel.package_name ||
                                        t("Unnamed product")}
                                    </div>
                                  </div>
                                )}
                                {/* 展开的其他 details */}
                                {isExpanded && details.length > 1 && (
                                  <div className="space-y-2 pt-2">
                                    {details.slice(1).map((detail, idx) => (
                                      <div
                                        key={detail.id || idx}
                                        className="flex items-start gap-2"
                                      >
                                        <div className="h-16 w-16 shrink-0">
                                          {detail.image ? (
                                            <img
                                              src={detail.image}
                                              alt={detail.name || t("Package")}
                                              className="h-full w-full rounded border border-gray-200 object-cover"
                                              onError={(e) => {
                                                (
                                                  e.target as HTMLImageElement
                                                ).style.display = "none";
                                                const parent = (
                                                  e.target as HTMLImageElement
                                                ).parentElement;
                                                if (
                                                  parent &&
                                                  !parent.querySelector(
                                                    ".error-placeholder",
                                                  )
                                                ) {
                                                  parent.innerHTML =
                                                    noImageHtml.withErr;
                                                }
                                              }}
                                            />
                                          ) : (
                                            <div className="flex h-full w-full items-center justify-center rounded border border-gray-200 bg-gray-100">
                                              <span className="text-xs text-gray-400">
                                                {t("No Image")}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                        <div className="line-clamp-2 flex-1 text-sm text-gray-700">
                                          {detail.name || t("Unnamed product")}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* multiple Item 按钮 */}
                                {hasMultipleItems && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleExpand(parcel.id);
                                    }}
                                    className="flex shrink-0 cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs whitespace-nowrap transition-colors"
                                    style={{
                                      backgroundColor:
                                        "rgba(22, 119, 255, 0.1)",
                                      color: "#1677FF",
                                    }}
                                  >
                                    <span>
                                      {isExpanded
                                        ? t("Collapse")
                                        : t("multiple Item")}
                                    </span>
                                    <ChevronDown
                                      className="h-3 w-3"
                                      style={{
                                        color: "#1677FF",
                                        transform: isExpanded
                                          ? "rotate(180deg)"
                                          : "rotate(0deg)",
                                        transition: "transform 0.2s",
                                      }}
                                    />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Weight */}
                        <div className="md:col-span-1">
                          <div
                            className="text-sm"
                            style={{ paddingTop: "20px" }}
                          >
                            <WeightText weight={parcel.package_weight} />
                          </div>
                        </div>

                        {/* Dimension */}
                        <div className="md:col-span-1">
                          <div
                            className="text-sm"
                            style={{ paddingTop: "20px" }}
                          >
                            {formatDimension(
                              parcel.length,
                              parcel.width,
                              parcel.height,
                            )}
                          </div>
                        </div>

                        {/* Standard QC */}
                        <div className="min-w-0 md:col-span-1">
                          <div
                            className="min-w-0"
                            style={{ paddingTop: "10px" }}
                          >
                            <QcImageThumbnails
                              pictures={parcel.package_pictures ?? []}
                              onImageClick={handleQcImageClick}
                            />
                          </div>
                        </div>

                        {/* Attributes */}
                        <div className="md:col-span-1">
                          <div style={{ paddingTop: "16px" }}>
                            {parcel.attributes.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {parcel.attributes.map((attribute) => (
                                  <span
                                    key={attribute}
                                    className="bg-primary/10 text-primary rounded px-2 py-1 text-xs"
                                  >
                                    {attribute}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 小屏幕：包裹列表 */}
              <div className="space-y-2.5 md:hidden">
                {parcels.map((parcel) => {
                  const details = parcel.details || [];
                  const isExpanded = expandedParcels.has(parcel.id);
                  const hasMultipleItems = details.length > 1;
                  const isSelected = selected.includes(parcel.id);
                  return (
                    <div
                      key={parcel.id}
                      className="min-w-0 space-y-4 rounded-lg bg-white p-4"
                    >
                      {/* 复选框、包裹号和时间 */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {parcel.eligible && (
                            <Checkbox
                              className="size-4"
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(parcel.id)}
                            />
                          )}
                          <span className="text-sm font-medium">
                            {parcel.express_num}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyExpressNum(parcel.express_num);
                            }}
                            className="text-gray-400 transition-colors hover:text-gray-600"
                            title={t("Copy parcel number")}
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="text-xs text-gray-400">
                          {dayjs(parcel.created_at).format(
                            "YYYY-MM-DD HH:mm:ss",
                          )}
                        </div>
                      </div>

                      {/* 包裹信息区域 */}
                      <div className="space-y-4">
                        {details.length === 0 ? (
                          <div className="flex gap-4">
                            <div className="h-24 w-24 shrink-0">
                              <img
                                src="/assets/images/package/package.png"
                                alt={t("Parcel")}
                                className="h-full w-full rounded border border-gray-200 object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display =
                                    "none";
                                  (
                                    e.target as HTMLImageElement
                                  ).parentElement!.innerHTML =
                                    noImageHtml.plain;
                                }}
                              />
                            </div>
                            <div className="flex-1 space-y-2">
                              <div className="text-sm font-bold text-gray-700">
                                {parcel.package_name || t("Parcel")}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* 第一个 detail */}
                            {details.length > 0 && (
                              <div className="flex gap-4">
                                <div className="h-24 w-24 shrink-0">
                                  {details[0].image ? (
                                    <img
                                      src={details[0].image}
                                      alt={details[0].name || t("Package")}
                                      className="h-full w-full rounded border border-gray-200 object-cover"
                                      onError={(e) => {
                                        (
                                          e.target as HTMLImageElement
                                        ).style.display = "none";
                                        const parent = (
                                          e.target as HTMLImageElement
                                        ).parentElement;
                                        if (
                                          parent &&
                                          !parent.querySelector(
                                            ".error-placeholder",
                                          )
                                        ) {
                                          parent.innerHTML =
                                            noImageHtml.withErr;
                                        }
                                      }}
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center rounded border border-gray-200 bg-gray-100">
                                      <span className="text-xs text-gray-400">
                                        {t("No Image")}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 space-y-2">
                                  <div className="line-clamp-2 text-sm font-bold text-gray-700">
                                    {details[0].name ||
                                      parcel.package_name ||
                                      t("Unnamed product")}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    x{details[0].qty}
                                  </div>
                                </div>
                              </div>
                            )}
                            {/* 展开的其他 details */}
                            {isExpanded && details.length > 1 && (
                              <>
                                {details.slice(1).map((detail, idx) => (
                                  <div
                                    key={detail.id || idx}
                                    className="flex gap-4"
                                  >
                                    <div className="h-24 w-24 shrink-0">
                                      {detail.image ? (
                                        <img
                                          src={detail.image}
                                          alt={detail.name || t("Package")}
                                          className="h-full w-full rounded border border-gray-200 object-cover"
                                          onError={(e) => {
                                            (
                                              e.target as HTMLImageElement
                                            ).style.display = "none";
                                            const parent = (
                                              e.target as HTMLImageElement
                                            ).parentElement;
                                            if (
                                              parent &&
                                              !parent.querySelector(
                                                ".error-placeholder",
                                              )
                                            ) {
                                              parent.innerHTML =
                                                noImageHtml.withErr;
                                            }
                                          }}
                                        />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center rounded border border-gray-200 bg-gray-100">
                                          <span className="text-xs text-gray-400">
                                            {t("No Image")}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex-1">
                                      <div className="line-clamp-2 text-sm text-gray-700">
                                        {detail.name || t("Unnamed product")}
                                      </div>
                                      <div className="text-xs text-gray-500">
                                        x{detail.qty}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </>
                            )}
                            {/* multiple Item 按钮 */}
                            {hasMultipleItems && (
                              <div>
                                <button
                                  onClick={() => toggleExpand(parcel.id)}
                                  className="flex shrink-0 cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs whitespace-nowrap transition-colors"
                                  style={{
                                    backgroundColor: "rgba(22, 119, 255, 0.1)",
                                    color: "#1677FF",
                                  }}
                                >
                                  <span>
                                    {isExpanded
                                      ? t("Collapse")
                                      : t("multiple Item")}
                                  </span>
                                  <ChevronDown
                                    className="h-3 w-3"
                                    style={{
                                      color: "#1677FF",
                                      transform: isExpanded
                                        ? "rotate(180deg)"
                                        : "rotate(0deg)",
                                      transition: "transform 0.2s",
                                    }}
                                  />
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* 其他信息 */}
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">
                              {t("Weight:")}
                            </span>
                            <WeightText
                              weight={parcel.package_weight}
                              className="text-sm text-gray-900"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">
                              {t("Dimension:")}
                            </span>
                            <span className="text-xs text-gray-900">
                              {formatDimension(
                                parcel.length,
                                parcel.width,
                                parcel.height,
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {parcel.attributes.length > 0 ? (
                            parcel.attributes.map((attribute) => (
                              <span
                                key={attribute}
                                className="bg-primary/10 text-primary rounded px-2 py-1 text-xs"
                              >
                                {attribute}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-gray-500">{"—"}</span>
                          )}
                        </div>
                      </div>

                      {parcel.freeDays != null && (
                        <div className="flex items-center gap-2 text-sm text-blue-600">
                          <Clock className="h-4 w-4" />
                          <span>
                            {t("Remaining Storage ")}
                            {parcel.freeDays} {t("days")}
                          </span>
                        </div>
                      )}

                      {/* Standard QC */}
                      {parcel.package_pictures &&
                        parcel.package_pictures.length > 0 && (
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 text-xs text-gray-500">
                              {t("Standard QC")}
                            </span>
                            <QcImageThumbnails
                              pictures={parcel.package_pictures}
                              onImageClick={handleQcImageClick}
                            />
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* 底部固定栏 - 只在 Stored tab 显示 */}
          {!result.loading && !result.error && (
            <div
              className="fixed bottom-0 z-50 border-t border-gray-200 bg-white px-2 py-3 shadow-lg md:px-4"
              style={{
                width: containerWidth ? `${containerWidth}px` : "auto",
                left: containerLeft !== null ? `${containerLeft}px` : "50%",
                transform: containerWidth ? "none" : "translateX(-50%)",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Checkbox
                    className="size-4"
                    checked={isAllSelected}
                    disabled={!eligibleIds.length}
                    onCheckedChange={() =>
                      setSelectedIds(isAllSelected ? [] : eligibleIds)
                    }
                  />
                  <span className="text-sm text-gray-700">{t("ALL")}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-600">
                    {t("Total weight:")}{" "}
                    <WeightText
                      weight={totalWeight}
                      className="text-[#FF5B00]"
                    />
                  </div>
                  <Button
                    onClick={handleSubmit}
                    className="px-6 py-2 text-sm font-medium"
                    style={{
                      backgroundColor: "#FF5B00",
                      color: "white",
                    }}
                  >
                    {`${t("submit")}(${selected.length})`}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <ImagePreviewLightbox
            open={qcLightboxOpen}
            onClose={() => setQcLightboxOpen(false)}
            slides={qcLightboxSlides}
            index={qcLightboxIndex}
            closeOnBackdropClick
          />
        </div>
      }
    </Section>
  );
}
