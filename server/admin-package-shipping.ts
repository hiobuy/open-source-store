import { and, eq, inArray, ne } from "drizzle-orm";
import type { Database } from "./db/client";
import { packages, shipmentPackages, shipments } from "./db/schema";
import { shipmentListTimes } from "./admin-shipment-view";

/** Only a unique, non-cancelled shipment can supply package dispatch information. */
export async function packageShipping(db: Database, ids: string[]) {
  const result = new Map<string, { readyToShip: boolean; packedAt: string | null; shippedAt: string | null }>();
  if (!ids.length) return result;
  if (ids.length > 80) {
    for (let i = 0; i < ids.length; i += 80) for (const [id, value] of await packageShipping(db, ids.slice(i, i + 80))) result.set(id, value);
    return result;
  }
  const rows = await db.select({ packageId: packages.id, shipmentId: shipments.id, status: shipments.status, remote: shipments.upstreamStatus })
    .from(shipmentPackages).innerJoin(packages, eq(packages.id, shipmentPackages.packageId))
    .innerJoin(shipments, and(eq(shipments.id, shipmentPackages.shipmentId), eq(shipments.userId, packages.userId)))
    .where(and(inArray(packages.id, ids), ne(shipments.status, "CANCELLED")));
  const times = await shipmentListTimes(db, [...new Set(rows.map(row => row.shipmentId))]);
  for (const row of rows) {
    if (rows.filter(other => other.packageId === row.packageId).length !== 1) continue;
    const time = times.get(row.shipmentId);
    result.set(row.packageId, { readyToShip: row.status === "READY_TO_SHIP" && row.remote === "WAIT_SHIP", packedAt: time?.packedAt ?? null, shippedAt: time?.shippedAt ?? null });
  }
  return result;
}
