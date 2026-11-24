import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { Database } from "./db/client";
import { shipmentMilestones } from "./db/schema";
import { readShipmentMilestones } from "../src/domain/shipment-milestones";

export async function storeShipmentMilestones(db: Database, shipmentId: string, payload: unknown) {
  const times = readShipmentMilestones(payload);
  if (Object.values(times).every(at => at == null)) return;
  // Retries and partial/older payloads cannot erase a known event or move it later.
  const earliest = (column: AnySQLiteColumn, at: number | null) => at == null ? column : sql`min(coalesce(${column}, ${at}), ${at})`;
  await db.insert(shipmentMilestones).values({ shipmentId, ...times }).onConflictDoUpdate({ target: shipmentMilestones.shipmentId, set: {
    packedAt: earliest(shipmentMilestones.packedAt, times.packedAt),
    hiobuyPaidAt: earliest(shipmentMilestones.hiobuyPaidAt, times.hiobuyPaidAt),
    shippedAt: earliest(shipmentMilestones.shippedAt, times.shippedAt),
  } });
}
