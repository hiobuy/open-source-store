import { index, integer, sqliteTable, text, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export const productCategories = sqliteTable("product_categories", {
  id: text("id").primaryKey(), names: text("names").notNull(), icon: text("icon"),
  parentId: text("parent_id").references((): AnySQLiteColumn => productCategories.id),
  keyword: text("keyword").notNull(),
  sortOrder: integer("sort_order").notNull().default(0), enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  version: integer("version").notNull().default(1), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, t => [index("product_categories_parent_sort").on(t.parentId, t.sortOrder, t.id), index("product_categories_enabled_sort").on(t.enabled, t.sortOrder, t.id)]);
