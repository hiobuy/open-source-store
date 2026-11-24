import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { procurementBills, procurementOrders } from "./operations";

// Durable claim exists before contacting Stripe. Unknown outcomes remain locked.
export const purchaseStripePayments = sqliteTable("purchase_stripe_payments", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => procurementOrders.id),
  billId: text("bill_id").notNull().references(() => procurementBills.id),
  userId: text("user_id").notNull(),
  billVersion: integer("bill_version").notNull(),
  paidBefore: integer("paid_before").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  state: text("state").notNull().default("pending"),
  sessionId: text("session_id"),
  url: text("url"),
  origin: text("origin").notNull(),
  createdAt: integer("created_at").notNull(),
  successUrl: text("success_url"),
  cancelUrl: text("cancel_url"),
}, t => [
  uniqueIndex("purchase_stripe_active_bill").on(t.billId).where(sql`${t.state} IN ('pending','review')`),
  uniqueIndex("purchase_stripe_session").on(t.sessionId),
  index("purchase_stripe_order").on(t.orderId),
]);
