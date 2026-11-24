import { z } from "zod";
import type { PackageState } from "./status";
import type { WarehouseServiceCatalog } from "./warehouse-service-catalog";

export const serviceSelection = z.array(z.object({
  code: z.string().trim().min(1).max(64),
  quantity: z.number().int().positive(),
}).strict()).max(50).refine(items => new Set(items.map(item => item.code)).size === items.length, "服务代码不能重复");
export const serviceApplication = z.object({ services: serviceSelection.nonempty() }).strict();
export type ServiceSelection = z.infer<typeof serviceSelection>;

export function inboundApplicationAllowed(pkg: Record<keyof PackageState, string> & { hiobuyPackageId: string | null; hiobuyStatus: string | null }) {
  return !!pkg.hiobuyPackageId && pkg.hiobuyStatus === "RECEIVED" && pkg.lockStatus === "AVAILABLE"
    && pkg.conditionStatus === "NORMAL" && ["NONE", "RESOLVED"].includes(pkg.exceptionStatus)
    && ["NONE", "COMPLETED", "CANCELLED"].includes(pkg.vasStatus)
    && pkg.disposition === "NONE" && pkg.packageStatus === "RECEIVED";
}

export function outboundApplicationAllowed(shipment: {
  status: string; upstreamStatus: string | null; hiobuyPaymentStatus: string | null;
  interceptionStatus: string | null; trackingNumber: string | null;
}) {
  return ["CONSOLIDATING", "WAITING_FOR_WEIGHT"].includes(shipment.status)
    && shipment.upstreamStatus === "PENDING" && !shipment.trackingNumber
    && (!shipment.hiobuyPaymentStatus || shipment.hiobuyPaymentStatus === "UNPAID")
    && (!shipment.interceptionStatus || shipment.interceptionStatus === "FAILED");
}

export function selectionMatchesCatalog(items: ServiceSelection, catalog: WarehouseServiceCatalog) {
  return items.every(({ code, quantity }) => {
    const service = catalog.items.find(row => row.stage === catalog.stage && row.code === code);
    return service && quantity >= (service.minQuantity ?? 1) && (service.maxQuantity === null || quantity <= service.maxQuantity);
  });
}
