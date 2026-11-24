import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const cartPreviews = sqliteTable("cart_previews", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull().references(() => user.id),
  selection: text("selection").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, t => [index("cart_previews_customer").on(t.customerId, t.createdAt)]);

/** Per-order snapshots avoid a single oversized D1 row for 50 multi-line manual forms. */
export const cartPreviewGroups = sqliteTable("cart_preview_groups", {
  id: text("id").primaryKey(),
  previewId: text("preview_id").notNull().references(() => cartPreviews.id),
  position: integer("position").notNull(),
  payload: text("payload").notNull(),
}, t => [uniqueIndex("cart_preview_groups_position").on(t.previewId, t.position)]);

/** One committed result per preview, written in the same transaction as every child order. */
export const cartCheckouts = sqliteTable("cart_checkouts", {
  id: text("id").primaryKey(),
  previewId: text("preview_id").notNull().unique().references(() => cartPreviews.id),
  customerId: text("customer_id").notNull().references(() => user.id),
  result: text("result").notNull(),
  createdAt: integer("created_at").notNull(),
}, t => [index("cart_checkouts_customer").on(t.customerId, t.createdAt)]);
