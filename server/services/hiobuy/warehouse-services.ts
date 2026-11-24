import { z } from "zod";
import type { WarehouseStage, WarehouseServiceCatalog } from "../../../src/domain/warehouse-service-catalog";
import { AppError } from "../../errors";

export const warehouseUnavailable = "仓库服务暂不可用";

const stageSchema = z.enum(["INBOUND", "OUTBOUND"]);
const service = z.object({
  code: z.string().min(1), stage: stageSchema, status: z.string(),
  name: z.string(), description: z.string().nullish(), pricing_type: z.string(), unit: z.string(),
  price: z.number().nonnegative(), currency: z.literal("CNY"),
  min_quantity: z.number().int().nullish(), max_quantity: z.number().int().nullish(),
  requires_confirmation: z.boolean(),
});

async function readList(token: string, path: string): Promise<unknown[]> {
  const response = await fetch("https://api.hiobuy.com/v1/fulfillment/" + path, {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
    redirect: "error", signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Warehouse list unavailable");
  const json = await response.json() as { success?: boolean; data?: unknown; items?: unknown };
  const data = json?.data ?? json;
  const items = Array.isArray(data) ? data : (data as {items?: unknown} | null)?.items;
  if (json?.success === false || !Array.isArray(items)) throw new Error("Invalid warehouse list");
  return items;
}

export async function readWarehouseCatalog(token: string | null | undefined, stage: WarehouseStage, language = "en"): Promise<WarehouseServiceCatalog> {
  if (!token) throw new AppError("UPSTREAM_UNAVAILABLE", warehouseUnavailable, 503);
  const query = new URLSearchParams({ stage, status: "ACTIVE", language });
  const resource = stage === "INBOUND" ? "PACKAGE" : "SHIPMENT";
  try {
    const [rows, requestListAvailable] = await Promise.all([
      readList(token, "value-added-services?" + query),
      readList(token, "service-requests?resource_type=" + resource + "&page_size=1").then(() => true, () => false),
    ]);
    const items = z.array(service).parse(rows)
      .filter(row => row.stage === stage && row.status === "ACTIVE")
      .map(row => ({
        code: row.code, stage: row.stage, name: row.name, description: row.description ?? "",
        pricingType: row.pricing_type, unit: row.unit, price: row.price, currency: row.currency,
        minQuantity: row.min_quantity ?? null, maxQuantity: row.max_quantity ?? null,
        requiresConfirmation: row.requires_confirmation,
      }));
    return { stage, items, requestListAvailable, applicationAvailable: false, message: requestListAvailable ? null : warehouseUnavailable };
  } catch {
    throw new AppError("UPSTREAM_UNAVAILABLE", warehouseUnavailable, 503);
  }
}
