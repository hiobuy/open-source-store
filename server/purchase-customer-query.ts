import { and, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "./db/client";
import { procurementOrders } from "./db/schema";
import { listInput, parseInput } from "./operations-input";
import { procurementStage } from "./procurement-overview";

export const purchaseStages = ["awaiting_payment", "pending", "buying", "transit", "partial", "stocked", "packed", "shipped", "exception", "after", "cancelled"] as const;
export const customerPurchaseListInput = listInput.extend({
  status: z.enum(["", ...purchaseStages, "awaiting_receipt"]).default(""),
});
export const cancelPurchaseInput = z.object({ confirm: z.literal(true), reason: z.string().trim().min(1).max(500) }).strict();

// This same predicate is used for presentation and the atomic cancellation write.
export const customerCanCancel = sql<boolean>`(
 procurement_orders.status='draft'
 AND NOT EXISTS (SELECT 1 FROM purchase_stripe_payments WHERE order_id=procurement_orders.id AND state IN ('pending','review'))
 AND NOT EXISTS (SELECT 1 FROM procurement_bills WHERE order_id=procurement_orders.id AND (status='paid' OR paid_cents>0))
 AND NOT EXISTS (SELECT 1 FROM procurement_remote WHERE order_id=procurement_orders.id AND (state!='ready' OR remote_id IS NOT NULL OR payment_status!='unpaid'))
 AND NOT EXISTS (SELECT 1 FROM purchase_attempts WHERE order_id=procurement_orders.id)
 AND NOT EXISTS (SELECT 1 FROM procurement_item_packages WHERE order_id=procurement_orders.id AND active=1)
 AND NOT EXISTS (SELECT 1 FROM procurement_aftersales WHERE order_id=procurement_orders.id AND status IN ('open','in_progress'))
)`.mapWith(Boolean);

export function customerPurchaseWhere(customerId: string, q: string, status = "") {
  // Literal substring matching: '%' and '_' are not user-controlled wildcards.
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  return and(eq(procurementOrders.customerId, customerId), q ? sql`(
    ${procurementOrders.number} LIKE ${pattern} ESCAPE '\\'
    OR ${procurementOrders.id} LIKE ${pattern} ESCAPE '\\'
    OR EXISTS (SELECT 1 FROM procurement_items i WHERE i.order_id=procurement_orders.id AND (i.name LIKE ${pattern} ESCAPE '\\' OR i.sku LIKE ${pattern} ESCAPE '\\'))
  )` : undefined, status ? status === "awaiting_receipt" ? sql`${procurementStage} IN ('transit','partial')` : eq(procurementStage, status) : undefined);
}

export async function customerPurchaseCounts(db: Database, customerId: string, raw: unknown) {
  const input = parseInput(customerPurchaseListInput, raw);
  const rows = await db.select({ stage: procurementStage, n: count() }).from(procurementOrders)
    .where(customerPurchaseWhere(customerId, input.q)).groupBy(procurementStage);
  const counts: Record<string, number> = Object.fromEntries(purchaseStages.map(stage => [stage, 0]));
  for (const row of rows) counts[row.stage] = row.n;
  counts.all = rows.reduce((sum, row) => sum + row.n, 0);
  counts.awaiting_receipt = counts.transit + counts.partial;
  return counts;
}
