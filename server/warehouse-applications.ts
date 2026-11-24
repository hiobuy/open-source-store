import { and, eq, inArray } from "drizzle-orm";
import { inboundApplicationAllowed, outboundApplicationAllowed, selectionMatchesCatalog, type ServiceSelection } from "../src/domain/warehouse-service-application";
import type { WarehouseStage } from "../src/domain/warehouse-service-catalog";
import type { Database } from "./db/client";
import { chunks } from "./batch-utils";
import { packages, shipmentMilestones, shipments } from "./db/schema";
import { AppError } from "./errors";
import { warehouseUnavailable } from "./services/hiobuy/warehouse-services";
import { warehouseCatalog } from "./warehouse-catalog";

export async function rejectUnsupportedApplication(db: Database, envToken: string | undefined, stage: WarehouseStage, selection: ServiceSelection): Promise<never> {
  const catalog = await warehouseCatalog(db, envToken, stage);
  if (!selectionMatchesCatalog(selection, catalog)) throw new AppError("INVALID_SERVICE_SELECTION", "服务已停用、阶段不匹配或数量超出目录范围", 400);
  // The warehouse HTTP provider explicitly marks POST service-requests unavailable.
  // Even a successful catalog or list GET does not establish write capability.
  throw new AppError("WAREHOUSE_SERVICE_UNAVAILABLE", warehouseUnavailable, 503);
}

export async function checkApplicationPackages(db: Database, userId: string, ids: string[]) {
  for (const batch of chunks([...new Set(ids)], 90)) {
    const rows = await db.select().from(packages).where(and(eq(packages.userId, userId), inArray(packages.id, batch)));
    if (rows.length !== batch.length) throw new AppError("NOT_FOUND", "包裹不存在", 404);
    if (rows.some(row => !inboundApplicationAllowed(row))) throw new AppError("PACKAGE_NOT_ELIGIBLE", "只有已入库、未锁定且无待处理事项的包裹可申请增值服务", 409);
  }
}

export async function applyForPackageService(db: Database, userId: string, id: string, selection: ServiceSelection, envToken?: string) {
  await checkApplicationPackages(db, userId, [id]);
  return rejectUnsupportedApplication(db, envToken, "INBOUND", selection);
}

export async function applyForShipmentService(db: Database, userId: string, id: string, selection: ServiceSelection, envToken?: string) {
  const [row] = await db.select({ shipment: shipments, milestones: shipmentMilestones }).from(shipments)
    .leftJoin(shipmentMilestones, eq(shipmentMilestones.shipmentId, shipments.id))
    .where(and(eq(shipments.userId, userId), eq(shipments.id, id)));
  if (!row) throw new AppError("NOT_FOUND", "运单不存在", 404);
  if (!row.shipment.hiobuyShipmentId || !row.shipment.hiobuySyncedAt || !outboundApplicationAllowed(row.shipment)
    || row.milestones?.packedAt != null || row.milestones?.hiobuyPaidAt != null || row.milestones?.shippedAt != null) {
    throw new AppError("SHIPMENT_NOT_ELIGIBLE", "仅已同步且仍在等待打包的运单可申请增值服务", 409);
  }
  return rejectUnsupportedApplication(db, envToken, "OUTBOUND", selection);
}
