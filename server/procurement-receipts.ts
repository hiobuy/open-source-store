import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./db/client";
import { procurementItemPackages as links, procurementTrackingEvents as events } from "./db/schema";

/** Only warehouse-managed links follow a confirmed warehouse receipt. Manual corrections opt out. */
export async function syncProcurementReceipts(db: Database, packageId: string) {
  const rows = await db.select().from(links).where(and(eq(links.packageId, packageId), eq(links.active, true), eq(links.receiptSource, "fulfillment")));
  for (const row of rows) {
    if (row.receivedQuantity === row.allocatedQuantity) continue;
    const eventId = crypto.randomUUID(), now = Date.now();
    const guard = sql`EXISTS (SELECT 1 FROM procurement_item_packages l JOIN packages p ON p.id=l.package_id JOIN procurement_orders o ON o.id=l.order_id
      WHERE l.id=${row.id} AND l.active=1 AND l.receipt_source='fulfillment' AND l.received_quantity=${row.receivedQuantity}
      AND o.customer_id=p.user_id AND o.status='draft' AND p.hiobuy_package_id IS NOT NULL
      AND p.hiobuy_status IN ('RECEIVED','CONSOLIDATED','SHIPPED','DELIVERED'))`;
    await db.batch([
      db.insert(events).select(sql`SELECT ${eventId}, ${row.orderId}, ${row.itemId}, ${row.id}, NULL, 'fulfillment_arrival', 'Receipt confirmed by HioBuy fulfillment', ${row.receivedQuantity}, ${row.allocatedQuantity}, NULL, NULL, ${eventId}, 'system:fulfillment', ${now} WHERE ${guard}`),
      db.update(links).set({ receivedQuantity: row.allocatedQuantity, updatedAt: now }).where(and(eq(links.id, row.id), sql`EXISTS (SELECT 1 FROM procurement_tracking_events WHERE id=${eventId})`)),
    ]);
  }
}
