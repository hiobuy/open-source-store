import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// A unique revision claim in the settings batch makes concurrent saves atomic.
export const paymentSettingsRevisions = sqliteTable("payment_settings_revisions", {
  revision: integer("revision").primaryKey(),
  createdAt: integer("created_at").notNull(),
});

// Written before the remote call so an interrupted registration can be retried.
export const stripeWebhookRegistrations = sqliteTable("stripe_webhook_registrations", {
  id: text("id").primaryKey(),
  endpointId: text("endpoint_id"),
  keyCiphertext: text("key_ciphertext"),
  secretCiphertext: text("secret_ciphertext"),
  url: text("url").notNull(),
  apiVersion: text("api_version").notNull(),
  mode: text("mode").notNull(),
  createdAt: integer("created_at").notNull(),
  retiredAt: integer("retired_at"),
  deletedAt: integer("deleted_at"),
}, t => [index("stripe_webhook_cleanup").on(t.retiredAt).where(sql`${t.deletedAt} IS NULL`)]);
