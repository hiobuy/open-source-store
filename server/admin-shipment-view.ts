import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "./db/client";
import { fulfillmentSyncAttempts, fulfillmentSyncTasks, shipmentMilestones } from "./db/schema";
import type { presentEarning } from "./earnings";

/** Display serial from successful HioBuy responses; never substitute a resource ID. */
export async function shipmentOrderNumbers(db: Database, items: { id: string; hiobuyShipmentId: string | null }[]) {
  const result = new Map<string, string>();
  if (!items.length) return result;
  const rows = await db.select({ entityId: fulfillmentSyncTasks.entityId, remoteId: fulfillmentSyncTasks.remoteId, number: fulfillmentSyncTasks.remoteSecondary })
    .from(fulfillmentSyncTasks).where(and(eq(fulfillmentSyncTasks.entityType, "shipment"), inArray(fulfillmentSyncTasks.entityId, items.map(item => item.id)), inArray(fulfillmentSyncTasks.action, ["shipment_create", "shipment_pay", "shipment_status_pull"])));
  for (const item of items) {
    if (!item.hiobuyShipmentId) continue;
    const numbers = new Set(rows.filter(row => row.entityId === item.id && row.remoteId === item.hiobuyShipmentId).map(row => row.number?.trim()).filter((value): value is string => Boolean(value)));
    if (numbers.size === 1) result.set(item.id, [...numbers][0]);
  }
  return result;
}

export function visibleShipmentEarning(earning: ReturnType<typeof presentEarning>, canReadCosts: boolean): ReturnType<typeof presentEarning> {
  if (canReadCosts) return earning;
  return { ...earning, status: "unavailable", hiobuyCostCnyFen: null, hiobuyCostUsdFen: null, grossProfitUsdFen: null, markupBps: null, markupCnyFen: null, cnyPerUsdE4: null, adjustments: [] };
}

/** Upstream event times take priority; confirmed attempts are the legacy fallback. Never infer from updatedAt. */
export async function shipmentListTimes(db: Database, ids: string[]) {
  const result = new Map<string, { packedAt: string | null; hiobuyPaidAt: string | null; shippedAt: string | null }>();
  if (!ids.length) return result;
  const rows = await db.select({ entityId: fulfillmentSyncTasks.entityId, action: fulfillmentSyncTasks.action, outcome: fulfillmentSyncAttempts.outcome, status: fulfillmentSyncAttempts.newStatus, at: fulfillmentSyncAttempts.finishedAt, createdAt: fulfillmentSyncAttempts.createdAt })
    .from(fulfillmentSyncTasks).innerJoin(fulfillmentSyncAttempts, eq(fulfillmentSyncTasks.id, fulfillmentSyncAttempts.taskId))
    .where(and(eq(fulfillmentSyncTasks.entityType, "shipment"), inArray(fulfillmentSyncTasks.entityId, ids)));
  for (const row of rows.sort((a, b) => (a.at ?? a.createdAt) - (b.at ?? b.createdAt))) {
    if (!["synced", "updated"].includes(row.outcome)) continue;
    const times = result.get(row.entityId) ?? { packedAt: null, hiobuyPaidAt: null, shippedAt: null };
    const at = new Date(row.at ?? row.createdAt).toISOString();
    if (row.status === "WAIT_PAYMENT") times.packedAt ??= at;
    if (row.action === "shipment_pay") times.hiobuyPaidAt ??= at;
    if (row.status === "SHIPPED") times.shippedAt ??= at;
    result.set(row.entityId, times);
  }
  const confirmed = await db.select().from(shipmentMilestones).where(inArray(shipmentMilestones.shipmentId, ids));
  for (const row of confirmed) {
    const times = result.get(row.shipmentId) ?? { packedAt: null, hiobuyPaidAt: null, shippedAt: null };
    for (const key of ["packedAt", "hiobuyPaidAt", "shippedAt"] as const) {
      if (row[key] != null) times[key] = new Date(row[key]).toISOString();
    }
    result.set(row.shipmentId, times);
  }
  return result;
}
