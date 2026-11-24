/* eslint-disable @next/next/no-img-element -- Original list thumbnails use authenticated or external image URLs. */
/**
 * PackageList component
 * Package list with status filters and pagination
 */
"use client";
import { ImagePreviewLightbox } from "@/components/image-preview-lightbox";
import { CustomPagination } from "@/components/custom/custom-pagination";
import { fixImageUrl } from "@/lib/utils/image-url";
import { Section } from "@/components/layout/section";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MemberEmptyState } from "@/components/features/account/member-empty-state";
import {
  LogisticsLoadState,
  checkoutPath,
  shipmentDetailPath,
} from "@/components/features/logistics/procurement-logistics";
import { useTranslations } from "next-intl";
import { getErrorMessage } from "@/lib/error-message";
import { useProcurementResource } from "@/hooks/use-procurement-resource";
import {
  createProcurementCheckout,
  getProcurementShipments,
  getProcurementTracking,
} from "@/lib/procurement/client";
import type {
  ProcurementListQuery,
  ProcurementShipment,
} from "@/lib/procurement/logistics-types";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-mobile";
import { LOCALE_HTML_LANG } from "@/lib/locale";
import { cn, copyToClipboard } from "@/lib/utils";
import { useLocaleStore } from "@/stores/locale-store";
import dayjs from "dayjs";
import { ArrowRight, ChevronDown, Copy, Truck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
const shipmentStatuses = [
  "all",
  "consolidating",
  "to_pay",
  "ready_to_ship",
  "in_transit",
  "completed",
] as const;

function shipmentRow(shipment: ProcurementShipment) {
  const status = shipmentStatuses.findIndex(
    (value) => value === shipment.status.toLowerCase(),
  );
  const currency =
    shipment.shippingMethod?.currency ?? shipment.charges?.[0]?.currency;
  return {
    id: shipment.id,
    order_sn: shipment.publicId,
    status,
    statusLabel: shipment.displayStatus.label,
    created_at: shipment.createdAt,
    logistics_sn: shipment.trackingNumber,
    express_line: shipment.shippingMethod
      ? { name: shipment.shippingMethod.routeName }
      : null,
    payment_weight: shipment.finalWeightGrams,
    length: shipment.finalLengthMm,
    width: shipment.finalWidthMm,
    height: shipment.finalHeightMm,
    freight:
      currency && status !== 1
        ? currency + " " + (shipment.amountFen / 100).toFixed(2)
        : "—",
    pack_pictures: shipment.photos.flatMap((photo) =>
      photo.url ? [{ id: photo.id, full_path: photo.url }] : [],
    ),
  };
}
type ShipmentRow = ReturnType<typeof shipmentRow>;

function PackageListLoadingSkeleton() {
  return (
    <>
      <div className="hidden md:block">
        <div
          className="mb-4 grid gap-4 rounded-lg bg-gray-100 px-4 py-3"
          style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr" }}
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton
              key={index}
              className={index === 0 ? "h-4 w-24" : "h-4 w-16"}
            />
          ))}
        </div>

        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="rounded-lg border border-gray-200 p-4">
              <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-5 w-16 rounded" />
              </div>
              <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr]">
                <div className="pt-5">
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="pt-5">
                  <Skeleton className="h-4 w-12" />
                </div>
                <div className="pt-5">
                  <Skeleton className="h-4 w-16" />
                </div>
                <div className="flex gap-1 pt-5">
                  <Skeleton className="h-12 w-12 rounded" />
                  <Skeleton className="h-12 w-12 rounded" />
                </div>
                <div className="pt-5">
                  <Skeleton className="h-4 w-16" />
                </div>
                <div className="pt-4">
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-4 space-y-4 md:hidden">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="space-y-2 rounded-lg bg-white p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-5 w-16 rounded" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-36" />
            </div>
            <div>
              <Skeleton className="mb-2 h-3 w-24" />
              <div className="flex gap-1">
                <Skeleton className="h-12 w-12 rounded" />
                <Skeleton className="h-12 w-12 rounded" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// Client-only component
export default function PageClient() {
  const pageSize = 10;
  const t = useTranslations();

  const locale = useLocaleStore((state) => state.locale);
  const tabConfig = [
    { label: t("ALL"), value: 0 },
    { label: t("Processing"), value: 1 },
    { label: t("Pending payment"), value: 2 },
    { label: t("Pending Shipment"), value: 3 },
    { label: t("On the Way"), value: 4 },
    { label: t("Received"), value: 5 },
    { label: t("Under Review"), value: 11 },
    { label: t("Review Rejected"), value: 12 },
  ];
  const router = useRouter();
  const isMobile = useIsMobile();
  const mounted = useHydrated();
  const searchParams = useSearchParams();
  const routeStatus = Number(searchParams.get("status") ?? 0);
  const [activeTab, setActiveTab] = useState(
    shipmentStatuses[routeStatus] ? routeStatus : 0,
  );
  const [query, setQuery] = useState<ProcurementListQuery>({
    page: 1,
    pageSize,
    status: shipmentStatuses[activeTab],
    q: "",
  });
  const result = useProcurementResource(getProcurementShipments, query);
  const [additional, setAdditional] = useState<ProcurementShipment[]>([]);
  const [mobilePage, setMobilePage] = useState(1);
  const [mobileLoadingMore, setMobileLoadingMore] = useState(false);
  const [mobileError, setMobileError] = useState<Error>();
  const mobileRequest = useRef(0);
  const orders = [
    ...(result.data?.items ?? []),
    ...(isMobile ? additional : []),
  ].map(shipmentRow);
  const total = result.data?.total ?? 0;
  const hasMoreMobile =
    mobilePage * (result.data?.pageSize ?? query.pageSize) < total;
  const [trackingOrder, setTrackingOrder] = useState<ShipmentRow>();
  const tracking = useProcurementResource(
    getProcurementTracking,
    trackingOrder?.id ?? null,
  );
  const trackingData =
    tracking.data?.events.map((event) => ({
      context: [event.title, event.location].filter(Boolean).join(" · "),
      ftime: event.at,
    })) ?? [];
  const [paying, setPaying] = useState<string>();
  const [packPhotoLightboxOpen, setPackPhotoLightboxOpen] = useState(false);
  const [packPhotoSlides, setPackPhotoSlides] = useState<
    {
      src: string;
    }[]
  >([]);
  const [packPhotoIndex, setPackPhotoIndex] = useState(0);
  const handlePackPhotoClick = useCallback(
    (pics: ShipmentRow["pack_pictures"], index: number) => {
      const urls = pics.map((p) => p.full_path);
      setPackPhotoSlides(urls.map((src) => ({ src: fixImageUrl(src) })));
      setPackPhotoIndex(index);
      setPackPhotoLightboxOpen(true);
    },
    [],
  );
  function handlePageChange(
    page: number,
    pageSize: number,
    status = activeTab,
  ) {
    mobileRequest.current++;
    setAdditional([]);
    setMobilePage(page);
    setMobileLoadingMore(false);
    setMobileError(undefined);
    setQuery({ page, pageSize, status: shipmentStatuses[status], q: "" });
  }

  function handleTabChange(status: number) {
    if (status === activeTab) return;
    setActiveTab(status);
    handlePageChange(1, query.pageSize, status);
  }

  const loadMoreMobile = useCallback(async () => {
    if (mobileLoadingMore || !hasMoreMobile) return;
    const request = ++mobileRequest.current;
    setMobileLoadingMore(true);
    setMobileError(undefined);
    try {
      const next = await getProcurementShipments({
        ...query,
        page: mobilePage + 1,
      });
      if (request !== mobileRequest.current) return;
      setAdditional((current) => [...current, ...next.items]);
      setMobilePage(next.page);
    } catch (error) {
      if (request === mobileRequest.current)
        setMobileError(
          error instanceof Error ? error : new Error(t("Request failed")),
        );
    } finally {
      if (request === mobileRequest.current) setMobileLoadingMore(false);
    }
  }, [mobileLoadingMore, hasMoreMobile, query, mobilePage, t]);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (
      !isMobile ||
      !sentinel ||
      !hasMoreMobile ||
      mobileLoadingMore ||
      mobileError
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          void loadMoreMobile();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isMobile, hasMoreMobile, mobileLoadingMore, mobileError, loadMoreMobile]);

  function handleCopyOrderSn(value: string) {
    void copyToClipboard(value, {
      success: t("Copied to clipboard"),
      error: t("Copy failed"),
    });
  }

  async function pay(id: string) {
    if (paying) return;
    setPaying(id);
    try {
      const checkout = await createProcurementCheckout([id]);
      router.push(checkoutPath(checkout.id));
    } catch (error) {
      toast.error(getErrorMessage(error) || t("Request failed"));
      setPaying(undefined);
    }
  }
  const formatWeight = (weight: number | null | undefined) => {
    if (weight == null) return t("-");
    return `${(weight / 1000).toFixed(3)} KG`;
  };
  const formatDimension = (
    length?: number | null,
    width?: number | null,
    height?: number | null,
  ) => {
    if (length == null || width == null || height == null) return t("-");
    return `${(length / 10).toFixed(2)}*${(width / 10).toFixed(2)}*${(height / 10).toFixed(2)} CM`;
  };
  /** Dimension: shipment final size (mm → cm); "-" when any side is missing. */
  const formatDimensionCell = (order: ShipmentRow): string =>
    formatDimension(order.length, order.width, order.height);
  const formatDimensionRowText = (order: ShipmentRow): string =>
    `${t("Dimension:")} ${formatDimensionCell(order)}`;
  const handleOrderClick = (orderId: string) => {
    router.push(shipmentDetailPath(orderId));
  };
  function handleOpenLogisticsModal(
    event: React.MouseEvent,
    order: ShipmentRow,
  ) {
    event.stopPropagation();
    setTrackingOrder(order);
  }
  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString(LOCALE_HTML_LANG[locale], {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return dateString;
    }
  };
  const handleCopyTracking = handleCopyOrderSn;
  if (!mounted) {
    return (
      <Section className="px-0">
        {
          <div className="mt-0 mb-8 rounded-lg md:mt-4 md:bg-white md:p-4">
            <div className="mb-4 flex w-full items-center gap-2 overflow-x-auto bg-white px-4 py-3 max-md:sticky max-md:top-[calc(var(--header-height,0px)+var(--announcement-bar-height,0px))] max-md:z-40 md:gap-4 md:border-b md:border-gray-200 md:bg-transparent md:px-0 md:py-0 md:pb-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-4 w-16 shrink-0" />
              ))}
            </div>
            <PackageListLoadingSkeleton />
          </div>
        }
      </Section>
    );
  }
  return (
    <Section className="px-0">
      {
        <div className="mt-0 mb-8 rounded-lg md:mt-4 md:bg-white md:p-4">
          {/* Tab 切换 */}
          <div className="hide-scrollbar mb-4 flex w-full [scrollbar-width:none] gap-2 overflow-x-auto overscroll-x-contain scroll-smooth border-b-0 border-gray-200 bg-white px-4 [-ms-overflow-style:none] max-md:sticky max-md:top-[calc(var(--header-height,0px)+var(--announcement-bar-height,0px))] max-md:z-40 md:gap-4 md:overflow-x-hidden md:border-b md:bg-transparent md:px-0 md:pb-3 [&::-webkit-scrollbar]:hidden">
            {tabConfig
              .filter((tab) => ![11, 12].includes(tab.value))
              .map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => handleTabChange(tab.value)}
                  className={cn(
                    "shrink-0 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors md:px-4 md:py-2",
                    activeTab === tab.value
                      ? "text-primary border-primary border-b-2"
                      : "text-gray-500 hover:text-gray-700",
                  )}
                >
                  {tab.label}
                </button>
              ))}
          </div>

          {/* List */}
          {result.loading ? (
            <PackageListLoadingSkeleton />
          ) : result.error ? (
            <LogisticsLoadState {...result} />
          ) : orders.length === 0 ? (
            <MemberEmptyState variant="shipments" label={t("No shipments")} />
          ) : (
            <>
              {/* Desktop: table header */}
              <div
                className="mb-4 hidden gap-4 rounded-lg bg-gray-100 px-4 py-3 text-sm font-medium text-gray-600 md:grid"
                style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr" }}
              >
                <div>{t("Shipping Type")}</div>
                <div>{t("Weight")}</div>
                <div>{t("Dimension")}</div>
                <div>{t("Packing Photos")}</div>
                <div>{t("Total Freight")}</div>
                <div>{t("Operate")}</div>
              </div>

              {/* Desktop: order rows */}
              <div className="hidden space-y-4 md:block">
                {orders.map((order) => {
                  const packPictures = order.pack_pictures || [];
                  return (
                    <div
                      key={order.id}
                      className="cursor-pointer rounded-lg border border-gray-200 p-4 transition-shadow hover:shadow-md"
                      onClick={() => handleOrderClick(order.id)}
                    >
                      {/* Row 1: order no. & time */}
                      <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {order.order_sn}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyOrderSn(order.order_sn);
                            }}
                            className="cursor-pointer text-gray-400 transition-colors hover:text-gray-600"
                            title={t("Copy order number")}
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <div className="text-xs text-gray-400">
                            {dayjs(order.created_at).format(
                              "YYYY-MM-DD HH:mm:ss",
                            )}
                          </div>
                          {order.status !== 0 && (
                            <div className="text-primary bg-primary/20 rounded px-2 py-1 text-xs font-medium">
                              {tabConfig.find(
                                (tab) => tab.value === order.status,
                              )?.label || order.statusLabel}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Grid below header */}
                      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr]">
                        {/* Shipping Type */}
                        <div className="md:col-span-1">
                          <div
                            className="text-sm"
                            style={{ paddingTop: "20px" }}
                          >
                            {order.express_line?.name || "-"}
                          </div>
                        </div>

                        {/* Weight */}
                        <div className="md:col-span-1">
                          <div
                            className="text-sm"
                            style={{ paddingTop: "20px" }}
                          >
                            {order.status == 1
                              ? "-"
                              : formatWeight(order.payment_weight)}
                          </div>
                        </div>

                        {/* Dimension */}
                        <div className="md:col-span-1">
                          <div
                            className="text-sm"
                            style={{ paddingTop: "20px" }}
                          >
                            {formatDimensionCell(order)}
                          </div>
                        </div>

                        {/* Packing Photos */}
                        <div className="md:col-span-1">
                          <div
                            className="flex flex-wrap gap-1"
                            style={{ paddingTop: "20px" }}
                          >
                            {packPictures.length > 0 ? (
                              packPictures.slice(0, 5).map((pic, idx) => (
                                <img
                                  key={pic.id || idx}
                                  src={fixImageUrl(pic.full_path)}
                                  alt={`${t("Package")} ${idx + 1}`}
                                  className="h-12 w-12 cursor-pointer rounded border border-gray-200 object-cover hover:opacity-90"
                                  referrerPolicy="no-referrer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePackPhotoClick(packPictures, idx);
                                  }}
                                  onError={(e) => {
                                    (
                                      e.target as HTMLImageElement
                                    ).style.display = "none";
                                  }}
                                />
                              ))
                            ) : (
                              <div className="text-sm">-</div>
                            )}
                          </div>
                        </div>

                        {/* Total Freight */}
                        <div className="md:col-span-1">
                          <div
                            className="text-sm font-medium"
                            style={{ paddingTop: "20px" }}
                          >
                            <bdi dir="ltr">{order.freight}</bdi>
                          </div>
                        </div>

                        {/* Operate + Pay（支付单独展示，不在下拉里） */}
                        <div className="md:col-span-1">
                          <div
                            className="flex flex-col items-start gap-2"
                            style={{ paddingTop: "16px" }}
                          >
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-auto w-full border-0 p-0 shadow-none hover:bg-transparent md:w-auto"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {t("Operate")}
                                  <ChevronDown className="ms-1 h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="cursor-pointer"
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor =
                                      "rgba(255, 91, 0, 0.1)";
                                    e.currentTarget.style.color =
                                      "var(--primary)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "";
                                    e.currentTarget.style.color = "";
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOrderClick(order.id);
                                  }}
                                >
                                  {t("Detail")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            {order.status === 2 && (
                              <button
                                type="button"
                                disabled={!!paying}
                                className="cursor-pointer text-xs text-red-500 hover:underline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void pay(order.id);
                                }}
                              >
                                {paying === order.id ? (
                                  <Spinner />
                                ) : (
                                  t("Pay now")
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {order.status > 2 && order.logistics_sn && (
                        <div
                          className="mt-4 flex cursor-pointer items-center gap-3 rounded-lg p-3"
                          style={{ backgroundColor: "rgba(255, 91, 0, 0.1)" }}
                          onClick={(e) => handleOpenLogisticsModal(e, order)}
                        >
                          <Truck
                            className="h-5 w-5"
                            style={{ color: "#FF5B00" }}
                          />
                          <div className="flex-1">
                            <div
                              className="text-sm font-medium"
                              style={{ color: "#FF5B00" }}
                            >
                              {t("In Transit")}{" "}
                            </div>
                          </div>
                          <ArrowRight
                            className="h-4 w-4"
                            style={{ color: "#FF5B00" }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop: pagination */}
              {total > 0 && (
                <div className="mt-6 hidden md:block">
                  <CustomPagination
                    total={total}
                    currentPage={query.page}
                    totalPages={Math.ceil(total / query.pageSize)}
                    pageSize={query.pageSize}
                    onPageChange={handlePageChange}
                  />
                </div>
              )}

              {/* Mobile: order cards */}
              <div className="mx-4 space-y-4 md:hidden">
                {orders.map((order) => {
                  const packPictures = order.pack_pictures || [];
                  return (
                    <div
                      key={order.id}
                      className="cursor-pointer space-y-2 rounded-lg bg-white p-4"
                      onClick={() => handleOrderClick(order.id)}
                    >
                      {/* Order no. & status */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {order.order_sn}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyOrderSn(order.order_sn);
                            }}
                            className="cursor-pointer text-gray-400 transition-colors hover:text-gray-600"
                            title={t("Copy order number")}
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex items-center">
                          {/* <div className="text-xs text-gray-400">
                  {dayjs(order.created_at).format("YYYY-MM-DD HH:mm:ss")}
                </div> */}
                          {order.status !== 0 && (
                            <div
                              className="text-primary rounded px-2 py-1 text-xs font-medium"
                              style={{
                                backgroundColor: "rgba(255, 91, 0, 0.1)",
                              }}
                            >
                              {tabConfig.find(
                                (tab) => tab.value === order.status,
                              )?.label || order.statusLabel}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 text-xs text-gray-600">
                          <span className="shrink-0">
                            {t("Shipping Type")}:
                          </span>
                          <span className="min-w-0 text-end break-words">
                            {order.express_line?.name || "-"}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-600">
                          <span>
                            {t("Weight:")}{" "}
                            {order.status == 1
                              ? "-"
                              : formatWeight(order.payment_weight)}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-600">
                          <span>{formatDimensionRowText(order)}</span>
                        </div>
                      </div>

                      {/* Packing Photos */}
                      <div>
                        <div className="mb-2 text-xs text-gray-500">
                          {t("Packing Photos")}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {packPictures.length > 0 ? (
                            packPictures.slice(0, 5).map((pic, idx) => (
                              <img
                                key={pic.id || idx}
                                src={fixImageUrl(pic.full_path)}
                                alt={`${t("Package")} ${idx + 1}`}
                                referrerPolicy="no-referrer"
                                className="h-12 w-12 cursor-pointer rounded border border-gray-200 object-cover hover:opacity-90"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePackPhotoClick(packPictures, idx);
                                }}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display =
                                    "none";
                                }}
                              />
                            ))
                          ) : (
                            <div className="text-sm">-</div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-end border-t border-gray-100 pt-2">
                        {order.status !== 1 && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">
                              {t("Total Freight:")}
                            </span>
                            <span
                              className="text-sm font-medium"
                              style={{ color: "#FF5B00" }}
                            >
                              <bdi dir="ltr">{order.freight}</bdi>
                            </span>
                          </div>
                        )}
                      </div>

                      {order.status > 2 && order.logistics_sn && (
                        <div
                          className="flex cursor-pointer items-center gap-3 rounded-lg p-3"
                          style={{ backgroundColor: "rgba(255, 91, 0, 0.1)" }}
                          onClick={(e) => handleOpenLogisticsModal(e, order)}
                        >
                          <Truck
                            className="h-5 w-5"
                            style={{ color: "#FF5B00" }}
                          />
                          <div className="flex-1">
                            <div
                              className="text-sm font-medium"
                              style={{ color: "#FF5B00" }}
                            >
                              {t("In Transit")}{" "}
                            </div>
                          </div>
                          <ArrowRight
                            className="h-4 w-4"
                            style={{ color: "#FF5B00" }}
                          />
                        </div>
                      )}

                      <div className="flex justify-end">
                        {order.status === 2 && (
                          <Button
                            disabled={!!paying}
                            className="h-10 rounded-lg text-sm font-medium"
                            style={{
                              backgroundColor: "#FF5B00",
                              color: "white",
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              void pay(order.id);
                            }}
                          >
                            {paying === order.id ? <Spinner /> : t("Pay")}
                          </Button>
                        )}
                        <Button
                          className="ms-2 h-10 rounded-lg text-sm font-medium"
                          style={{
                            backgroundColor: "transparent",
                            color: "#FF5B00",
                            border: "1px solid #FF5B00",
                          }}
                          onClick={() => handleOrderClick(order.id)}
                        >
                          {t("Details")}
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {hasMoreMobile && <div ref={loadMoreRef} className="h-px" />}
                {mobileError && (
                  <LogisticsLoadState
                    loading={false}
                    error={mobileError}
                    reload={() => void loadMoreMobile()}
                  />
                )}
                {mobileLoadingMore && (
                  <div className="flex justify-center py-4">
                    <Spinner />
                  </div>
                )}
                {!hasMoreMobile && orders.length > 0 && (
                  <div className="py-4 text-center text-sm text-gray-500">
                    {t("No more data")}
                  </div>
                )}
              </div>
            </>
          )}

          {isMobile && (
            <Sheet
              open={!!trackingOrder}
              onOpenChange={(open) => {
                if (!open) setTrackingOrder(undefined);
              }}
            >
              <SheetContent
                side="bottom"
                className="flex max-h-[90vh] flex-col overflow-hidden rounded-t-2xl p-5"
              >
                <SheetHeader className="shrink-0">
                  <SheetTitle className="text-center text-base font-bold text-[#1a1a1a]">
                    {t("Tracking")}
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
                  <LogisticsLoadState
                    error={tracking.error}
                    loading={false}
                    reload={tracking.reload}
                  />
                  <LogisticsContent
                    trackingNumber={
                      tracking.data?.trackingNumber ??
                      trackingOrder?.logistics_sn ??
                      ""
                    }
                    trackingData={trackingData}
                    trackingLoading={tracking.loading}
                    formatDateTime={formatDateTime}
                    handleCopyTracking={handleCopyTracking}
                  />
                </div>
              </SheetContent>
            </Sheet>
          )}

          {!isMobile && (
            <Dialog
              open={!!trackingOrder}
              onOpenChange={(open) => {
                if (!open) setTrackingOrder(undefined);
              }}
            >
              <DialogContent className="max-w-[min(90vw,600px)] rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="text-center text-base font-bold text-[#1a1a1a]">
                    {t("Tracking")}
                  </DialogTitle>
                </DialogHeader>
                <div className="mt-4 max-h-[60vh] overflow-y-auto">
                  <LogisticsLoadState
                    error={tracking.error}
                    loading={false}
                    reload={tracking.reload}
                  />
                  <LogisticsContent
                    trackingNumber={
                      tracking.data?.trackingNumber ??
                      trackingOrder?.logistics_sn ??
                      ""
                    }
                    trackingData={trackingData}
                    trackingLoading={tracking.loading}
                    formatDateTime={formatDateTime}
                    handleCopyTracking={handleCopyTracking}
                  />
                </div>
              </DialogContent>
            </Dialog>
          )}

          <ImagePreviewLightbox
            open={packPhotoLightboxOpen}
            onClose={() => setPackPhotoLightboxOpen(false)}
            slides={packPhotoSlides}
            index={packPhotoIndex}
            closeOnBackdropClick
          />
        </div>
      }
    </Section>
  );
}
function LogisticsContent({
  trackingNumber,
  trackingData,
  trackingLoading,
  formatDateTime,
  handleCopyTracking,
}: {
  trackingNumber: string;
  trackingData: Array<{
    context: string;
    ftime: string;
  }>;
  trackingLoading: boolean;
  formatDateTime: (dateString: string) => string;
  handleCopyTracking: (trackingNumber: string) => void;
}) {
  const t = useTranslations();
  const sortedTrackings = [...trackingData].reverse();
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">
          {t("International tracking no:")}
        </span>
        <span className="text-base font-semibold text-gray-900">
          {trackingNumber || "—"}
        </span>
        {trackingNumber && (
          <button
            onClick={() => handleCopyTracking(trackingNumber)}
            className="rounded p-1 transition-colors hover:bg-gray-100"
            aria-label={t("Copy tracking number")}
          >
            <Copy className="h-4 w-4 text-gray-500" />
          </button>
        )}
      </div>

      {trackingLoading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Spinner className="h-3 w-3" />
          <span className="text-sm">{t("Loading…")}</span>
        </div>
      ) : sortedTrackings.length > 0 ? (
        <div className="relative ps-1">
          {sortedTrackings.length > 1 && (
            <div
              className="absolute w-0.5 bg-gray-200"
              style={{
                left: "8px",
                top: "8px",
                bottom: "8px",
              }}
            />
          )}

          <div className="space-y-0">
            {sortedTrackings.map((item, index) => {
              const isLatest = index === 0;
              return (
                <div
                  key={index}
                  className="relative flex items-start gap-3 pb-6 last:pb-0"
                >
                  <div className="relative z-10 mt-2 shrink-0">
                    <div
                      className={`h-3 w-3 rounded-full border-2 ${
                        isLatest
                          ? "bg-primary border-primary"
                          : "border-gray-300 bg-white"
                      }`}
                    />
                  </div>

                  <div className="flex-1 pt-0.5">
                    <div className="mb-1">
                      <span
                        className={`text-sm ${isLatest ? "text-primary font-medium" : "text-gray-500"}`}
                      >
                        {item.context}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDateTime(item.ftime)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-500">
          {t("No logistics information available at the moment")}
        </div>
      )}
    </div>
  );
}
