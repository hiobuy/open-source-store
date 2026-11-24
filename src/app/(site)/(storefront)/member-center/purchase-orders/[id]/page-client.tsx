"use client";
import { ConsultDetailDialog } from "@/components/consult-detail";
import { ImagePreviewLightbox } from "@/components/image-preview-lightbox";
import { CustomPhotoModal } from "@/components/features/checkout/custom-photo-modal";
import { RemarkModal } from "@/components/features/checkout/remark-modal";
import { fixImageUrl } from "@/lib/utils/image-url";
import { ResponsiveContentFrame } from "@/components/layout/responsive-content-frame";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  formatPurchaseAmount,
  getPurchaseBill,
} from "@/components/features/orders/procurement-purchase-order";
import {
  getProcurementPurchaseOrder,
  getProcurementPurchaseOrderAttachmentUrl,
} from "@/lib/procurement/client";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";
import { useTranslations } from "next-intl";
import {
  type DaigouOrderData,
  type OrderService,
  type OrderSku,
} from "@/lib/client/services/order-types";
import { LOCALE_HTML_LANG } from "@/lib/locale";
import { usePriceConvert } from "@/lib/store/common";
import { cn, copyToClipboard, formatOrderStatus } from "@/lib/utils";
import { getGoodsLink } from "@/lib/procurement/purchase";
import { useLocaleStore } from "@/stores/locale-store";
import dayjs from "dayjs";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  Copy,
  FileEdit,
  MessageCircle,
  Plane,
  ShoppingCart,
  Truck,
  Warehouse,
} from "lucide-react";
import { useRouter } from "next/navigation";
import ProgressReact, { useCallback, useEffect, useRef, useState } from "react";
import type {
  ProcurementPurchaseBill,
  ProcurementPurchaseLogistics,
} from "@/lib/procurement/types";
type TrackingEvent = { context: string; ftime: string };
type OrderShipment = {
  id: string;
  order_sn: string;
  tracking_number: string | null;
  events: TrackingEvent[];
};
type OrderDetail = Omit<
  DaigouOrderData,
  | "id"
  | "orbit"
  | "skus"
  | "goods_amount"
  | "freight_fee"
  | "service_fee"
  | "vas_fee"
  | "amount"
> & {
  id: string;
  skus: (Omit<OrderSku, "id" | "price" | "amount"> & {
    id: string;
    price?: number;
  })[];
  goods_amount?: number;
  freight_fee?: number;
  service_fee?: number;
  vas_fee?: number;
  amount?: number;
  currency?: string;
  stage: string;
  payment_method?: ProcurementPurchaseBill["paymentMethod"];
  orbit?: OrderShipment[];
};

/** Domestic parcel numbers for the progress bubble (seller → warehouse). */
function domesticExpresses(logistics?: ProcurementPurchaseLogistics) {
  return (logistics?.domesticParcels ?? [])
    .filter((parcel) => parcel.trackingNumber)
    .map((parcel) => ({
      id: parcel.packageId ?? parcel.trackingNumber,
      pivot: { express_num: parcel.trackingNumber },
    }));
}

/** International shipments with carrier events, oldest first. */
function internationalShipments(
  logistics?: ProcurementPurchaseLogistics,
): OrderShipment[] {
  return (logistics?.internationalShipments ?? []).map((shipment) => ({
    id: shipment.shipmentId,
    order_sn: shipment.publicId,
    tracking_number: shipment.trackingNumber,
    events: [...shipment.events]
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .map((event) => ({
        context: event.location
          ? `${event.title} · ${event.location}`
          : event.title,
        ftime: event.at,
      })),
  }));
}

// Item-level "Contact" is hidden until the consultation API is available.
const SHOW_ITEM_CONTACT = false;

const progressStatus: Record<string, { status: number; sub_status?: number }> =
  {
    awaiting_payment: { status: 0 },
    pending: { status: 1 },
    buying: { status: 2 },
    transit: { status: 4 },
    partial: { status: 4 },
    stocked: { status: 5 },
    packed: { status: 6, sub_status: 63 },
    shipped: { status: 6, sub_status: 65 },
    cancelled: { status: 10 },
  };

async function loadOrderDetail(id: string): Promise<OrderDetail> {
  const order = await getProcurementPurchaseOrder(id);
  const bill = getPurchaseBill(order);
  const progress = progressStatus[order.stage];
  return {
    id: order.id,
    order_sn: order.number,
    status: progress?.status ?? -1,
    status_name: order.status,
    sub_status: progress?.sub_status,
    stage: order.stage,
    expresses: domesticExpresses(order.logistics),
    orbit: internationalShipments(order.logistics),
    created_at: new Date(order.createdAt).toISOString(),
    paid_at: bill?.paidAt ? new Date(bill.paidAt).toISOString() : undefined,
    payment_method: bill?.paymentMethod ?? null,
    goods_amount: bill && bill.goodsCents / 100,
    freight_fee: bill && bill.shippingCents / 100,
    service_fee: bill && bill.serviceCents / 100,
    amount: bill && bill.totalCents / 100,
    currency: bill?.currency,
    skus: order.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      remark: item.remark ?? "",
      requirement_images: (item.attachments ?? []).map((attachment) =>
        getProcurementPurchaseOrderAttachmentUrl(order.id, attachment.id),
      ),
      platform_url: item.sourceUrl ?? undefined,
      sku_info: {
        sku_img: item.imageUrl ?? undefined,
        specs: item.variantLabel
          ? [{ label: "", value: item.variantLabel }]
          : [],
      },
    })),
  };
}

function getProgressSteps(t: Translator) {
  return [
    { key: "purchasing", label: t("Purchasing"), icon: ShoppingCart },
    { key: "warehouse", label: t("Warehouse"), icon: Warehouse },
    { key: "dispatch", label: t("Dispatch"), icon: Truck },
    { key: "transport", label: t("Transport"), icon: Plane },
  ];
}
function getProgressIndex(status: number, sub_status?: number): number {
  if ([1, 2, 3, 4, 20].includes(status)) return 1; // 待支付 ，已付款，采购中，商家待发货，商家已发货，待确认
  if (status == 5) return 2; //  已入库
  if (status == 6 && sub_status == 65) return 4; // 已发货
  if (status == 6 && sub_status == 66) return 4; // 已收货
  if (status == 6) return 3; // 已集包
  return 0; // 运输中
}
function DaigouOrderDetailLoadingSkeleton() {
  const summaryLines = [0, 1, 2].map((i) => (
    <div key={i} className="flex items-center justify-between">
      <Skeleton className="h-3 w-16 bg-gray-200!" />
      <Skeleton className="h-3 w-32 bg-gray-200!" />
    </div>
  ));
  return (
    <div className="mt-4 mb-10">
      {/* 移动端：垂直卡片布局 */}
      <div className="flex flex-col gap-4 lg:hidden">
        {/* 商品卡片 */}
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Skeleton className="h-4 w-40 bg-gray-200!" />
            <Skeleton className="h-4 w-4 rounded bg-gray-200!" />
          </div>
          {[0, 1].map((i) => (
            <div
              key={i}
              className="mb-3 border-b border-gray-100 pb-3 last:mb-0 last:border-0 last:pb-0"
            >
              <div className="flex gap-3">
                <Skeleton className="h-20 w-20 shrink-0 rounded-lg bg-gray-200!" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-full bg-gray-200!" />
                  <Skeleton className="h-3 w-2/3 bg-gray-200!" />
                  <div className="flex items-center justify-between pt-1">
                    <Skeleton className="h-4 w-16 bg-gray-200!" />
                    <Skeleton className="h-4 w-8 bg-gray-200!" />
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <Skeleton className="h-4 w-16 bg-gray-200!" />
                <Skeleton className="h-6 w-16 rounded-full bg-gray-200!" />
              </div>
            </div>
          ))}
        </div>
        {/* 订单摘要 */}
        <div className="space-y-3 rounded-xl bg-white p-4">
          <div className="border-b border-[#E2E4F0] pb-2">
            <Skeleton className="h-4 w-44 bg-gray-200!" />
          </div>
          {summaryLines}
          <div className="flex items-center justify-between pt-1">
            <Skeleton className="h-3 w-16 bg-gray-200!" />
            <Skeleton className="h-4 w-20 bg-gray-200!" />
          </div>
        </div>
      </div>

      {/* 桌面端：原有布局 */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-3">
        <div className="space-y-6 rounded-xl bg-white p-4 lg:col-span-2">
          <Skeleton className="mb-3 h-6 w-24 bg-gray-200!" />
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex gap-2">
                  <Skeleton className="h-20 w-20 shrink-0 rounded-md bg-gray-200!" />
                  <div className="w-[235px] space-y-2">
                    <Skeleton className="h-4 w-full bg-gray-200!" />
                    <Skeleton className="h-3 w-2/3 bg-gray-200!" />
                    <Skeleton className="h-3 w-24 bg-gray-200!" />
                  </div>
                </div>
                <Skeleton className="h-4 w-16 bg-gray-200!" />
                <Skeleton className="h-4 w-6 bg-gray-200!" />
                <Skeleton className="h-6 w-16 rounded-full bg-gray-200!" />
                <Skeleton className="h-4 w-14 bg-gray-200!" />
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-1">
          <div className="sticky top-4">
            <div className="space-y-3 rounded-xl bg-white p-4">
              <div className="border-b border-[#E2E4F0] pb-2">
                <Skeleton className="h-4 w-44 bg-gray-200!" />
              </div>
              {summaryLines}
              <div className="flex items-center justify-between pt-1">
                <Skeleton className="h-3 w-16 bg-gray-200!" />
                <Skeleton className="h-4 w-20 bg-gray-200!" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
type Translator = ReturnType<typeof useTranslations>;

interface ProgressOrderProgressProps {
  steps: Array<{
    key: string;
    label: string;
    icon: ProgressReact.ElementType;
  }>;
  progressIdx: number;
  trackingInfo?: Array<{
    id: unknown;
    created_at?: string;
    pivot?: {
      express_num?: string;
    };
  }>;
  orderStatus: number;
  packages?: unknown[];
  purchasePackages?: unknown[];
  subStatus?: number;
  orderSn?: string;
  orbit?: OrderShipment[];
}
function ProgressLogisticsContent({
  t,
  trackingNumber,
  trackingData,
  formatDateTime,
  handleCopyTracking,
}: {
  t: Translator;
  trackingNumber: string;
  trackingData: TrackingEvent[];
  formatDateTime: (dateString: string) => string;
  handleCopyTracking: (trackingNumber: string) => void;
}) {
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

      {sortedTrackings.length > 0 ? (
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
export default function PageClient({ id }: { id: string }) {
  const session = useProcurementSessionStore(
    (state) => state.clientStateVersion,
  );
  return <OrderDetailClient key={session} orderId={id} />;
}

function OrderDetailClient({ orderId }: { orderId: string }) {
  const translate = useTranslations();
  const t = translate;
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [expandTotal, setExpandTotal] = useState(false);
  const [remarkModalSku, setRemarkModalSku] = useState<
    OrderDetail["skus"][number] | null
  >(null);
  const [customPhotoModal, setCustomPhotoModal] = useState<{
    service: OrderService;
    sku: OrderDetail["skus"][number];
  } | null>(null);
  const [consultOpen, setConsultOpen] = useState(false);
  const [qcLightboxOpen, setQcLightboxOpen] = useState(false);
  const [qcLightboxSlides, setQcLightboxSlides] = useState<
    {
      src: string;
    }[]
  >([]);
  const [qcLightboxIndex, setQcLightboxIndex] = useState(0);
  const handleQcImageClick = useCallback((imgs: string[], index: number) => {
    setQcLightboxSlides(imgs.map((src) => ({ src: fixImageUrl(src) })));
    setQcLightboxIndex(index);
    setQcLightboxOpen(true);
  }, []);
  const [previousOrderId, setPreviousOrderId] = useState<string | null>(null);
  if (!Object.is(previousOrderId, orderId)) {
    setPreviousOrderId(orderId);
    setLoading(Boolean(orderId));
    setOrder(null);
  }
  useEffect(() => {
    if (!orderId) return;
    let current = true;
    loadOrderDetail(orderId).then(
      (response) => {
        if (current) {
          setOrder(response);
          setLoading(false);
        }
      },
      (error) => {
        if (current) {
          console.error("获取订单详情失败:", error);
          setOrder(null);
          setLoading(false);
        }
      },
    );
    return () => {
      current = false;
    };
  }, [orderId]);
  const priceConvert = usePriceConvert();
  const formatPrice = (amount?: number) =>
    amount === undefined
      ? "-"
      : order?.currency && order.currency !== "CNY"
        ? formatPurchaseAmount(Math.round(amount * 100), order.currency)
        : priceConvert(amount, { useSymbol: true });
  // 订单进度与物流
  const {
    steps: progressSteps,
    progressIdx: progressProgressIdx,
    trackingInfo: progressTrackingInfo,
    orderStatus: progressOrderStatus,
    packages: progressPackages,
    purchasePackages: progressPurchasePackages,
    subStatus: progressSubStatus,
    orderSn: progressOrderSn,
    orbit: progressOrbit = [],
  }: ProgressOrderProgressProps = {
    steps: getProgressSteps(t),
    progressIdx: getProgressIndex(order?.status ?? 0, order?.sub_status) - 1,
    trackingInfo: order?.expresses,
    orderStatus: order?.status ?? 0,
    packages: order?.packages,
    purchasePackages: order?.purchase_packages,
    subStatus: order?.sub_status,
    orderSn: order?.order_sn,
    orbit: order?.orbit ?? [],
  };
  const progressLocale = useLocaleStore((state) => state.locale);
  const progressT = t;
  const progressRouter = useRouter();
  const progressContainerRef = useRef<HTMLDivElement | null>(null);
  const progressStepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [progressBubbleLeft, progressSetBubbleLeft] = useState(0);
  const [progressArrowLeft, progressSetArrowLeft] = useState(0);
  const progressIsMobile = useIsMobile();
  const [progressShowLogisticsModal, progressSetShowLogisticsModal] =
    useState(false);
  const [progressSelectedOrderSn, progressSetSelectedOrderSn] =
    useState<string>("");
  const [progressTrackingData, progressSetTrackingData] = useState<
    TrackingEvent[]
  >([]);
  const progressHandleCopyTracking = (text: string) => {
    void copyToClipboard(text, {
      success: progressT("Successfully copied to clipboard"),
      error: progressT("Failed to copy to clipboard"),
    });
  };
  const progressFormatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString(LOCALE_HTML_LANG[progressLocale], {
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
  // 计算当前步骤位置
  useEffect(() => {
    const calcPosition = () => {
      if (
        !progressContainerRef.current ||
        !progressStepRefs.current[progressProgressIdx]
      )
        return;
      const containerRect =
        progressContainerRef.current.getBoundingClientRect();
      const stepRect =
        progressStepRefs.current[progressProgressIdx].getBoundingClientRect();
      // 节点中心
      const center = stepRect.left - containerRect.left + stepRect.width / 2;
      const BUBBLE_WIDTH = 343;
      const containerWidth = containerRect.width;
      const minLeft = BUBBLE_WIDTH / 2;
      const maxLeft = containerWidth - BUBBLE_WIDTH / 2;
      // 气泡位置（限制范围）
      const safeLeft = Math.min(Math.max(center, minLeft), maxLeft);
      progressSetBubbleLeft(safeLeft);
      // 箭头位置（相对于气泡）
      const arrowOffset = center - (safeLeft - BUBBLE_WIDTH / 2);
      progressSetArrowLeft(arrowOffset);
    };
    calcPosition();
    window.addEventListener("resize", calcPosition);
    return () => window.removeEventListener("resize", calcPosition);
  }, [progressProgressIdx]);
  const progressGetProgressMsg = () => {
    if (progressProgressIdx == 1)
      return progressT(
        "The goods have been warehoused Please apply for consolidation in a timely manner",
      );
    if (progressProgressIdx == 2)
      return progressT("The warehouse is packing your goods");
    if (progressProgressIdx == 3) {
      if (progressOrderStatus == 6 && progressSubStatus == 66) {
        return progressT(
          "Your package has been signed for Wish you a pleasant shopping experience!",
        );
      }
      if (progressOrderStatus == 6) {
        return progressT(
          "Your package has been dispatched from the warehouse The logistics trajectory will be updated according to the tracking number below",
        );
      }
    }
    if (progressProgressIdx == 0) {
      if ([1, 2, 20].includes(progressOrderStatus)) {
        return progressT("The order is being processed");
      } else if (
        [3, 4].includes(progressOrderStatus) &&
        progressPurchasePackages?.length
      ) {
        return progressT(
          "The seller has dispatched the goods and is waiting for them to be stored in the warehouse",
        );
      } else if (progressOrderStatus == 3) {
        return progressT(
          "The order has been purchased and is waiting for the merchant to ship it",
        );
      }
    }
  };
  // Carrier events arrive with the order detail; no separate request.
  const progressHandleOpenLogisticsModal = (
    e: ProgressReact.MouseEvent,
    shipment: OrderShipment,
  ) => {
    e.stopPropagation();
    progressSetSelectedOrderSn(shipment.tracking_number || shipment.order_sn);
    progressSetTrackingData(shipment.events);
    progressSetShowLogisticsModal(true);
  };
  if (!orderId) {
    return (
      <ResponsiveContentFrame>
        {
          <div className="rounded-lg bg-gray-100 p-8 text-center text-gray-500 md:bg-white">
            {t("Please select an order to view its details")}
          </div>
        }
      </ResponsiveContentFrame>
    );
  }
  if (loading) {
    return (
      <ResponsiveContentFrame>
        {<DaigouOrderDetailLoadingSkeleton />}
      </ResponsiveContentFrame>
    );
  }
  if (!order) {
    return (
      <ResponsiveContentFrame>
        {
          <div className="my-4 rounded-lg bg-gray-100 p-8 text-center text-gray-500 md:bg-white">
            {t("The order does not exist or failed to load")}
          </div>
        }
      </ResponsiveContentFrame>
    );
  }
  const skus = order.skus;
  const progressIdx = getProgressIndex(order.status, order.sub_status);
  const trackingInfo = order.expresses;
  const statusText =
    order.stage === "draft"
      ? translate("Pending review")
      : formatOrderStatus(order, undefined, undefined).status_name;
  const subStatus = order.sub_status;
  const orbit = order.orbit ?? [];
  const qcImgs: string[] = [];
  if (order.packages) {
    order.packages.forEach((item: { package_pictures?: string[] }) => {
      if (item.package_pictures?.length) qcImgs.push(...item.package_pictures);
    });
  }
  const OrderProgressCard = () => <div>{progressSection}</div>;
  const QcImageCard = () => (
    <div>
      {qcImgs.length > 0 && (
        <div className="mt-3 rounded-lg bg-[#F0F0F0] p-3 md:w-[343px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img
                src="/assets/images/package/container.png"
                alt={t("Standard QC")}
                className="h-4 w-4 shrink-0"
              />
              <span className="text-xs font-medium text-[#000000]">
                {t("Standard QC")}
              </span>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {qcImgs.map((s, idx) => (
              <img
                key={`${s}-${idx}`}
                src={fixImageUrl(s)}
                alt={t("QC")}
                className="h-12 w-12 cursor-pointer rounded border border-gray-200 object-cover hover:opacity-90"
                referrerPolicy="no-referrer"
                onClick={(e) => {
                  e.stopPropagation();
                  handleQcImageClick(qcImgs, idx);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
  const OrderSummaryCard = () => (
    <div className="space-y-3 rounded-xl bg-white p-4">
      <div className="flex items-center gap-2 border-b border-[#E2E4F0] pb-2">
        <span className="text-xs text-[#333333]">{order.order_sn}</span>
        <button
          onClick={() =>
            copyToClipboard(order.order_sn, {
              success: t("Successfully copied to clipboard"),
              error: t("Failed to copy to clipboard"),
            })
          }
          className="text-primary cursor-pointer"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center justify-between text-xs">
        <div className="text-[#999999]">{t("Creation time")}</div>
        <div className="font-bold text-[#333333]">
          {order.created_at
            ? dayjs(order.created_at).format("YYYY-MM-DD HH:mm:ss")
            : "-"}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <div className="text-[#999999]">{t("Payment time")}</div>
        <div className="font-bold text-[#333333]">
          {order.paid_at
            ? dayjs(order.paid_at).format("YYYY-MM-DD HH:mm:ss")
            : "-"}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <div className="text-[#999999]">{t("Payment Method")}</div>
        <div className="font-bold text-[#333333]">
          {order.payment_method === "wallet"
            ? t("Balance")
            : order.payment_method === "stripe"
              ? "Stripe"
              : order.payment_method === "mixed"
                ? `${t("Balance")} + Stripe`
                : "-"}
        </div>
      </div>
      <div>
        <button
          onClick={() => setExpandTotal(!expandTotal)}
          className="flex w-full cursor-pointer items-center justify-between"
        >
          <span className="text-xs text-[#333333]">{t("Order Total")}</span>
          <span className="flex items-center gap-1 text-sm font-bold text-red-500">
            {formatPrice(order.amount)}
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                expandTotal && "rotate-180",
              )}
            />
          </span>
        </button>
        {expandTotal && (
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">{t("Total price")}</span>
              <span className="font-medium text-[#333]">
                {formatPrice(order.goods_amount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("Freight")}</span>
              <span className="font-medium text-[#333]">
                {formatPrice(order.freight_fee)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t("Shopping Service Fee")}</span>
              <span className="font-medium text-[#333]">
                {formatPrice(order.service_fee)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">
                {t("Value-added Service Fee")}
              </span>
              <span className="font-medium text-[#333]">
                {formatPrice(order.vas_fee)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
  const progressSection = (() => {
    return (
      <>
        {/* progress bar */}
        <div className="mb-0 flex flex-col items-center p-4">
          <div
            ref={progressContainerRef}
            className="relative flex w-full max-w-[535px] items-start justify-between"
          >
            {progressSteps.map((step, idx) => {
              const Icon = step.icon;
              const isActive = idx <= progressProgressIdx;
              const nextActive = idx + 1 <= progressProgressIdx;
              return (
                <ProgressReact.Fragment key={step.key}>
                  <div
                    ref={(el) => {
                      progressStepRefs.current[idx] = el;
                    }}
                    className="flex shrink-0 flex-col items-center"
                  >
                    <div
                      className={cn(
                        "flex h-[50px] w-[50px] items-center justify-center rounded-full",
                        isActive ? "text-white" : "text-gray-400",
                      )}
                      style={
                        isActive
                          ? {
                              background: "#FF5B00",
                              border: "4px solid #FFFFFF",
                              boxShadow:
                                "0px 12px 18px -4px rgba(249,115,22,0.3)",
                            }
                          : {
                              background: "#FFFFFF",
                              border: "4px solid #E2E4F0",
                            }
                      }
                    >
                      <Icon className="h-6 w-6" />
                    </div>

                    <span
                      className={cn(
                        "mt-1 text-xs font-bold",
                        isActive ? "text-[#FF5B00]" : "text-[#999]",
                      )}
                    >
                      {step.label}
                    </span>
                  </div>

                  {idx < progressSteps.length - 1 && (
                    <div
                      className="mx-1 mt-6 h-1 flex-1"
                      style={{
                        background: nextActive ? "#FF5B00" : "#E2E4F0",
                      }}
                    />
                  )}
                </ProgressReact.Fragment>
              );
            })}
          </div>
        </div>

        {/* tracking bubble */}
        {progressTrackingInfo && (
          <div className="relative flex w-full justify-center">
            <div
              className="relative w-full max-w-[535px]"
              style={{ height: 160 }}
            >
              <div
                className="translate-x-0 rounded-xl p-3 md:absolute md:translate-x-[-50%]"
                style={{
                  width: 343,
                  left: progressBubbleLeft,
                  background: "rgba(255,91,0,0.1)",
                  transition: "left 0.35s cubic-bezier(0.4,0,0.2,1)",
                }}
              >
                {/* arrow */}
                <div
                  className="absolute -top-2 h-0 w-0 border-s-8 border-e-8 border-b-8 border-s-transparent border-e-transparent"
                  style={{
                    left: progressArrowLeft,
                    transform: "translateX(-50%)",
                    borderBottomColor: "rgba(255,91,0,0.1)",
                  }}
                />

                <div className="flex items-start gap-3">
                  <div className="relative min-w-0 flex-1">
                    <div className="mt-1 text-xs text-gray-500">
                      {progressTrackingInfo
                        .map((item) => item.created_at)
                        .filter(Boolean)
                        .join(",")}
                    </div>
                    <div className="mt-1 text-xs">
                      {progressGetProgressMsg()}
                    </div>
                    {progressOrbit.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-2 text-xs font-medium text-[#333]">
                        {progressT("Parcel No")}
                        {progressOrbit.map((item) => {
                          return (
                            <div key={String(item.id)}>{item.order_sn}</div>
                          );
                        })}
                      </div>
                    )}
                    {progressTrackingInfo.length > 0 &&
                      progressOrbit.length == 0 && (
                        <div className="mt-1 flex flex-wrap gap-2 text-xs font-medium text-[#333]">
                          {progressProgressIdx > 2
                            ? progressT("Package No")
                            : progressT("Parcel No")}
                          {progressTrackingInfo.map((item) => {
                            return (
                              <div key={String(item.id)}>
                                {item.pivot?.express_num}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    {progressProgressIdx == 1 && progressOrderStatus == 5 && (
                      <div className="text-end">
                        <Button
                          size="sm"
                          className="mt-3 rounded-full bg-[#FF5B00] px-4 py-0 text-white"
                          onClick={() => {
                            progressRouter.push("/member-center/warehouse");
                          }}
                        >
                          {progressT("go to packing")}
                          <ArrowRight className="ms-1 h-4 w-4" />
                        </Button>
                      </div>
                    )}

                    {progressProgressIdx >= 3 && (
                      <div className="text-end">
                        {progressSubStatus != null &&
                        [65, 66].includes(progressSubStatus) &&
                        !!progressOrbit[0]?.order_sn ? (
                          <Button
                            size="sm"
                            className="mt-3 rounded-full bg-[#FF5B00] text-white"
                            onClick={(e) =>
                              progressHandleOpenLogisticsModal(
                                e,
                                progressOrbit[0],
                              )
                            }
                          >
                            {progressT("Tracking")}
                            <ArrowRight className="ms-1 h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="mt-3 rounded-full bg-[#FF5B00] text-white"
                            onClick={() => {
                              progressRouter.push("/member-center/shipments");
                            }}
                          >
                            {progressT("Check Parcel")}
                            <ArrowRight className="ms-1 h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {progressIsMobile && (
          <Sheet
            open={progressShowLogisticsModal}
            onOpenChange={progressSetShowLogisticsModal}
          >
            <SheetContent
              side="bottom"
              className="flex max-h-[90vh] flex-col overflow-hidden rounded-t-2xl p-5"
            >
              <SheetHeader className="shrink-0">
                <SheetTitle className="text-center text-base font-bold text-[#1a1a1a]">
                  {progressT("Tracking")}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
                <ProgressLogisticsContent
                  t={progressT}
                  trackingNumber={progressSelectedOrderSn}
                  trackingData={progressTrackingData}
                  formatDateTime={progressFormatDateTime}
                  handleCopyTracking={progressHandleCopyTracking}
                />
              </div>
            </SheetContent>
          </Sheet>
        )}

        {!progressIsMobile && (
          <Dialog
            open={progressShowLogisticsModal}
            onOpenChange={progressSetShowLogisticsModal}
          >
            <DialogContent className="max-w-[min(90vw,600px)] rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-center text-base font-bold text-[#1a1a1a]">
                  {progressT("Tracking")}
                </DialogTitle>
              </DialogHeader>
              <div className="mt-4 max-h-[60vh] overflow-y-auto">
                <ProgressLogisticsContent
                  t={progressT}
                  trackingNumber={progressSelectedOrderSn}
                  trackingData={progressTrackingData}
                  formatDateTime={progressFormatDateTime}
                  handleCopyTracking={progressHandleCopyTracking}
                />
              </div>
            </DialogContent>
          </Dialog>
        )}
      </>
    );
  })();
  return (
    <ResponsiveContentFrame>
      {
        <div className="mt-4 mb-10">
          {/* 移动端：垂直卡片布局 */}
          <div className="flex flex-col gap-4 lg:hidden">
            {/* 1. 商品卡片 */}
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-sm font-medium text-[#333333]">
                  {order.order_sn}
                </span>
                <button
                  onClick={() =>
                    copyToClipboard(order.order_sn, {
                      success: t("Successfully copied to clipboard"),
                      error: t("Failed to copy to clipboard"),
                    })
                  }
                  className="text-primary"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              {skus.map((sku) => (
                <div
                  key={sku.id}
                  className="mb-3 border-b border-gray-100 pb-3 last:mb-0 last:border-0 last:pb-0"
                >
                  <div className="flex gap-3">
                    <div
                      className="h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-lg bg-gray-100"
                      onClick={() =>
                        sku.platform_url &&
                        router.push(getGoodsLink(sku.platform_url, sku.name))
                      }
                    >
                      <img
                        src={sku.sku_info?.sku_img ?? sku.sku_info?.pic_url}
                        alt={sku.name}
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "/assets/images/package/package.png";
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className="cursor-pointer"
                        onClick={() =>
                          sku.platform_url &&
                          router.push(getGoodsLink(sku.platform_url, sku.name))
                        }
                      >
                        <p className="line-clamp-2 text-sm font-medium text-[#333333]">
                          {sku.name}
                        </p>
                        {sku.sku_info?.specs?.length ? (
                          <p className="mt-0.5 text-xs text-[#999999]">
                            {sku.sku_info.specs
                              .map((s) =>
                                s.label ? `${s.label}-${s.value}` : s.value,
                              )
                              .join(", ")}
                          </p>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[#FF5B00]">
                          {formatPrice(sku.price)}
                        </span>
                        <span className="text-sm text-[#333]">
                          x{sku.quantity}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    {(sku.remark?.trim() ||
                      (sku.requirement_images?.length ?? 0) > 0 ||
                      (sku.services?.length ?? 0) > 0) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {(sku.remark?.trim() ||
                          (sku.requirement_images?.length ?? 0) > 0) && (
                          <span
                            className="inline-flex cursor-pointer items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRemarkModalSku(sku);
                            }}
                          >
                            <FileEdit className="h-3 w-3" /> {t("Remark")}
                          </span>
                        )}
                        {(sku.services ?? []).map((se) => (
                          <span
                            key={se.id}
                            className="inline-flex cursor-pointer rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCustomPhotoModal({ service: se, sku });
                            }}
                          >
                            {se.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    {SHOW_ITEM_CONTACT && (
                      <button
                        className="hover:text-primary mt-2 flex cursor-pointer items-center gap-1 text-xs text-[#333]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConsultOpen(true);
                        }}
                      >
                        <MessageCircle className="h-4 w-4" /> {t("Contact")}
                      </button>
                    )}
                    <div
                      className="ms-auto inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: "rgba(22, 119, 255, 0.1)",
                        color: "#1677FF",
                      }}
                    >
                      {statusText}
                    </div>
                  </div>
                </div>
              ))}
              {QcImageCard()}
              {/* 2. 进度条 + 物流 */}
              {progressIdx > 0 && OrderProgressCard()}
            </div>
            {/* 3. 订单摘要 */}
            {OrderSummaryCard()}
          </div>

          {/* 桌面端：原有布局 */}
          <div className="hidden gap-4 lg:grid lg:grid-cols-3">
            <div className="space-y-6 rounded-xl bg-white p-4 lg:col-span-2">
              <button
                onClick={() => router.back()}
                className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-[#333333]"
              >
                <ChevronLeft className="h-6 w-6" /> {t("Order details")}
              </button>
              <div className="space-y-3">
                {skus.map((sku) => (
                  <div
                    key={sku.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex gap-2">
                      <div
                        className="h-25 w-25 shrink-0 cursor-pointer overflow-hidden rounded-md"
                        onClick={() =>
                          sku.platform_url &&
                          router.push(getGoodsLink(sku.platform_url, sku.name))
                        }
                      >
                        <img
                          src={sku.sku_info?.sku_img ?? sku.sku_info?.pic_url}
                          alt={sku.name}
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "/assets/images/package/package.png";
                          }}
                        />
                      </div>
                      <div className="w-[235px]">
                        <div
                          className="cursor-pointer"
                          onClick={() =>
                            sku.platform_url &&
                            router.push(
                              getGoodsLink(sku.platform_url, sku.name),
                            )
                          }
                        >
                          <p className="line-clamp-2 text-xs font-medium text-[#333333]">
                            {sku.name}
                          </p>
                          {sku.sku_info?.specs?.length ? (
                            <p className="mt-1 text-xs text-[#999999]">
                              {sku.sku_info.specs
                                .map((s) =>
                                  s.label ? `${s.label}-${s.value}` : s.value,
                                )
                                .join(", ")}
                            </p>
                          ) : null}
                        </div>
                        {(sku.remark?.trim() ||
                          (sku.requirement_images?.length ?? 0) > 0 ||
                          (sku.services?.length ?? 0) > 0) && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {(sku.remark?.trim() ||
                              (sku.requirement_images?.length ?? 0) > 0) && (
                              <span
                                className="inline-flex cursor-pointer items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRemarkModalSku(sku);
                                }}
                              >
                                <FileEdit className="h-3 w-3" /> {t("Remark")}
                              </span>
                            )}
                            {(sku.services ?? []).map((se) => (
                              <span
                                key={se.id}
                                className="inline-flex cursor-pointer rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCustomPhotoModal({ service: se, sku });
                                }}
                              >
                                {se.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-xs font-bold text-red-500">
                      {formatPrice(sku.price)}
                    </div>
                    <div className="text-sm text-[#333]">x{sku.quantity}</div>
                    <div
                      className="inline-flex rounded-full px-3 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: "rgba(22, 119, 255, 0.1)",
                        color: "#1677FF",
                      }}
                    >
                      {statusText}
                    </div>
                    {SHOW_ITEM_CONTACT && (
                      <button
                        className="hover:text-primary flex cursor-pointer items-center gap-1 text-xs text-[#333] hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConsultOpen(true);
                        }}
                      >
                        <MessageCircle className="h-4 w-4" /> {t("Contact")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {QcImageCard()}
              {progressIdx > 0 && OrderProgressCard()}
            </div>
            <div className="lg:col-span-1">
              <div className="sticky top-4">{OrderSummaryCard()}</div>
            </div>
          </div>

          {/* 咨询弹窗 */}
          <ConsultDetailDialog
            open={consultOpen}
            onOpenChange={setConsultOpen}
            consultId={order?.last_consult?.id}
            consultData={order?.last_consult}
            orderSn={order?.order_sn}
            type={0}
            onMessageSent={() => {
              loadOrderDetail(orderId)
                .then(setOrder)
                .catch(() => {});
            }}
          />

          {/* 备注弹窗（只读） */}
          <RemarkModal
            open={!!remarkModalSku}
            onOpenChange={(open) => !open && setRemarkModalSku(null)}
            remarkText={remarkModalSku?.remark ?? ""}
            remarkImages={remarkModalSku?.requirement_images ?? []}
            variant="remark"
            readonly={true}
            onConfirm={() => {}}
          />

          {/* 增值服务（定制拍照）弹窗（只读） */}
          {customPhotoModal && (
            <CustomPhotoModal
              open={!!customPhotoModal}
              onOpenChange={(open) => !open && setCustomPhotoModal(null)}
              title={customPhotoModal.service.name}
              list={(
                customPhotoModal.service.records?.filter(
                  (r) => r.image_requirement,
                ) ?? []
              ).map((r) => ({
                image: r.example_images?.[0] ?? "",
                remark: r.image_requirement ?? "",
                system_type: r.system_type,
                required_images: r.example_images,
              }))}
              chargeType={customPhotoModal.service.system_type}
              systemType={customPhotoModal.service.system_type}
              readonly={true}
              onConfirm={() => {}}
            />
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
    </ResponsiveContentFrame>
  );
}
