import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { procurementOrders, procurementItems, marketingCoupons, procurementBills } from "./operations";

export const purchaseOrderDetails = sqliteTable("purchase_order_details", {
  orderId: text("order_id").primaryKey().references(() => procurementOrders.id),
  remark: text("remark").notNull().default(""),
  requestHash: text("request_hash").notNull(),
});
export const purchaseItemDetails = sqliteTable("purchase_item_details", {
  itemId: text("item_id").primaryKey().references(() => procurementItems.id),
  orderId: text("order_id").notNull().references(() => procurementOrders.id),
  remark: text("remark").notNull().default(""),
}, t => [index("purchase_item_details_order").on(t.orderId)]);
export const purchaseOrderAttachments = sqliteTable("purchase_order_attachments", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => procurementOrders.id),
  itemId: text("item_id").references(() => procurementItems.id),
  sourceUploadId: text("source_upload_id").notNull(),
  objectKey: text("object_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: integer("created_at").notNull(),
}, t => [index("purchase_attachments_order").on(t.orderId)]);
export const purchaseCouponRedemptions = sqliteTable("purchase_coupon_redemptions", {
  orderId: text("order_id").primaryKey().references(() => procurementOrders.id),
  billId: text("bill_id").notNull().references(() => procurementBills.id),
  couponId: text("coupon_id").notNull().references(() => marketingCoupons.id),
  code: text("code").notNull(),
  currency: text("currency").notNull(),
  discountCents: integer("discount_cents").notNull(),
  state: text("state", { enum: ["reserved", "redeemed", "released"] }).notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, t => [index("purchase_coupon_usage").on(t.couponId, t.state)]);
