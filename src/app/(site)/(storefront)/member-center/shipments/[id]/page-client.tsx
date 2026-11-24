"use client";
import { type Package } from "@/lib/client/services/package-types";
import { fixImageUrl } from "@/lib/utils/image-url";
import { Section } from "@/components/layout/section";
import { ImagePreviewLightbox } from "@/components/image-preview-lightbox";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getProcurementShipment,
  getProcurementTracking,
  createProcurementCheckout,
} from "@/lib/procurement/client";
import { checkoutPath } from "@/components/features/logistics/procurement-logistics";
import { formatAddressLines } from "@/lib/address-format";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";
import { LOCALE_HTML_LANG } from "@/lib/locale";
import { usePriceConvert } from "@/lib/store/common";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/locale-store";
import { ChevronDown, ChevronUp, Copy, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
type PackageDisplay = Omit<
  Pick<
    Package,
    | "id"
    | "r_express_num"
    | "express_num"
    | "package_weight"
    | "length"
    | "width"
    | "height"
    | "package_pictures"
    | "prop"
    | "details"
  >,
  "id" | "package_weight" | "length" | "width" | "height" | "prop" | "details"
> & {
  id: string;
  package_weight?: number;
  length?: number;
  width?: number;
  height?: number;
  prop: Array<
    Pick<Package["prop"][number], "id" | "name"> &
      Partial<
        Pick<
          Package["prop"][number],
          "cn_name" | "en_name" | "prop_name" | "color" | "font_color"
        >
      >
  >;
  details: Array<
    Pick<
      Package["details"][number],
      "name" | "qty" | "full_path_images" | "images" | "spec"
    > & { id: string | number }
  >;
};

async function loadShipment(id: string) {
  const shipment = await getProcurementShipment(id);
  const destination = shipment.destination;
  return {
    id: shipment.id,
    order_sn: shipment.publicId,
    logistics_sn: shipment.trackingNumber,
    created_at: shipment.createdAt,
    express_name: shipment.shippingMethod?.routeName,
    payment_weight: shipment.finalWeightGrams,
    length:
      shipment.finalLengthMm == null ? undefined : shipment.finalLengthMm * 10,
    width:
      shipment.finalWidthMm == null ? undefined : shipment.finalWidthMm * 10,
    height:
      shipment.finalHeightMm == null ? undefined : shipment.finalHeightMm * 10,
    address: destination && {
      ...destination,
      phone: destination.phone.replace(/^\+/, ""),
    },
    packages: shipment.packages.map((item): PackageDisplay => {
      const lines = item.items ?? [];
      const details =
        lines.length > 0
          ? lines.map((line, index) => ({
              id: line.itemId ?? index,
              name: line.name,
              qty: line.quantity ?? 0,
              full_path_images: line.imageUrl ? [line.imageUrl] : [],
              images: [],
              spec: line.variantLabel ?? "",
            }))
          : (item.goodsItems ?? []).map((goods, index) => ({
              id: index,
              name: goods.name,
              qty: goods.quantity,
              full_path_images: goods.imageUrl ? [goods.imageUrl] : [],
              images: [],
              spec: "",
            }));
      return {
        id: item.id,
        express_num: item.domesticTrackingNumber ?? item.publicId,
        r_express_num: "",
        package_weight: item.weightGrams ?? undefined,
        length: item.lengthMm == null ? undefined : item.lengthMm * 10,
        width: item.widthMm == null ? undefined : item.widthMm * 10,
        height: item.heightMm == null ? undefined : item.heightMm * 10,
        package_pictures: (item.photos ?? []).map((photo) => photo.url),
        prop: item.cargoAttributes.map((name, index) => ({ id: index, name })),
        details,
      };
    }),
    boxes: shipment.cartons.map((carton) => ({
      id: carton.id,
      sn: carton.code,
      weight: carton.weightGrams ?? undefined,
      length: carton.lengthMm == null ? undefined : carton.lengthMm * 10,
      width: carton.widthMm == null ? undefined : carton.widthMm * 10,
      height: carton.heightMm == null ? undefined : carton.heightMm * 10,
    })),
    totalFen: shipment.amountFen,
    currency:
      shipment.shippingMethod?.currency ?? shipment.charges?.[0]?.currency,
    payable: shipment.status === "TO_PAY",
  };
}

interface LogisticsTrackingItem {
  context: string;
  ftime: string;
}
// 调用物流跟踪接口（使用封装的 API）
async function logisticsFetchTracking(
  shipmentId: string,
): Promise<LogisticsTrackingItem[]> {
  try {
    const tracking = await getProcurementTracking(shipmentId);
    return tracking.events.map(({ at, title, location }) => ({
      context: [title, location].filter(Boolean).join(" · "),
      ftime: at,
    }));
  } catch (error) {
    console.error("Failed to fetch tracking:", error);
    return [];
  }
}
/** 物流信息加载骨架屏：按真实卡片结构渲染 */

function LogisticsPackageLogisticsLoadingSkeleton() {
  return (
    <Section>
      <div className="space-y-2 rounded-lg bg-white p-4 md:mx-0">
        {/* 物流跟踪模块 */}
        <div className="space-y-2">
          {/* 跟踪号 */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-32 bg-gray-200!" />
            <Skeleton className="h-5 w-36 bg-gray-200!" />
            <Skeleton className="h-4 w-4 bg-gray-200!" />
          </div>

          {/* 物流状态 */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-2 w-2 rounded-full bg-gray-200!" />
              <Skeleton className="h-4 w-16 bg-gray-200!" />
              <Skeleton className="h-3 w-20 bg-gray-200!" />
            </div>
            <Skeleton className="ms-4 h-3 w-2/3 bg-gray-200!" />
          </div>
        </div>

        {/* 分隔线 */}
        <div className="border-t border-gray-200" />

        {/* 收货地址模块 */}
        <div className="space-y-2 rounded-lg bg-gray-100 p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-5 w-5 shrink-0 rounded bg-gray-200!" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-full bg-gray-200!" />
              <Skeleton className="h-3 w-2/3 bg-gray-200!" />
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function itemsEscapeHtmlForInner(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}
/** 包裹详情加载骨架屏：按 PC 表格 / 移动端卡片结构渲染 */

function ItemsPackageDetailsLoadingSkeleton() {
  const packageRow = (key: number) => (
    <div key={key} className="rounded-lg border border-gray-200 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Skeleton className="h-4 w-32 bg-gray-200!" />
        <Skeleton className="h-3 w-3 bg-gray-200!" />
      </div>
      <div className="flex items-start gap-2">
        <Skeleton className="h-16 w-16 shrink-0 rounded bg-gray-200!" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-full bg-gray-200!" />
          <Skeleton className="h-3 w-2/3 bg-gray-200!" />
          <Skeleton className="h-3 w-10 bg-gray-200!" />
        </div>
      </div>
    </div>
  );
  return (
    <Section>
      <div className="mt-4 rounded-lg bg-white p-4">
        <div className="space-y-4">
          {/* PC 端表格 */}
          <div className="hidden md:block">
            <div className="mb-2 grid grid-cols-12 gap-4 rounded-lg bg-gray-100 px-4 py-3">
              <Skeleton className="col-span-6 h-4 w-32 bg-gray-200!" />
              <Skeleton className="col-span-2 h-4 w-20 bg-gray-200!" />
              <Skeleton className="col-span-2 h-4 w-24 bg-gray-200!" />
              <Skeleton className="col-span-2 h-4 w-16 bg-gray-200!" />
            </div>
            {[0, 1].map((i) => (
              <div
                key={i}
                className="mb-3 grid grid-cols-12 items-start gap-4 last:mb-0"
              >
                <div className="col-span-6">
                  <div className="mb-2 flex items-center gap-2">
                    <Skeleton className="h-4 w-32 bg-gray-200!" />
                    <Skeleton className="h-3 w-3 bg-gray-200!" />
                  </div>
                  <div className="flex items-start gap-2">
                    <Skeleton className="h-16 w-16 shrink-0 rounded bg-gray-200!" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-full bg-gray-200!" />
                      <Skeleton className="h-3 w-2/3 bg-gray-200!" />
                      <Skeleton className="h-3 w-10 bg-gray-200!" />
                    </div>
                  </div>
                </div>
                <Skeleton className="col-span-2 h-4 w-20 bg-gray-200!" />
                <Skeleton className="col-span-2 h-4 w-24 bg-gray-200!" />
                <div className="col-span-2">
                  <Skeleton className="h-6 w-14 rounded bg-gray-200!" />
                </div>
              </div>
            ))}
          </div>

          {/* 手机端布局 */}
          <div className="space-y-2 md:hidden">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="min-w-0 rounded-lg border-b border-gray-200 bg-white pb-2 last:border-0"
              >
                {packageRow(i)}
                <div className="border-t border-gray-200 pt-3">
                  <div className="mb-2 grid grid-cols-2 gap-4">
                    <Skeleton className="h-4 w-24 bg-gray-200!" />
                    <Skeleton className="h-4 w-28 bg-gray-200!" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Skeleton className="h-4 w-16 bg-gray-200!" />
                    <Skeleton className="h-6 w-14 rounded bg-gray-200!" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

interface ParcelOrderBox {
  id: string | number;
  sn?: string;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  [key: string]: unknown;
}
/** 包裹数据加载骨架屏：按真实卡片行结构渲染 */

function ParcelPackageDataLoadingSkeleton({
  marginTop = 0,
  marginBottom = 0,
}: {
  marginTop?: number;
  marginBottom?: number;
}) {
  return (
    <Section>
      <div
        className="space-y-3 rounded-lg bg-white p-4"
        style={{
          marginTop: `${marginTop}px`,
          marginBottom: `${marginBottom}px`,
        }}
      >
        {/* Parcel NO. */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24 bg-gray-200!" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-32 bg-gray-200!" />
            <Skeleton className="h-3 w-3 bg-gray-200!" />
          </div>
        </div>

        {/* Create time */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24 bg-gray-200!" />
          <Skeleton className="h-4 w-36 bg-gray-200!" />
        </div>

        {/* Shipping method */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28 bg-gray-200!" />
          <Skeleton className="h-4 w-20 bg-gray-200!" />
        </div>

        {/* Weight */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-20 bg-gray-200!" />
          <div className="flex items-center gap-1">
            <Skeleton className="h-4 w-20 bg-gray-200!" />
            <Skeleton className="h-4 w-4 bg-gray-200!" />
          </div>
        </div>

        {/* Box list */}
        <div className="space-y-3 border-s-2 border-gray-100 ps-2">
          <Skeleton className="h-3 w-40 bg-gray-200!" />
          <Skeleton className="h-3 w-28 bg-gray-200!" />
          <Skeleton className="h-3 w-36 bg-gray-200!" />
        </div>

        {/* Dimensional weight */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28 bg-gray-200!" />
          <Skeleton className="h-4 w-20 bg-gray-200!" />
        </div>
      </div>
    </Section>
  );
}

function PaymentPackagePriceLoadingSkeleton({
  marginTop = 0,
  marginBottom = 0,
}: {
  marginTop?: number;
  marginBottom?: number;
}) {
  return (
    <Section>
      <div
        className="space-y-3 rounded-lg bg-white p-4"
        style={{
          marginTop: `${marginTop}px`,
          marginBottom: `${marginBottom}px`,
        }}
      >
        {/* Payment time */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24 bg-gray-200!" />
          <Skeleton className="h-4 w-36 bg-gray-200!" />
        </div>

        {/* Payment Method */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28 bg-gray-200!" />
          <Skeleton className="h-4 w-20 bg-gray-200!" />
        </div>

        {/* Total Freight */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24 bg-gray-200!" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-20 bg-gray-200!" />
            <Skeleton className="h-4 w-4 bg-gray-200!" />
          </div>
        </div>
      </div>
    </Section>
  );
}

export default function PageClient({ id }: { id: string }) {
  const session = useProcurementSessionStore(
    (state) => state.clientStateVersion,
  );
  return <ShipmentDetail key={session} orderId={id} />;
}

function ShipmentDetail({ orderId }: { orderId: string }) {
  const [orderInfo, setOrderInfo] = useState<Awaited<
    ReturnType<typeof loadShipment>
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const requestRevision = useRef(0);
  const [previousOrderId, setPreviousOrderId] = useState<string | null>(null);
  if (previousOrderId !== orderId) {
    setPreviousOrderId(orderId);
    setOrderInfo(null);
    setError(null);
    setLoading(Boolean(orderId));
  }
  const loadOrder = useCallback(() => {
    if (!orderId) return Promise.resolve();
    const revision = ++requestRevision.current;
    return loadShipment(orderId).then(
      (data) => {
        if (revision !== requestRevision.current) return;
        setOrderInfo(data);
        setLoading(false);
      },
      (error) => {
        if (revision !== requestRevision.current) return;
        setError(
          error instanceof Error ? error : new Error("Failed to load order"),
        );
        setOrderInfo(null);
        setLoading(false);
      },
    );
  }, [orderId]);
  const refreshOrder = useCallback(() => {
    setLoading(Boolean(orderId));
    setError(null);
    return loadOrder();
  }, [orderId, loadOrder]);
  useEffect(() => {
    void loadOrder();
    return () => {
      requestRevision.current++;
    };
  }, [loadOrder]);
  // 物流跟踪
  const t = useTranslations();
  const logisticsFontSize = "16px";
  const logisticsColor = "#000000";
  const logisticsFontWeight = "normal";
  const logisticsLocale = useLocaleStore((state) => state.locale);
  const [logisticsTrackingData, logisticsSetTrackingData] = useState<
    LogisticsTrackingItem[]
  >([]);
  const [logisticsTrackingLoading, logisticsSetTrackingLoading] =
    useState(false);
  const [logisticsExpanded, logisticsSetExpanded] = useState(false);
  // 获取物流单号（优先使用 r_order_sn，其次 logistics_sn，最后 order_sn）
  const logisticsTrackingNumber = orderInfo?.logistics_sn || "";
  // 获取物流跟踪数据
  useEffect(() => {
    if (!orderId || !logisticsTrackingNumber) return;
    let active = true;
    const loadTracking = async () => {
      logisticsSetTrackingLoading(true);
      try {
        const data = await logisticsFetchTracking(orderId);
        // 倒序排列（最上面是最后一条）
        if (active) logisticsSetTrackingData(data.reverse());
      } catch (err) {
        console.error("Failed to load tracking:", err);
      } finally {
        if (active) logisticsSetTrackingLoading(false);
      }
    };
    void loadTracking();
    return () => {
      active = false;
    };
  }, [orderId, logisticsTrackingNumber]);
  // 复制跟踪号（带降级方案）
  const logisticsHandleCopyTracking = async () => {
    if (!logisticsTrackingNumber) return;
    // 优先使用现代 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(logisticsTrackingNumber);
        toast.success(t("Successfully copied to clipboard"));
        return;
      } catch (error) {
        console.warn("Clipboard API 失败，尝试降级方案:", error);
      }
    }
    // 降级方案：使用传统的 execCommand
    try {
      const textArea = document.createElement("textarea");
      textArea.value = logisticsTrackingNumber;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      if (successful) {
        toast.success(t("Successfully copied to clipboard"));
      } else {
        throw new Error("execCommand Failed to copy to clipboard");
      }
    } catch (error) {
      console.error("降级复制方案也失败:", error);
      toast.error(t("Failed to copy to clipboard"));
    }
  };
  // 格式化日期时间
  const logisticsFormatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString(LOCALE_HTML_LANG[logisticsLocale], {
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
  // 包裹商品
  const itemsFontSize = "16px";
  const itemsColor = "#000000";
  const itemsFontWeight = "normal";
  const itemsNoImageLabel = t("No Image");
  const itemsNoImageHtml = useMemo(
    () => ({
      plain: `<div class="w-full h-full bg-gray-100 rounded border border-gray-200 flex items-center justify-center"><span class="text-xs text-gray-400">${itemsEscapeHtmlForInner(itemsNoImageLabel)}</span></div>`,
      withErr: `<div class="w-full h-full bg-gray-100 rounded border border-gray-200 flex items-center justify-center error-placeholder"><span class="text-xs text-gray-400">${itemsEscapeHtmlForInner(itemsNoImageLabel)}</span></div>`,
    }),
    [itemsNoImageLabel],
  );
  const [itemsExpandedPackages, itemsSetExpandedPackages] = useState<
    Set<string>
  >(new Set());
  const [itemsQcLightboxOpen, itemsSetQcLightboxOpen] = useState(false);
  const [itemsQcLightboxSlides, itemsSetQcLightboxSlides] = useState<
    {
      src: string;
    }[]
  >([]);
  const [itemsQcLightboxIndex, itemsSetQcLightboxIndex] = useState(0);
  const itemsHandleQcImageClick = useCallback(
    (imgs: string[], index: number) => {
      itemsSetQcLightboxSlides(imgs.map((src) => ({ src: fixImageUrl(src) })));
      itemsSetQcLightboxIndex(index);
      itemsSetQcLightboxOpen(true);
    },
    [],
  );
  // 格式化重量
  const itemsFormatWeight = (weight?: number) => {
    if (weight === undefined) return "—";
    return `${(weight / 1000).toFixed(3)} KG`;
  };
  // 格式化尺寸（纯文本；窄屏时由容器 min-w-0 + break-words 仅在放不下时换行）
  const itemsFormatDimension = (
    length?: number,
    width?: number,
    height?: number,
  ) => {
    if (length === undefined || width === undefined || height === undefined)
      return "—";
    return `${(length / 100).toFixed(2)}*${(width / 100).toFixed(2)}*${(height / 100).toFixed(2)} CM`;
  };
  // 切换展开/收起
  const itemsToggleExpand = (packageId: string) => {
    itemsSetExpandedPackages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(packageId)) {
        newSet.delete(packageId);
      } else {
        newSet.add(packageId);
      }
      return newSet;
    });
  };
  // 复制包裹单号
  const itemsHandleCopyExpressNum = async (expressNum: string) => {
    if (!expressNum) return;
    // 优先使用现代 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(expressNum);
        toast.success(t("Successfully copied to clipboard"));
        return;
      } catch (error) {
        console.warn("Clipboard API 失败，尝试降级方案:", error);
      }
    }
    // 降级方案：使用传统的 execCommand
    try {
      const textArea = document.createElement("textarea");
      textArea.value = expressNum;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      if (successful) {
        toast.success(t("Successfully copied to clipboard"));
      } else {
        throw new Error("execCommand 复制失败");
      }
    } catch (error) {
      console.error("降级复制方案也失败:", error);
      toast.error(t("Failed to copy to clipboard"));
    }
  };
  // 包裹信息
  const parcelMarginTop = 0;
  const parcelMarginBottom = 0;
  const [parcelBoxesExpanded, parcelSetBoxesExpanded] = useState(false);
  // 格式化重量
  const parcelFormatWeight = (weight: number) => {
    return `${(weight / 1000).toFixed(2)}KG`;
  };
  const parcelFormatBoxDimension = (
    length?: number,
    width?: number,
    height?: number,
  ) => {
    if (
      typeof length !== "number" ||
      typeof width !== "number" ||
      typeof height !== "number"
    ) {
      return "-";
    }
    return `${(length / 100).toFixed(2)}*${(width / 100).toFixed(2)}*${(height / 100).toFixed(2)} CM`;
  };
  // 格式化时间
  const parcelFormatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch {
      return dateString;
    }
  };
  // 复制包裹单号
  const parcelHandleCopyOrderSn = async (orderSn: string) => {
    if (!orderSn) return;
    // 优先使用现代 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(orderSn);
        toast.success(t("Successfully copied to clipboard"));
        return;
      } catch (error) {
        console.warn("Clipboard API 失败，尝试降级方案:", error);
      }
    }
    // 降级方案：使用传统的 execCommand
    try {
      const textArea = document.createElement("textarea");
      textArea.value = orderSn;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      if (successful) {
        toast.success(t("Successfully copied to clipboard"));
      } else {
        throw new Error("execCommand 复制失败");
      }
    } catch (error) {
      console.error("降级复制方案也失败:", error);
      toast.error(t("Failed to copy to clipboard"));
    }
  };
  // 运费明细
  const paymentMarginTop = 16;
  const paymentMarginBottom = 0;
  const [paymentExpanded, paymentSetExpanded] = useState(false);
  const paymentRouter = useRouter();
  const paymentPriceConvert = usePriceConvert();
  const checkoutPending = useRef(false);
  async function startCheckout() {
    if (!orderInfo?.payable || checkoutPending.current) return;
    checkoutPending.current = true;
    try {
      const checkout = await createProcurementCheckout([orderInfo.id]);
      paymentRouter.push(checkoutPath(checkout.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("No data"));
    } finally {
      checkoutPending.current = false;
    }
  }
  const logisticsContent = (() => {
    if (loading) {
      return <LogisticsPackageLogisticsLoadingSkeleton />;
    }
    if (error) {
      return (
        <Section>
          <div className="text-red-500">
            {t("Failed to load:")} {error.message}
          </div>
        </Section>
      );
    }
    if (!orderInfo) {
      return (
        <Section>
          <div className="text-gray-500">{t("No data")}</div>
        </Section>
      );
    }
    const logisticsAddress = orderInfo.address;
    // 倒序排列，最新的在最上面
    const logisticsSortedTrackings = [...logisticsTrackingData].reverse();
    const logisticsDisplayTrackings = logisticsExpanded
      ? logisticsSortedTrackings
      : logisticsSortedTrackings.slice(0, 1);
    return (
      <Section>
        <div className="space-y-2 rounded-lg bg-white p-4 md:mx-0">
          {/* 物流跟踪模块 */}
          <div className="space-y-2">
            {/* 跟踪号 */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">
                {t("International tracking no:")}
              </span>
              <span className="text-base font-semibold text-gray-900">
                {logisticsTrackingNumber || "—"}
              </span>
              {logisticsTrackingNumber && (
                <button
                  onClick={logisticsHandleCopyTracking}
                  className="rounded p-1 transition-colors hover:bg-gray-100"
                  aria-label={t("Copy tracking number")}
                >
                  <Copy className="h-4 w-4 text-gray-500" />
                </button>
              )}
            </div>

            {/* 物流状态 */}
            {logisticsTrackingLoading ? (
              <div className="flex items-center gap-2 text-gray-500">
                <Skeleton className="h-3 w-3 rounded-full bg-gray-200!" />
                <span className="text-sm">{t("Loading\u2026")}</span>
              </div>
            ) : logisticsSortedTrackings.length > 0 ? (
              <div className="relative ps-1">
                {/* 时间轴竖线 - 连接所有显示的步骤 */}
                {logisticsDisplayTrackings.length > 1 && (
                  <div
                    className="absolute start-2 w-0.5 bg-gray-200"
                    style={{
                      top: "8px",
                      bottom: "8px",
                    }}
                  />
                )}

                {/* 时间轴步骤 */}
                <div className="space-y-0">
                  {logisticsDisplayTrackings.map((item, index) => {
                    const isLatest = index === 0;
                    return (
                      <div
                        key={index}
                        className="relative flex items-start gap-3 pb-6 last:pb-0"
                      >
                        {/* 圆点 */}
                        <div className="relative z-10 mt-2 shrink-0">
                          <div
                            className={`h-3 w-3 rounded-full border-2 ${
                              isLatest
                                ? "bg-primary border-primary"
                                : "border-gray-300 bg-white"
                            }`}
                          />
                        </div>

                        {/* 内容 */}
                        <div className="flex-1 pt-0.5">
                          <div className="mb-1">
                            <span
                              className={`text-sm ${isLatest ? "text-primary font-medium" : "text-gray-500"}`}
                            >
                              {item.context}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {logisticsFormatDateTime(item.ftime)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 展开/收起按钮 - 放在最下面 */}
                {logisticsSortedTrackings.length > 1 && (
                  <button
                    onClick={() => logisticsSetExpanded(!logisticsExpanded)}
                    className="ms-7 mt-2 flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700"
                  >
                    <span>
                      {logisticsExpanded
                        ? t("Fold up")
                        : t("View more logistics details")}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${logisticsExpanded ? "rotate-180" : ""}`}
                    />
                  </button>
                )}
              </div>
            ) : null}
          </div>

          {/* 分隔线 */}
          <div className="border-t border-gray-200" />

          {/* 收货地址模块 */}
          {logisticsAddress && (
            <div className="space-y-2 rounded-lg bg-gray-100 p-4">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#FF5B00]" />
                <div className="min-w-0 flex-1 space-y-1">
                  {/* 收件人信息 */}
                  <div className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="font-semibold break-words text-gray-900">
                      {logisticsAddress.name || "—"}
                    </span>
                    {logisticsAddress.phone && (
                      <bdi dir="ltr" className="text-gray-600">
                        +{logisticsAddress.phone}
                      </bdi>
                    )}
                  </div>
                  {/* 地址 */}
                  <div className="text-sm leading-5 break-words text-gray-600">
                    {formatAddressLines({
                      ...logisticsAddress,
                      district: null,
                    }).map((line, index) => (
                      <span key={`${line}-${index}`} className="block">
                        {line}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Section>
    );
  })();
  const itemsContent = (() => {
    if (loading) {
      return <ItemsPackageDetailsLoadingSkeleton />;
    }
    if (error) {
      return (
        <Section>
          <div className="text-red-500">
            {t("Failed to load:")} {error.message}
          </div>
        </Section>
      );
    }
    if (!orderInfo || !orderInfo.packages || orderInfo.packages.length === 0) {
      return (
        <Section>
          <div className="text-gray-500">{t("No package information")}</div>
        </Section>
      );
    }
    const itemsPackages = orderInfo.packages;
    /** Standard QC：与 ParcelList 一致，展示全部图片，文案旁剩余区域横向滚动 */
    const itemsRenderStandardQcBlock = (
      pkg: PackageDisplay,
      wrapperClassName: string,
    ) => {
      if (!pkg.package_pictures?.length) return null;
      return (
        <div className={wrapperClassName}>
          <div className="min-w-0 rounded-lg bg-gray-100 px-2 py-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-xs text-gray-500">
                {t("Standard QC")}
              </span>
              <div className="min-w-0 flex-1 [scrollbar-width:thin] overflow-x-auto overflow-y-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                <div className="flex w-max flex-nowrap gap-1">
                  {pkg.package_pictures.map((img, idx) => (
                    <img
                      key={idx}
                      src={fixImageUrl(img)}
                      alt={`${t("Package")} ${idx + 1}`}
                      className="h-10 w-10 shrink-0 cursor-pointer rounded border border-gray-200 object-cover hover:opacity-90"
                      referrerPolicy="no-referrer"
                      onClick={(e) => {
                        e.stopPropagation();
                        itemsHandleQcImageClick(pkg.package_pictures, idx);
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    };
    return (
      <Section>
        <div className="mt-4 rounded-lg bg-white p-4">
          <div className="space-y-4">
            {/* PC 端表格 */}
            <div className="hidden md:block">
              {/* 表头 */}
              <div className="mb-2 grid grid-cols-12 gap-4 rounded-lg bg-gray-100 px-4 py-3">
                <div className="col-span-6 font-semibold text-gray-700">
                  {t("Parcel Information")}
                </div>
                <div className="col-span-2 font-semibold text-gray-700">
                  {t("Weight")}
                </div>
                <div className="col-span-2 font-semibold text-gray-700">
                  {t("Dimension(cm)")}
                </div>
                <div className="col-span-2 font-semibold text-gray-700">
                  {t("Attributes")}
                </div>
              </div>

              {/* 包裹列表 */}
              <div className="space-y-3">
                {itemsPackages.map((pkg, index) => {
                  const details = pkg.details || [];
                  const isExpanded = itemsExpandedPackages.has(pkg.id);
                  const hasMultipleItems = details.length > 1;
                  const expressNum =
                    pkg.r_express_num || pkg.express_num || "—";
                  return (
                    <div
                      key={pkg.id}
                      className="min-w-0 rounded-lg border border-gray-200 p-4"
                      style={{
                        marginBottom:
                          index < itemsPackages.length - 1 ? "12px" : "0",
                      }}
                    >
                      <div className="grid min-w-0 grid-cols-12 items-start gap-4">
                        {/* Parcel Information */}
                        <div className="col-span-6">
                          {/* Parcel ID */}
                          <div className="mb-2 flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">
                              {expressNum}
                            </span>
                            {expressNum !== "—" && (
                              <button
                                onClick={() =>
                                  itemsHandleCopyExpressNum(expressNum)
                                }
                                className="rounded p-1 transition-colors hover:bg-gray-200"
                                aria-label={t("Copy parcel number")}
                              >
                                <Copy className="h-3 w-3 text-gray-500" />
                              </button>
                            )}
                          </div>

                          {/* Details 列表 */}
                          <div className="space-y-2">
                            {details.length === 0 ? (
                              // 空数组：显示默认图片和"转运包裹"
                              <div className="flex items-start gap-2">
                                <div className="h-16 w-16 shrink-0">
                                  <img
                                    src="/assets/images/package/package.png"
                                    alt={t("Transfer parcel")}
                                    className="h-full w-full rounded border border-gray-200 object-cover"
                                    onError={(e) => {
                                      (
                                        e.target as HTMLImageElement
                                      ).style.display = "none";
                                      (
                                        e.target as HTMLImageElement
                                      ).parentElement!.innerHTML =
                                        itemsNoImageHtml.plain;
                                    }}
                                  />
                                </div>
                                <div className="flex-1 text-sm text-gray-700">
                                  {t("Transfer parcel")}
                                </div>
                              </div>
                            ) : (
                              <>
                                {/* 显示第一个 detail */}
                                {details.length > 0 && (
                                  <div className="flex items-start gap-2">
                                    <div className="h-16 w-16 shrink-0">
                                      {details[0].full_path_images &&
                                      details[0].full_path_images.length > 0 ? (
                                        <img
                                          src={details[0].full_path_images[0]}
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
                                                itemsNoImageHtml.withErr;
                                            }
                                          }}
                                        />
                                      ) : details[0].images &&
                                        details[0].images.length > 0 ? (
                                        <img
                                          src={details[0].images[0]}
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
                                                itemsNoImageHtml.withErr;
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
                                        {details[0].name ||
                                          t("Unnamed product")}
                                      </div>
                                      {details[0].spec && (
                                        <div className="mt-1 text-xs text-gray-500">
                                          {details[0].spec}
                                        </div>
                                      )}
                                      <div className="mt-1 text-xs text-gray-500">
                                        x{details[0].qty || 1}
                                      </div>
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
                                          {detail.full_path_images &&
                                          detail.full_path_images.length > 0 ? (
                                            <img
                                              src={detail.full_path_images[0]}
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
                                                    itemsNoImageHtml.withErr;
                                                }
                                              }}
                                            />
                                          ) : detail.images &&
                                            detail.images.length > 0 ? (
                                            <img
                                              src={detail.images[0]}
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
                                                    itemsNoImageHtml.withErr;
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
                                            {detail.name ||
                                              t("Unnamed product")}
                                          </div>
                                          {detail.spec && (
                                            <div className="mt-1 text-xs text-gray-500">
                                              {detail.spec}
                                            </div>
                                          )}
                                          <div className="mt-1 text-xs text-gray-500">
                                            x{detail.qty || 1}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* multiple Item 按钮 */}
                                {hasMultipleItems && (
                                  <button
                                    onClick={() => itemsToggleExpand(pkg.id)}
                                    className="mt-2 flex shrink-0 cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs whitespace-nowrap transition-colors"
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
                        <div
                          className="col-span-2 text-sm text-gray-700"
                          style={{ paddingTop: "20px" }}
                        >
                          {itemsFormatWeight(pkg.package_weight)}
                        </div>

                        {/* Dimension */}
                        <div
                          className="col-span-2 min-w-0 text-sm break-words text-gray-700"
                          style={{ paddingTop: "20px" }}
                        >
                          {itemsFormatDimension(
                            pkg.length,
                            pkg.width,
                            pkg.height,
                          )}
                        </div>

                        {/* Attributes */}
                        <div
                          className="col-span-2"
                          style={{ paddingTop: "20px" }}
                        >
                          <div className="flex flex-wrap gap-2">
                            {pkg.prop && pkg.prop.length > 0 ? (
                              pkg.prop.map((prop) => (
                                <span
                                  key={prop.id}
                                  className="rounded px-2 py-1 text-xs text-white"
                                  style={{
                                    backgroundColor: prop.color || "#FF5B00",
                                    color: prop.font_color || "#FFFFFF",
                                  }}
                                >
                                  {prop.cn_name ||
                                    prop.en_name ||
                                    prop.name ||
                                    prop.prop_name}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm text-gray-400">
                                {"—"}
                              </span>
                            )}
                          </div>
                        </div>

                        {itemsRenderStandardQcBlock(
                          pkg,
                          "col-span-12 min-w-0 border-t border-gray-100 pt-3 mt-2",
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 手机端布局 */}
            <div className="space-y-2 md:hidden">
              {itemsPackages.map((pkg, pkgIndex) => {
                const details = pkg.details || [];
                const isExpanded = itemsExpandedPackages.has(pkg.id);
                const hasMultipleItems = details.length > 1;
                const expressNum = pkg.express_num || "—";
                const isLastPackage = pkgIndex === itemsPackages.length - 1;
                return (
                  <div
                    key={pkg.id}
                    className={`min-w-0 rounded-lg bg-white pb-2${isLastPackage ? "" : "border-b border-gray-200"}`}
                  >
                    {/* Parcel ID */}
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {expressNum}
                      </span>
                      {expressNum !== "—" && (
                        <button
                          onClick={() => itemsHandleCopyExpressNum(expressNum)}
                          className="rounded p-1 transition-colors hover:bg-gray-100"
                          aria-label={t("Copy parcel number")}
                        >
                          <Copy className="h-3 w-3 text-gray-500" />
                        </button>
                      )}
                    </div>

                    {/* Details 列表 */}
                    <div className="mb-3 space-y-2">
                      {details.length === 0 ? (
                        // 空数组：显示默认图片和"转运包裹"
                        <div className="flex items-start gap-2">
                          <div className="h-16 w-16 shrink-0">
                            <img
                              src="/assets/images/package/package.png"
                              alt={t("Transfer parcel")}
                              className="h-full w-full rounded border border-gray-200 object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                  "none";
                                (
                                  e.target as HTMLImageElement
                                ).parentElement!.innerHTML =
                                  itemsNoImageHtml.plain;
                              }}
                            />
                          </div>
                          <div className="flex-1 text-sm text-gray-700">
                            {t("Transfer parcel")}
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* 显示第一个 detail */}
                          {details.length > 0 && (
                            <div className="flex items-start gap-2">
                              <div className="h-16 w-16 shrink-0">
                                {details[0].full_path_images &&
                                details[0].full_path_images.length > 0 ? (
                                  <img
                                    src={details[0].full_path_images[0]}
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
                                          itemsNoImageHtml.withErr;
                                      }
                                    }}
                                  />
                                ) : details[0].images &&
                                  details[0].images.length > 0 ? (
                                  <img
                                    src={details[0].images[0]}
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
                                          itemsNoImageHtml.withErr;
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
                                  {details[0].name || t("Unnamed product")}
                                </div>
                                {details[0].spec && (
                                  <div className="mt-1 text-xs text-gray-500">
                                    {details[0].spec}
                                  </div>
                                )}
                                <div className="mt-1 text-xs text-gray-500">
                                  x{details[0].qty || 1}
                                </div>
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
                                    {detail.full_path_images &&
                                    detail.full_path_images.length > 0 ? (
                                      <img
                                        src={detail.full_path_images[0]}
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
                                              itemsNoImageHtml.withErr;
                                          }
                                        }}
                                      />
                                    ) : detail.images &&
                                      detail.images.length > 0 ? (
                                      <img
                                        src={detail.images[0]}
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
                                              itemsNoImageHtml.withErr;
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
                                    {detail.spec && (
                                      <div className="mt-1 text-xs text-gray-500">
                                        {detail.spec}
                                      </div>
                                    )}
                                    <div className="mt-1 text-xs text-gray-500">
                                      x{detail.qty || 1}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* multiple Item 按钮 */}
                          {hasMultipleItems && (
                            <button
                              onClick={() => itemsToggleExpand(pkg.id)}
                              className="mt-2 flex shrink-0 cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs whitespace-nowrap transition-colors"
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
                          )}
                        </>
                      )}
                    </div>

                    {/* 其他信息 */}
                    <div className="pt-3">
                      {/* 第一行：Weight 和 Dimension */}
                      <div className="mb-2 grid min-w-0 grid-cols-2 gap-4">
                        <div className="flex min-w-0 items-start gap-1">
                          <span className="shrink-0 pt-0.5 text-xs text-gray-600">
                            {t("Weight:")}
                          </span>
                          <span className="min-w-0 flex-1 text-sm break-words text-gray-900">
                            {itemsFormatWeight(pkg.package_weight)}
                          </span>
                        </div>
                        <div className="flex min-w-0 items-start gap-1">
                          <span className="shrink-0 pt-0.5 text-xs text-gray-600">
                            {t("Dimension:")}
                          </span>
                          <span className="min-w-0 flex-1 text-sm break-words text-gray-900">
                            {itemsFormatDimension(
                              pkg.length,
                              pkg.width,
                              pkg.height,
                            )}
                          </span>
                        </div>
                      </div>
                      {/* Attributes */}
                      <div className="flex items-center gap-1">
                        <div className="flex flex-wrap gap-2">
                          {pkg.prop && pkg.prop.length > 0 ? (
                            pkg.prop.map((prop) => (
                              <span
                                key={prop.id}
                                className="rounded px-2 py-1 text-xs text-white"
                                style={{
                                  backgroundColor: prop.color || "#FF5B00",
                                  color: prop.font_color || "text-primary",
                                }}
                              >
                                {prop.cn_name ||
                                  prop.en_name ||
                                  prop.name ||
                                  prop.prop_name}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-gray-400">{"—"}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {itemsRenderStandardQcBlock(pkg, "mt-3 min-w-0")}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <ImagePreviewLightbox
          open={itemsQcLightboxOpen}
          onClose={() => itemsSetQcLightboxOpen(false)}
          slides={itemsQcLightboxSlides}
          index={itemsQcLightboxIndex}
          closeOnBackdropClick
        />
      </Section>
    );
  })();
  const parcelContent = (() => {
    if (loading) {
      return (
        <ParcelPackageDataLoadingSkeleton
          marginTop={parcelMarginTop}
          marginBottom={parcelMarginBottom}
        />
      );
    }
    if (error) {
      return (
        <Section>
          <div className="text-red-500">
            {t("Failed to load:")} {error.message}
          </div>
        </Section>
      );
    }
    if (!orderInfo) {
      return (
        <Section>
          <div className="text-gray-500">{t("No data")}</div>
        </Section>
      );
    }
    const parcelParcelNo = orderInfo.order_sn || "—";
    const parcelCreateTime = orderInfo.created_at
      ? parcelFormatDateTime(orderInfo.created_at)
      : "—";
    const parcelShippingMethod = orderInfo.express_name || "—";
    const parcelWeight = orderInfo.payment_weight
      ? parcelFormatWeight(orderInfo.payment_weight)
      : "—";
    const parcelBoxes: ParcelOrderBox[] = Array.isArray(orderInfo.boxes)
      ? (orderInfo.boxes as ParcelOrderBox[])
      : [];
    const parcelHasBoxes = parcelBoxes.length > 0;
    const parcelOrderDimensionalText = parcelFormatBoxDimension(
      orderInfo.length,
      orderInfo.width,
      orderInfo.height,
    );
    return (
      <Section>
        <div
          className="rounded-lg bg-white p-4"
          style={{
            marginTop: `${parcelMarginTop}px`,
            marginBottom: `${parcelMarginBottom}px`,
          }}
        >
          <div className="space-y-3">
            {/* Parcel NO. */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t("Parcel NO:")}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-900">{parcelParcelNo}</span>
                {parcelParcelNo !== "—" && (
                  <button
                    onClick={() => parcelHandleCopyOrderSn(parcelParcelNo)}
                    className="rounded p-1 transition-colors hover:bg-gray-100"
                    aria-label={t("Copy parcel number")}
                  >
                    <Copy className="h-3 w-3 text-gray-500" />
                  </button>
                )}
              </div>
            </div>

            {/* Create time */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t("Create time:")}</span>
              <span className="text-sm text-gray-900">{parcelCreateTime}</span>
            </div>

            {/* Shipping method */}
            <div className="flex items-center justify-between gap-2">
              <span className="shrink-0 text-sm text-gray-600">
                {t("Shipping method:")}
              </span>
              <span className="min-w-0 text-end text-sm break-words text-gray-900">
                {parcelShippingMethod}
              </span>
            </div>

            {/* weight */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t("weight:")}</span>
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-900">{parcelWeight}</span>
                {parcelHasBoxes && (
                  <button
                    type="button"
                    className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                    aria-expanded={parcelBoxesExpanded}
                    aria-label={
                      parcelBoxesExpanded
                        ? t("Collapse box list")
                        : t("Expand box list")
                    }
                    onClick={() => parcelSetBoxesExpanded((v) => !v)}
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform duration-200",
                        parcelBoxesExpanded && "rotate-180",
                      )}
                    />
                  </button>
                )}
              </div>
            </div>

            {/* 多箱信息 */}
            {parcelHasBoxes && parcelBoxesExpanded && (
              <div className="space-y-4 border-s-2 border-gray-100 ps-2">
                {parcelBoxes.map((box) => (
                  <div key={box.id} className="space-y-1">
                    <div className="text-sm break-words text-gray-900">
                      {(box.sn || "—") + ":"}
                    </div>
                    <div className="text-sm text-gray-900">
                      {t("weight:")}{" "}
                      {typeof box.weight === "number"
                        ? parcelFormatWeight(box.weight)
                        : "—"}
                    </div>
                    <div className="text-sm break-words text-gray-900">
                      {t("dimension:")}{" "}
                      {parcelFormatBoxDimension(
                        box.length,
                        box.width,
                        box.height,
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Order dimensions (L×W×H) when no multi-box breakdown */}
            {!parcelHasBoxes && (
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-sm text-gray-600">
                  {t("Dimensional:")}
                </span>
                <span className="min-w-0 text-end text-sm break-words text-gray-900">
                  {parcelOrderDimensionalText}
                </span>
              </div>
            )}
          </div>
        </div>
      </Section>
    );
  })();
  const paymentContent = (() => {
    if (loading) {
      return (
        <PaymentPackagePriceLoadingSkeleton
          marginTop={paymentMarginTop}
          marginBottom={paymentMarginBottom}
        />
      );
    }
    if (error) {
      return (
        <Section>
          <div className="text-red-500">
            {t("Failed to load:")} {error.message}
          </div>
        </Section>
      );
    }
    if (!orderInfo) {
      return (
        <Section>
          <div className="text-gray-500">{t("No data")}</div>
        </Section>
      );
    }
    if (!orderInfo.payable) return null;
    const paymentPaymentMethod = "—";
    const paymentPaymentTime = "—";
    const paymentTotalFreightFormatted =
      orderInfo.currency === "CNY"
        ? paymentPriceConvert(orderInfo.totalFen, { needFormat: true })
        : [orderInfo.currency, (orderInfo.totalFen / 100).toFixed(2)]
            .filter(Boolean)
            .join(" ");
    const paymentFreightFormatted = "—";
    const paymentValueAddedFormatted = "—";
    const paymentLineServiceFee = 0;
    const paymentLineServiceFeeFormatted = "—";
    return (
      <Section>
        <div
          className="rounded-lg bg-white p-4"
          style={{
            marginTop: `${paymentMarginTop}px`,
            marginBottom: `${paymentMarginBottom}px`,
          }}
        >
          <div className="space-y-3">
            {/* Payment time */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {t("Payment time:")}
              </span>
              <span className="text-sm text-gray-900">
                {paymentPaymentTime}
              </span>
            </div>

            {/* Payment Method */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {t("Payment Method:")}
              </span>
              <span className="text-sm text-gray-900">
                {paymentPaymentMethod}
              </span>
            </div>

            {/* Total Freight - 可展开 */}
            <div className="space-y-2">
              <button
                onClick={() => paymentSetExpanded(!paymentExpanded)}
                className="flex w-full items-center justify-between transition-opacity hover:opacity-80"
              >
                <span className="text-sm text-gray-600">
                  {t("Total Freight:")}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#FF5B00]">
                    {paymentTotalFreightFormatted}
                  </span>
                  <ChevronUp
                    className={`h-4 w-4 text-[#FF5B00] transition-transform ${paymentExpanded ? "" : "rotate-180"}`}
                  />
                </div>
              </button>

              {/* 展开的明细 */}
              {paymentExpanded && (
                <div className="space-y-1 ps-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">
                      {t("Freight:")}
                    </span>
                    <span className="text-sm text-gray-900">
                      {paymentFreightFormatted}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">
                      {t("Value-added services:")}
                    </span>
                    <span className="text-sm text-gray-900">
                      {paymentValueAddedFormatted}
                    </span>
                  </div>
                  {paymentLineServiceFee > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">
                        {t("Channel service fee:")}
                      </span>
                      <span className="text-sm text-gray-900">
                        {paymentLineServiceFeeFormatted}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 支付按钮 */}
            {orderInfo.payable && (
              <div className="mt-3 flex justify-end border-t border-gray-100 pt-3">
                <Button
                  className="h-10 rounded-lg text-sm font-medium"
                  style={{
                    backgroundColor: "#FF5B00",
                    color: "white",
                  }}
                  onClick={() => void startCheckout()}
                >
                  {t("Pay")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </Section>
    );
  })();
  return (
    <>
      <Section className="my-6 flex min-h-[300px] w-full flex-col items-start justify-start gap-0 px-0 max-md:items-stretch max-md:gap-4">
        <>
          <div className="grid grid-cols-[repeat(12,minmax(0,1fr))] gap-x-[16px] gap-y-[16px] md:grid-cols-[repeat(12,minmax(0,1fr))] lg:grid-cols-[repeat(12,minmax(0,1fr))] lg:gap-x-[16px] lg:gap-y-[16px]">
            <div className="col-span-12 min-w-0 md:col-span-8 lg:col-span-8">
              {logisticsContent}
              {itemsContent}
            </div>
            <div className="col-span-12 min-w-0 md:col-span-4 lg:col-span-4">
              {parcelContent}
              {paymentContent}
            </div>
          </div>
        </>
      </Section>
    </>
  );
}
