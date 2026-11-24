import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { procurementOrders } from "./operations";
export const purchaseQuotes = sqliteTable("purchase_quotes", {
  id: text("id").primaryKey(), customerId: text("customer_id").notNull().references(()=>user.id),
  channel: text("channel").notNull(), request: text("request").notNull(), preview: text("preview").notNull(), pricing: text("pricing").notNull(),
  costCnyCents: integer("cost_cny_cents").notNull(), createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at").notNull(),
}, t=>[index("purchase_quotes_customer").on(t.customerId,t.createdAt)]);
export const procurementRemote = sqliteTable("procurement_remote", {
  orderId: text("order_id").primaryKey().references(()=>procurementOrders.id), quoteId: text("quote_id").notNull().unique().references(()=>purchaseQuotes.id),
  channel: text("channel").notNull(), remoteId: text("remote_id"), state: text("state").notNull().default("ready"),
  paidCostCnyCents: integer("paid_cost_cny_cents"),
  remoteStatus: text("remote_status"), paymentStatus: text("payment_status").notNull().default("unpaid"),
  costCnyCents: integer("cost_cny_cents").notNull(), lastResult: text("last_result"), updatedAt: integer("updated_at").notNull(),
  syncNextAt: integer("sync_next_at").default(0), syncLockedUntil: integer("sync_locked_until"), syncLockToken: text("sync_lock_token"),
  syncFailures: integer("sync_failures").notNull().default(0), syncErrorCode: text("sync_error_code"),
}, t=>[uniqueIndex("procurement_remote_identity").on(t.channel,t.remoteId), index("procurement_remote_sync_due").on(t.syncNextAt,t.syncLockedUntil)]);
export const purchaseAttempts = sqliteTable("purchase_attempts", {
  id: text("id").primaryKey(), orderId: text("order_id").notNull().references(()=>procurementOrders.id), action: text("action").notNull(),
  state: text("state").notNull(), request: text("request").notNull(), result: text("result"), actorId: text("actor_id").notNull(),
  createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, t=>[uniqueIndex("purchase_attempt_once").on(t.orderId,t.action)]);
