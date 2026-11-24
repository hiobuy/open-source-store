import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./db/client";
import { auditLogs, procurementBills, procurementOrders, purchaseCouponRedemptions } from "./db/schema";
import { AppError } from "./errors";
import { parseInput } from "./operations-input";
import { customerPurchase } from "./purchase";
import { cancelPurchaseInput, customerCanCancel } from "./purchase-customer-query";

export async function cancelCustomerPurchase(db: Database, actor: { id: string; email: string }, id: string, raw: unknown) {
  const input = parseInput(cancelPurchaseInput, raw);
  const current = await customerPurchase(db, actor.id, id);
  if (current.status === "cancelled") return current;
  const mutationId = crypto.randomUUID(), now = Date.now();
  // D1 batch serializes cancellation against payment and remote submission claims.
  // Every dependent write is guarded by this request's unique mutation token.
  const claimed = sql`EXISTS (SELECT 1 FROM procurement_orders WHERE id=${id} AND customer_id=${actor.id} AND status='cancelled' AND mutation_id=${mutationId})`;
  await db.batch([
    db.update(procurementOrders).set({ status: "cancelled", mutationId, version: sql`${procurementOrders.version}+1`, updatedAt: now })
      .where(and(eq(procurementOrders.id, id), eq(procurementOrders.customerId, actor.id), customerCanCancel)),
    db.update(procurementBills).set({ status: "void", voidReason: input.reason, version: sql`${procurementBills.version}+1` })
      .where(and(eq(procurementBills.orderId, id), eq(procurementBills.customerId, actor.id), eq(procurementBills.status, "issued"), claimed)),
    db.update(purchaseCouponRedemptions).set({state:"released",updatedAt:now}).where(and(eq(purchaseCouponRedemptions.orderId,id),eq(purchaseCouponRedemptions.state,"reserved"),claimed)),
    db.insert(auditLogs).select(sql`SELECT ${mutationId},${actor.id},${actor.email},'procurement.customer.cancel',${id},${JSON.stringify({ reason: input.reason })},${now} WHERE ${claimed}`),
  ]);
  const result = await customerPurchase(db, actor.id, id);
  if (result.status !== "cancelled") throw new AppError("PURCHASE_CONFLICT", "Only unpaid orders that have not entered procurement can be cancelled. Contact support for paid or submitted orders.", 409);
  return result;
}
