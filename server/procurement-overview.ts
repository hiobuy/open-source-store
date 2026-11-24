import { procurementProfitCnyCents } from "../src/domain/procurement-profit";
import { purchaseAmountMetadata } from "../src/domain/purchase-amounts";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./db/client";
import { packages, procurementBills, procurementItemPackages, procurementOrders, procurementRemote } from "./db/schema";

// Read-only projections: do not overwrite local, warehouse or payment state.
export const orderedQuantity = sql<number>`COALESCE((SELECT SUM(quantity) FROM procurement_items WHERE order_id=procurement_orders.id),0)`.mapWith(Number);
export const receivedQuantity = sql<number>`COALESCE((SELECT SUM(received_quantity) FROM procurement_item_packages WHERE order_id=procurement_orders.id AND active=1),0)`.mapWith(Number);
export const openCases = sql<number>`(SELECT COUNT(*) FROM procurement_aftersales WHERE order_id=procurement_orders.id AND status IN ('open','in_progress'))`.mapWith(Number);
const remoteState = sql`(SELECT state FROM procurement_remote WHERE order_id=procurement_orders.id)`;
export const customerPayment = sql<string>`COALESCE((SELECT status FROM procurement_bills WHERE order_id=procurement_orders.id AND status!='void'),'unbilled')`;
const shippedQuantity = sql`COALESCE((SELECT SUM(l.received_quantity) FROM procurement_item_packages l JOIN packages p ON p.id=l.package_id WHERE l.order_id=procurement_orders.id AND l.active=1 AND p.package_status IN ('SHIPPED','DELIVERED')),0)`;
const packedQuantity = sql`COALESCE((SELECT SUM(l.received_quantity) FROM procurement_item_packages l JOIN packages p ON p.id=l.package_id WHERE l.order_id=procurement_orders.id AND l.active=1 AND p.package_status IN ('CONSOLIDATED','SHIPPED','DELIVERED')),0)`;
export const procurementStage = sql<string>`CASE
 WHEN procurement_orders.status='cancelled' OR ${remoteState}='cancelled' THEN 'cancelled'
 WHEN ${openCases}>0 THEN 'after'
 WHEN ${remoteState} IN ('unknown','review_required','cancel_pending') OR EXISTS(SELECT 1 FROM procurement_remote r WHERE r.order_id=procurement_orders.id AND r.state IN ('creating','paying') AND r.updated_at < CAST(strftime('%s','now') AS INTEGER)*1000-60000)
   OR EXISTS(SELECT 1 FROM procurement_item_packages l JOIN packages p ON p.id=l.package_id WHERE l.order_id=procurement_orders.id AND l.active=1 AND (p.condition_status='EXCEPTION' OR p.exception_status='ACTION_REQUIRED')) THEN 'exception'
 WHEN ${orderedQuantity}>0 AND ${shippedQuantity}>=${orderedQuantity} THEN 'shipped'
 WHEN ${orderedQuantity}>0 AND ${packedQuantity}>=${orderedQuantity} THEN 'packed'
 WHEN ${orderedQuantity}>0 AND ${receivedQuantity}>=${orderedQuantity} THEN 'stocked'
 WHEN ${receivedQuantity}>0 THEN 'partial'
 WHEN EXISTS(SELECT 1 FROM procurement_remote r WHERE r.order_id=procurement_orders.id AND LOWER(r.remote_status) IN ('wait_receive','wait_buyer_confirm_goods','waitbuyerreceive','wait_buyer_receive_goods','seller_sent','shipped')) THEN 'transit'
 WHEN ${customerPayment}='issued' THEN 'awaiting_payment'
 WHEN ${remoteState} IN ('created','creating','paying') THEN 'buying'
 WHEN ${customerPayment}='paid' THEN 'pending'
 ELSE 'awaiting_payment' END`;

export async function procurementOverviews(db: Database, ids: string[], includeProfit = false) {
  if (!ids.length) return [];
  const rows = await db.select({ orderId: procurementOrders.id, stage: procurementStage, ordered: orderedQuantity, received: receivedQuantity, openCases,
    payment: customerPayment, billId: procurementBills.id, billCurrency: procurementBills.currency, billPaidCents:procurementBills.paidCents,billTotalCents: procurementBills.totalCents, billGoodsCents:procurementBills.goodsCents, billShippingCents:procurementBills.shippingCents, billServiceCents:procurementBills.serviceCents, billDiscountCents:procurementBills.discountCents,
    paidCostCnyCents:procurementRemote.paidCostCnyCents, procurementPayment:procurementRemote.paymentStatus, estimatedCostCnyCents:sql<number>`CASE WHEN ${procurementOrders.orderType}='manual' AND ${procurementRemote.remoteId} IS NULL THEN ${procurementOrders.totalCents} ELSE COALESCE(${procurementRemote.costCnyCents}, ${procurementOrders.totalCents}) END`.mapWith(Number),
    billSnapshot:procurementBills.snapshot, remoteId: procurementRemote.remoteId, remoteStatus: procurementRemote.remoteStatus,
  }).from(procurementOrders).leftJoin(procurementBills, and(eq(procurementBills.orderId,procurementOrders.id),sql`${procurementBills.status}!='void'`))
    .leftJoin(procurementRemote,eq(procurementRemote.orderId,procurementOrders.id)).where(inArray(procurementOrders.id,ids));
  const links=await db.select({orderId:procurementItemPackages.orderId,id:packages.id,publicId:packages.publicId,tracking:packages.domesticTrackingNumber,status:packages.packageStatus})
    .from(procurementItemPackages).innerJoin(packages,eq(packages.id,procurementItemPackages.packageId)).where(and(inArray(procurementItemPackages.orderId,ids),eq(procurementItemPackages.active,true)));
  return rows.map(({billSnapshot,...row})=>({...row,...(includeProfit?{profitCnyCents:row.procurementPayment==="paid"?procurementProfitCnyCents(row.paidCostCnyCents,row.payment,row.billPaidCents,row.billCurrency,billSnapshot):null}:{}),amountMetadata:purchaseAmountMetadata(billSnapshot,row.billTotalCents,row.billDiscountCents),packages:[...new Map(links.filter(l=>l.orderId===row.orderId).map(l=>[l.id,{id:l.id,publicId:l.publicId,tracking:l.tracking,status:l.status}])).values()]}));
}
