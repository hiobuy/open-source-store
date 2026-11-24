import { integer, sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core";
export const exchangeRates = sqliteTable("exchange_rates", {
  currency: text("currency").primaryKey(), cnyPerUnitE4: integer("cny_per_unit_e4").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(), version: integer("version").notNull(),
  mutationId: text("mutation_id").notNull(), source: text("source").notNull(),
  updatedAt: integer("updated_at").notNull(), updatedBy: text("updated_by").notNull(),
});
export const exchangeRateHistory = sqliteTable("exchange_rate_history", {
  currency: text("currency").notNull(), version: integer("version").notNull(),
  cnyPerUnitE4: integer("cny_per_unit_e4").notNull(), enabled: integer("enabled", { mode: "boolean" }).notNull(),
  source: text("source").notNull(), updatedAt: integer("updated_at").notNull(), updatedBy: text("updated_by").notNull(),
}, t => [primaryKey({ columns: [t.currency, t.version] })]);
