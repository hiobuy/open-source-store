import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { toast } from "sonner";
import type { ProcurementProductChannel } from "@/lib/procurement/types";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export interface OrderStatusResult {
  status_name: string;
  status_desc: string;
}
export interface OrderForFormatStatus {
  status: number | string;
  status_name?: string;
  sub_status?: number;
  order_type?: number;
  review_status?: number;
  pay_status?: number;
  purchase_packages?: unknown[];
  packages?: Array<{
    express_num?: string;
    status?: number;
  }>;
}
/** `formatOrderStatus` 展示用文案（与业务 status / sub_status / 包裹状态分支对应） */
export interface OrderStatusFormatLabels {
  pendingPayment: string;
  paid: string;
  purchasing: string;
  merchantShipped: string;
  awaitingMerchantShipment: string;
  pendingStorage: string;
  stored: string;
  packaged: string;
  shipped: string;
  received: string;
  transactionCompleted: string;
  pendingOutbound: string;
  cancelled: string;
  pendingReview: string;
  underReview: string;
  additionalPaymentRequired: string;
  reviewed: string;
  unknown: string;
}
export const DEFAULT_ORDER_STATUS_FORMAT_LABELS: OrderStatusFormatLabels = {
  pendingPayment: "Pending Payment",
  paid: "Paid",
  purchasing: "Purchasing",
  merchantShipped: "Merchant Shipped",
  awaitingMerchantShipment: "Awaiting Merchant Shipment",
  pendingStorage: "Pending Storage",
  stored: "Stored",
  packaged: "Packaged",
  shipped: "Shipped",
  received: "Received",
  transactionCompleted: "Transaction Completed",
  pendingOutbound: "Pending Outbound",
  cancelled: "Cancelled",
  pendingReview: "Pending Review",
  underReview: "Under Review",
  additionalPaymentRequired: "Additional Payment Required",
  reviewed: "Reviewed",
  unknown: "Unknown",
};
export function mergeOrderStatusFormatLabels(
  partial?: Partial<OrderStatusFormatLabels> | null,
): OrderStatusFormatLabels {
  return { ...DEFAULT_ORDER_STATUS_FORMAT_LABELS, ...(partial || {}) };
}
/**
 * Format order status text based on order status, sub_status, and package status
 * @param order Order object
 * @param skuCode Optional, package/express tracking number for package-level status
 * @param labels Optional copy overrides (e.g. from Puck `orderFmt_*`)
 */
export function formatOrderStatus(
  order: OrderForFormatStatus,
  skuCode?: string,
  labels?: Partial<OrderStatusFormatLabels>,
): OrderStatusResult {
  const L = mergeOrderStatusFormatLabels(labels);
  const statusObj: OrderStatusResult = { status_name: "", status_desc: "" };
  const handleOrderStatus = () => {
    switch (String(order.status)) {
      case "0":
        statusObj.status_name = L.pendingPayment;
        break;
      case "1":
        statusObj.status_name = L.paid;
        break;
      case "2":
      case "12":
        statusObj.status_name = L.purchasing;
        break;
      case "3":
        if (order.purchase_packages && order.purchase_packages.length > 0) {
          statusObj.status_name = L.merchantShipped;
        } else {
          statusObj.status_name = L.awaitingMerchantShipment;
        }
        break;
      case "4":
        statusObj.status_name = L.pendingStorage;
        break;
      case "5":
        statusObj.status_name = L.stored;
        break;
      case "6":
        if (order.sub_status === 63) {
          statusObj.status_name = L.packaged;
        } else if (order.sub_status === 65) {
          statusObj.status_name = L.shipped;
        } else if (order.sub_status === 66) {
          statusObj.status_name = L.received;
        } else if (order.order_type === 2) {
          statusObj.status_name = L.transactionCompleted;
        } else {
          statusObj.status_name = order.status_name ?? L.pendingOutbound;
        }
        break;
      case "10":
        statusObj.status_name = L.cancelled;
        break;
      case "20":
        if (order.review_status === 0) {
          statusObj.status_name = L.pendingReview;
        } else if (order.review_status === 1) {
          statusObj.status_name = L.underReview;
        } else if (order.review_status === 2) {
          statusObj.status_name = L.additionalPaymentRequired;
        } else if (order.review_status === 4) {
          statusObj.status_name = L.reviewed;
        }
        break;
      default:
        statusObj.status_name = order.status_name ?? L.unknown;
        if (process.env.NODE_ENV === "development") {
          console.warn(`未处理的订单状态值: ${order.status}`);
        }
    }
  };
  const handleOrderPayStatus = () => {
    if ([11].includes(Number(order.pay_status))) {
      statusObj.status_name = L.underReview;
    }
  };
  const handlePackageStatus = () => {
    if (order.packages && order.packages.length > 0 && skuCode) {
      const pkg = order.packages.find((item) => item.express_num === skuCode);
      if (pkg?.status != null) {
        switch (pkg.status) {
          case 1:
            statusObj.status_name = L.pendingStorage;
            break;
          case 2:
            statusObj.status_name = L.stored;
            break;
          case 3:
          case 4:
            statusObj.status_name = L.packaged;
            break;
          case 5:
            statusObj.status_name = L.shipped;
            break;
          case 6:
            statusObj.status_name = L.received;
            break;
          default:
            if (process.env.NODE_ENV === "development") {
              console.warn(`未处理的包裹状态值: ${pkg.status}`);
            }
        }
      }
    }
  };
  handleOrderStatus();
  handleOrderPayStatus();
  handlePackageStatus();
  return statusObj;
}
/**
 * 将标题转为 URL path 段：只保留各语言的字母和数字，其余字符（空格、标点、括号、emoji 等）
 * 合并为 `-`。
 */
export function slugifyProductTitleForPath(title: string): string {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/['\u2019\u2018]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
/**
 * 解析 slugifyProductTitleForPath 的结果（或同规则的 path 段）：`-` 还原为空格，便于展示。
 * 英文：首字母大写，每个空格后的词首字母也大写，其余字母小写。
 * 若段内曾经过 encodeURIComponent，会先解码。无法还原 slug 时已删除的字符。
 */
export function parseProductTitleFromPathSlug(segment: string): string {
  let s = String(segment ?? "").trim();
  if (!s) return "";
  try {
    s = decodeURIComponent(s);
  } catch {
    // 非法编码则按原字符串继续
  }
  const normalized = s.replace(/-+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized
    .split(" ")
    .map((word) => {
      if (!word) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
/** 商品 id：数字、字母、下划线、中划线 */
const ID_PATTERN = /^[\w-]+$/;
/**
 * 从常见站外商品详情 URL 解析 num_iid 与站内路径用平台段（与 GoodsApi /product/{platform}/… 一致）。
 * 短链、需跳转的链接无法解析时返回 null。
 */
export function parseGoodsExternalUrl(detailUrl: string): {
  num_iid: string;
  api_type: ProcurementProductChannel;
} | null {
  const raw = String(detailUrl ?? "").trim();
  if (!raw) return null;
  let url: URL;
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    url = new URL(withProto);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname;
  const q = url.searchParams;
  // 1688：/offer/764086668614.html
  if (host.includes("1688.com")) {
    const m = path.match(/\/offer\/([\w-]+)\.html/i);
    if (m) return { num_iid: m[1], api_type: "1688" };
    const offerId = q.get("offerId");
    if (offerId && ID_PATTERN.test(offerId))
      return { num_iid: offerId, api_type: "1688" };
  }
  // 淘宝 / 天猫
  if (
    host.includes("taobao.com") ||
    host.includes("tmall.com") ||
    host.includes("tmall.hk") ||
    host.includes("liangxinyao.com")
  ) {
    const id = q.get("id") || q.get("itemId");
    if (id && ID_PATTERN.test(id)) return { num_iid: id, api_type: "taobao" };
  }
  // 微店
  if (
    host.includes("weidian.com") ||
    host.includes("koudai.com") ||
    host.includes("youshop")
  ) {
    const itemID =
      q.get("itemID") ||
      q.get("itemId") ||
      q.get("item_id") ||
      q.get("offerId");
    // 短链等拿不到 id 时 num_iid 为空，仍视为微店链接，交给后端解析
    return {
      num_iid: itemID && ID_PATTERN.test(itemID) ? itemID : "",
      api_type: "weidian",
    };
  }
  return null;
}
/** 复制到剪贴板 toast 默认英文（Puck 与各组件 defaultProps 可对齐覆盖） */
export const DEFAULT_COPY_CLIPBOARD_TOAST = {
  success: "Successfully copied to clipboard",
  error: "Failed to copy to clipboard",
} as const;
/**
 * Copy text to clipboard
 * @param text Text to copy
 * @param toastMessages 覆盖成功/失败 toast（Puck 或调用方可传入）
 * @returns Promise<boolean> true if successful
 */
export async function copyToClipboard(
  text: string,
  toastMessages?: Partial<{
    success: string;
    error: string;
  }>,
): Promise<boolean> {
  const msg = { ...DEFAULT_COPY_CLIPBOARD_TOAST, ...toastMessages };
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textArea);
    if (success) {
      toast.success(msg.success);
    } else {
      toast.error(msg.error);
    }
    return success;
  } catch {
    toast.error(msg.error);
    return false;
  }
}
/**
 * 从整段复制文案（标题 + 淘口令/说明）中截取首个 http(s) 链接
 */
function extractFirstHttpUrlFromText(text: string): string | null {
  const m = /https?:\/\/[^\s<>"'）\]}]+/i.exec(String(text ?? "").trim());
  if (!m) return null;
  return m[0].replace(/[，,。.!！?？;:：]+$/g, "") || null;
}
/**
 * 判断是否为外部商品链接
 * - 短链/二维码：tb.cn、qr.1688.com
 * - 可解析的站外详情 URL（与 `parseGoodsExternalUrl` 一致），例如 detail.m.1688.com?offerId=、/offer/xxx 等
 */
export function isExternalGoods(text: string): boolean {
  const raw = String(text ?? "").trim();
  if (!raw) return false;
  if (/(?:tb\.cn|qr\.1688\.com)/i.test(raw)) return true;
  const embedded = extractFirstHttpUrlFromText(raw);
  if (embedded && parseGoodsExternalUrl(embedded)) return true;
  if (/^https?:\/\//i.test(raw) && parseGoodsExternalUrl(raw)) return true;
  return false;
}
/**
 * 从外部商品复制文案中解析出首个可提交的详情链接
 */
export function parserExternalGoodsLink(text: string): string {
  const raw = String(text ?? "").trim();
  if (!raw) return "";
  const embedded = extractFirstHttpUrlFromText(raw);
  if (embedded) return embedded;
  if (/^https?:\/\//i.test(raw)) return raw;
  return "";
}
/**
 * 站外链接 → `/product/{platform}/...` 的路径段，与 `buildGoodsInfoParamsFromProductSlug` 中 platform 一致。
 * 能解析出 id 时用 `parseGoodsExternalUrl` 的 `api_type`；短链（如 e.tb.cn、qr.1688.com）则按域名推断。
 */
export function getExternalGoodsProductPathPlatform(detailUrl: string): string {
  const raw = String(detailUrl ?? "").trim();
  if (!raw) return "1688";
  const parsed = parseGoodsExternalUrl(raw);
  if (parsed) return String(parsed.api_type);
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withProto).hostname.toLowerCase();
    if (
      host.includes("tb.cn") ||
      host.includes("taobao.com") ||
      host.includes("tmall") ||
      host.includes("liangxinyao.com")
    ) {
      return "taobao";
    }
    if (host.includes("1688.com")) {
      return "1688";
    }
    if (
      host.includes("weidian.com") ||
      host.includes("koudai.com") ||
      host.includes("youshop")
    ) {
      return "weidian";
    }
  } catch {
    /* 非法 URL 时回退 1688，与历史行为一致 */
  }
  return "1688";
}
