import { AppError } from "../../errors";

export type ProcurementOperation = "logisticsTrace" | "manual" | "sellerSearch" | "imageSearch" | "channels" | "search" | "detail" | "parse" | "preview" | "create" | "orderDetail" | "cancel" | "pay";
const paths: Record<ProcurementOperation, string> = {
  logisticsTrace: "/v1/orders/logistics/trace",
  manual: "/v1/orders/manual",
  sellerSearch: "/v1/products/seller/search", imageSearch: "/v1/products/search-by-image",
  channels: "/v1/products/channels", search: "/v1/products/search", detail: "/v1/products/detail", parse: "/v1/products/parse",
  preview: "/v1/orders/preview", create: "/v1/orders/create", orderDetail: "/v1/orders/detail", cancel: "/v1/orders/cancel", pay: "/v1/orders/pay",
};
export type ProcurementResponse = { status: number; data: Record<string, unknown>; uncertain: boolean };
/** Official OpenAPI 1.0.8. No automatic retries of business writes. */
export async function callProcurement(token: string, operation: ProcurementOperation, body?: unknown, key?: string): Promise<ProcurementResponse> {
  if (!token.trim()) throw new AppError("INTEGRATION_REQUIRED", "Configure HioBuy integration first.", 503);
  try {
    const response = await fetch(`https://api.hiobuy.com${paths[operation]}`, {
      method: operation === "channels" ? "GET" : "POST", signal: AbortSignal.timeout(25000),
      headers: { Authorization: `Bearer ${token.trim()}`, Accept: "application/json", "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
      ...(operation !== "channels" ? { body: JSON.stringify(body) } : {}),
    });
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) return { status: response.status, data: {}, uncertain: true };
    return { status: response.status, data: data as Record<string, unknown>, uncertain: response.status >= 500 || response.status === 409 };
  } catch { return { status: 0, data: {}, uncertain: true }; }
}
export function requireProcurementResult(result: ProcurementResponse) {
  if (result.uncertain || result.status < 200 || result.status >= 300 || result.data.success === false || result.data.error) {
    throw new AppError("HIOBUY_REQUEST_FAILED", "HioBuy could not complete this request. Check integration access and try again.", 502);
  }
  return result.data;
}
