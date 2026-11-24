import { and, eq } from "drizzle-orm";
import type { Database } from "./db/client";
import { packages, procurementItemPackages, procurementOrders, procurementRemote } from "./db/schema";
import { AppError } from "./errors";
import { resolveHioBuyToken } from "./freight";
import { callProcurement } from "./services/hiobuy/procurement";
import { record } from "../src/domain/purchase";

import type { DomesticTrace, DomesticTracking } from "../src/types/operations";
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

/** Verified standard envelope. Steps stay opaque: OpenAPI does not define their fields. */
export function parseDomesticTracking(payload: unknown, channel: string, orderId: string): DomesticTrace[] | null {
  const root = record(payload), tracking = record(root.tracking);
  if (root.error || tracking.channel !== channel || String(tracking.order_id) !== orderId || !Array.isArray(tracking.packages)) return null;
  const result: DomesticTrace[] = [];
  for (const value of tracking.packages) {
    const parcel = record(value);
    if (!Array.isArray(parcel.steps) || parcel.steps.some(step => !step || typeof step !== "object" || Array.isArray(step))) return null;
    result.push({ trackingNumber: text(parcel.tracking_number), carrier: text(record(parcel.carrier).name), statusLabel: text(parcel.status_label), events: parcel.steps as Record<string, unknown>[], trackingStatus: parcel.steps.length ? "available" : "empty" });
  }
  return result;
}

export async function domesticPurchaseTracking(db: Database, userId: string, orderId: string, env: { HIOBUY_API_TOKEN?: string }, trackingNumber?: string): Promise<DomesticTracking> {
  const order = (await db.select({ id: procurementOrders.id }).from(procurementOrders).where(and(eq(procurementOrders.id, orderId), eq(procurementOrders.customerId, userId))))[0];
  if (!order) throw new AppError("NOT_FOUND", "Purchase order not found.", 404);
  const remote = (await db.select().from(procurementRemote).where(eq(procurementRemote.orderId, orderId)))[0];
  const base: DomesticTracking = { channel: remote?.channel ?? null, trackingStatus: "not_ready", packages: [] };
  const owned = await db.select({ number: packages.domesticTrackingNumber }).from(procurementItemPackages).innerJoin(packages, eq(packages.id, procurementItemPackages.packageId)).where(and(eq(procurementItemPackages.orderId, orderId), eq(procurementItemPackages.active, true), eq(packages.userId, userId)));
  let saved: Record<string, unknown> = {};
  try { saved = record(JSON.parse(remote?.lastResult ?? "{}")); } catch { /* No usable saved logistics snapshot. */ }
  const parcels = record(saved.order).domestic_parcels;
  const numbers = new Set(owned.map(row => row.number).filter(Boolean));
  if (Array.isArray(parcels)) for (const parcel of parcels) { const number = text(record(parcel).tracking_number); if (number) numbers.add(number); }
  if (trackingNumber && !numbers.has(trackingNumber)) throw new AppError("NOT_FOUND", "Tracking number is not linked to this purchase order.", 404);
  if (!remote?.remoteId || !["1688", "taobao", "weidian", "manual"].includes(remote.channel)) return base;
  const requests = remote.channel === "weidian" ? (trackingNumber ? [trackingNumber] : [...numbers]) : [undefined];
  if (!requests.length) return base;
  let token: string | undefined;
  try { token = await resolveHioBuyToken(db, env.HIOBUY_API_TOKEN); } catch { return { ...base, trackingStatus: "unavailable" }; }
  if (!token) return { ...base, trackingStatus: "unavailable" };
  const remoteId = remote.remoteId;
  const traces: DomesticTrace[] = [];
  let failed = false, cursor = 0;
  // Bound per-request fan-out for Weidian; a single order can have multiple parcels.
  await Promise.all(Array.from({ length: Math.min(3, requests.length) }, async () => {
    while (cursor < requests.length) {
      const number = requests[cursor++];
      const response = await callProcurement(token!, "logisticsTrace", { channel: remote.channel, order_id: remoteId, response_format: "standard", ...(number ? { express_no: number } : {}) });
      const parsed = !response.uncertain && response.status >= 200 && response.status < 300 ? parseDomesticTracking(response.data, remote.channel, remoteId) : null;
      if (!parsed) { failed = true; continue; }
      traces.push(...parsed.filter(parcel => (!number || parcel.trackingNumber === number) && (!trackingNumber || parcel.trackingNumber === trackingNumber)));
    }
  }));
  const result = [...new Map(traces.map((parcel, i) => [parcel.trackingNumber ?? `unknown-${i}`, parcel])).values()];
  return { ...base, trackingStatus: failed ? "unavailable" : result.some(parcel => parcel.events.length) ? "available" : "empty", packages: result };
}
