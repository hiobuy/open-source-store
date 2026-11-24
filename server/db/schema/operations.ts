import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { packages } from "./app";

// Merchant-side drafts only. They do not represent paid or fulfilled purchases.
export const procurementOrders = sqliteTable("procurement_orders", {
  id: text("id").primaryKey(),
  number: text("number").notNull().unique(),
  customerId: text("customer_id").notNull().references(() => user.id),
  platform: text("platform").notNull(),
  orderType: text("order_type", { enum: ["standard", "manual"] }).notNull().default("standard"),
  status: text("status", { enum: ["draft", "cancelled"] }).notNull().default("draft"),
  currency: text("currency").notNull().default("CNY"),
  goodsCents: integer("goods_cents").notNull(),
  shippingCents: integer("shipping_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  version: integer("version").notNull().default(1),
  mutationId: text("mutation_id"),
  requestHash: text("request_hash").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, t => [index("procurement_orders_created").on(t.createdAt, t.id), index("procurement_orders_status_created").on(t.status, t.createdAt), index("procurement_orders_customer").on(t.customerId), check("procurement_totals", sql`${t.goodsCents} >= 0 AND ${t.shippingCents} >= 0 AND ${t.totalCents} = ${t.goodsCents} + ${t.shippingCents}`)]);

export const procurementItems = sqliteTable("procurement_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => procurementOrders.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  name: text("name").notNull(),
  sku: text("sku").notNull(),
  productSnapshot: text("product_snapshot"),
  quantity: integer("quantity").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
}, t => [uniqueIndex("procurement_items_position").on(t.orderId, t.position), check("procurement_item_amount", sql`${t.quantity} > 0 AND ${t.unitPriceCents} > 0`)]);

export const procurementNotes = sqliteTable("procurement_notes", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => procurementOrders.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  kind: text("kind", { enum: ["internal", "resolution"] }).notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at").notNull(),
}, t => [index("procurement_notes_order").on(t.orderId, t.createdAt)]);

const marketingColumns = () => ({
  id: text("id").primaryKey(), name: text("name").notNull(), code: text("code").notNull().unique(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  from: text("starts_on").notNull(), to: text("ends_on").notNull(),
  version: integer("version").notNull().default(1), requestHash: text("request_hash").notNull(),
  mutationId: text("mutation_id").notNull(), createdBy: text("created_by").notNull(),
  createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
});
export const marketingCoupons = sqliteTable("marketing_coupons", {
  ...marketingColumns(), currency: text("currency").notNull(),
  kind: text("kind", { enum: ["percent", "fixed"] }).notNull(),
  discountValue: integer("discount_value").notNull(), // basis points for percent; minor currency units for fixed
  minimumCents: integer("minimum_cents").notNull(), usageLimit: integer("usage_limit").notNull(),
}, t => [index("marketing_coupons_created").on(t.createdAt, t.id), index("marketing_coupons_validity").on(t.enabled, t.from, t.to), check("marketing_coupon_amount", sql`${t.discountValue} > 0 AND (${t.kind} != 'percent' OR ${t.discountValue} <= 10000) AND ${t.minimumCents} >= 0 AND ${t.usageLimit} > 0`)]);
export const marketingCampaigns = sqliteTable("marketing_campaigns", {
  ...marketingColumns(), channel: text("channel").notNull(),
}, t => [index("marketing_campaigns_created").on(t.createdAt, t.id), index("marketing_campaigns_validity").on(t.enabled, t.from, t.to)]);

// Independent of freight pricing. No default exchange rate is assumed.
export const productPricing = sqliteTable("product_pricing", {
  id: text("id").primaryKey(), currency: text("currency").notNull(),
  markupBps: integer("markup_bps").notNull(), fixedCnyCents: integer("fixed_cny_cents").notNull(),
  serviceBps: integer("service_bps").notNull(), serviceCnyCents: integer("service_cny_cents").notNull(),
  cnyPerCurrencyE4: integer("cny_per_currency_e4").notNull(),
  version: integer("version").notNull(), mutationId: text("mutation_id").notNull(),
  updatedAt: integer("updated_at").notNull(), updatedBy: text("updated_by").notNull(),
});
export const procurementBills = sqliteTable("procurement_bills", {
  id: text("id").primaryKey(), orderId: text("order_id").notNull().references(() => procurementOrders.id),
  customerId: text("customer_id").notNull().references(() => user.id),
  status: text("status", { enum: ["issued", "void", "paid"] }).notNull().default("issued"),
  currency: text("currency").notNull(), goodsCents: integer("goods_cents").notNull(),
  serviceCents: integer("service_cents").notNull(), shippingCents: integer("shipping_cents").notNull(),
  discountCents: integer("discount_cents").notNull().default(0), totalCents: integer("total_cents").notNull(),
  snapshot: text("snapshot").notNull(), requestHash: text("request_hash").notNull(),
  version: integer("version").notNull().default(1), createdBy: text("created_by").notNull(),
  createdAt: integer("created_at").notNull(), voidReason: text("void_reason"), paidAt: integer("paid_at"),
  paidCents: integer("paid_cents").notNull().default(0),
}, t => [uniqueIndex("procurement_bill_active").on(t.orderId).where(sql`${t.status} != 'void'`), index("procurement_bills_customer").on(t.customerId, t.createdAt), check("procurement_bill_total", sql`${t.totalCents} >= 0 AND ${t.totalCents} = ${t.goodsCents} + ${t.serviceCents} + ${t.shippingCents} - ${t.discountCents}`)]);

// Merchant reconciliation only: never updates warehouse package lifecycle or locks.
export const procurementItemPackages = sqliteTable("procurement_item_packages", {
  id: text("id").primaryKey(), orderId: text("order_id").notNull().references(() => procurementOrders.id),
  itemId: text("item_id").notNull().references(() => procurementItems.id),
  packageId: text("package_id").notNull().references(() => packages.id),
  allocatedQuantity: integer("allocated_quantity").notNull(), receivedQuantity: integer("received_quantity").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
  receiptSource: text("receipt_source", { enum: ["manual", "fulfillment"] }).notNull().default("manual"),
}, t => [uniqueIndex("procurement_link_active").on(t.itemId, t.packageId).where(sql`${t.active} = 1`), index("procurement_links_order").on(t.orderId, t.createdAt, t.id), index("procurement_links_package").on(t.packageId), check("procurement_link_quantity", sql`${t.allocatedQuantity} > 0 AND ${t.receivedQuantity} >= 0 AND ${t.receivedQuantity} <= ${t.allocatedQuantity}`)]);

export const procurementAftersales = sqliteTable("procurement_aftersales", {
  id: text("id").primaryKey(), orderId: text("order_id").notNull().references(() => procurementOrders.id),
  itemId: text("item_id").notNull().references(() => procurementItems.id),
  linkId: text("link_id").references(() => procurementItemPackages.id),
  kind: text("kind", { enum: ["missing", "damaged", "wrong_item", "return", "other"] }).notNull(),
  quantity: integer("quantity").notNull(),
  status: text("status", { enum: ["open", "in_progress", "resolved", "cancelled"] }).notNull().default("open"),
  reason: text("reason").notNull(), resolution: text("resolution"),
  createdBy: text("created_by").notNull(), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, t => [index("procurement_aftersales_order").on(t.orderId, t.createdAt, t.id), index("procurement_aftersales_item_status").on(t.itemId, t.status), index("procurement_aftersales_link").on(t.linkId), check("procurement_aftersale_quantity", sql`${t.quantity} > 0`)]);

// Immutable receipt corrections and aftersales history; id is also the command idempotency key.
export const procurementTrackingEvents = sqliteTable("procurement_tracking_events", {
  id: text("id").primaryKey(), orderId: text("order_id").notNull().references(() => procurementOrders.id),
  itemId: text("item_id").notNull().references(() => procurementItems.id),
  linkId: text("link_id").references(() => procurementItemPackages.id),
  caseId: text("case_id").references(() => procurementAftersales.id),
  action: text("action").notNull(), note: text("note").notNull(),
  beforeQuantity: integer("before_quantity"), afterQuantity: integer("after_quantity"),
  fromStatus: text("from_status"), toStatus: text("to_status"),
  requestHash: text("request_hash").notNull(), createdBy: text("created_by").notNull(), createdAt: integer("created_at").notNull(),
}, t => [index("procurement_tracking_order").on(t.orderId, t.createdAt, t.id)]);
