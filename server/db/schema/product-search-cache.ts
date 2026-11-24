import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const productSearchSettings = sqliteTable("product_search_settings", {
  id: text("id").primaryKey(),
  ttlSeconds: integer("ttl_seconds").notNull().default(300),
  generation: text("generation").notNull().default("initial"),
  updatedAt: integer("updated_at").notNull(),
});
export const productSearchCache = sqliteTable("product_search_cache", {
  key: text("key").primaryKey(),
  result: text("result").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, t => [index("product_search_cache_expiry").on(t.expiresAt)]);
