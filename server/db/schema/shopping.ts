import { sql } from "drizzle-orm";
import { primaryKey, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

/** One physical cart table; composite identity preserves IDs from both legacy tables. */
export const cartItems = sqliteTable("cart_items", {
  id: text("id").notNull(), type: text("type", {enum:["standard","manual"]}).notNull().default("standard"),
  customerId: text("customer_id").notNull().references(() => user.id),
  channel: text("channel").notNull().default(""), productId: text("product_id").notNull().default(""), skuId: text("sku_id").notNull().default(""),
  quantity: integer("quantity").notNull().default(0), product: text("product").notNull().default("{}"),
  payload: text("payload").notNull().default("{}"), initialPayload: text("initial_payload").notNull().default("{}"),
  orderId: text("order_id").unique(),
  state: text("state", {enum:["draft","submitting","submitted","removed"]}).notNull().default("draft"),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, t => [primaryKey({columns:[t.id,t.type]}), uniqueIndex("cart_item_identity").on(t.customerId,t.channel,t.productId,t.skuId).where(sql`${t.type}='standard'`), index("cart_customer_updated").on(t.customerId,t.updatedAt,t.id), index("cart_customer_type_state").on(t.customerId,t.type,t.state)]);
export const productFavorites = sqliteTable("product_favorites", {
  id: text("id").primaryKey(), customerId: text("customer_id").notNull().references(() => user.id),
  channel: text("channel").notNull(), productId: text("product_id").notNull(), product: text("product").notNull(),
  createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, t => [uniqueIndex("favorite_identity").on(t.customerId, t.channel, t.productId), index("favorites_customer_updated").on(t.customerId, t.updatedAt, t.id)]);
