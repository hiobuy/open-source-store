import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { shipments } from "./app";

/** Confirmed HioBuy event times, independent of local status-pull timestamps. */
export const shipmentMilestones = sqliteTable("shipment_milestones", {
  shipmentId: text("shipment_id").primaryKey().references(() => shipments.id, { onDelete: "cascade" }),
  packedAt: integer("packed_at"),
  hiobuyPaidAt: integer("hiobuy_paid_at"),
  shippedAt: integer("shipped_at"),
});
