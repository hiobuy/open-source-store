import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const announcements=sqliteTable("announcements",{
  id:text("id").primaryKey(),translations:text("translations").notNull(),
  status:text("status",{enum:["draft","published","archived"]}).notNull().default("draft"),
  pinned:integer("pinned",{mode:"boolean"}).notNull().default(false),
  version:integer("version").notNull().default(1),publishedAt:integer("published_at"),
  createdAt:integer("created_at").notNull(),updatedAt:integer("updated_at").notNull(),
  mutationId:text("mutation_id").notNull(),
},t=>[index("announcements_public_order").on(t.status,t.pinned,t.publishedAt,t.id)]);
