import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { categoryImportInput, categoryDeleteInput, categoryInput, categoryQuery, localizedCategoryName } from "../src/domain/product-categories";
import type { Database } from "./db/client";
import { productCategories } from "./db/schema";
import { AppError } from "./errors";
import { publicLocale } from "./locale";
import { parseInput } from "./operations-input";

function adminView(row: typeof productCategories.$inferSelect) {
  return { ...row, names: JSON.parse(row.names) as Record<string, string>, icon: JSON.parse(row.icon ?? "null") as z.infer<typeof categoryInput>["icon"] };
}
export async function listProductCategories(db: Database, raw: unknown, admin = false) {
  const pagination = admin ? parseInput(categoryQuery, raw) : null;
  // Legacy pagination parameters are ignored by the public endpoint.
  const input = pagination ?? parseInput(categoryQuery.pick({ locale: true, parentId: true }).strip(), raw);
  // Anchor recursion to the parent index: the enabled index otherwise scans all enabled rows per node.
  const visible = sql`${productCategories.id} IN (WITH RECURSIVE visible(id) AS (
    SELECT id FROM product_categories INDEXED BY product_categories_parent_sort WHERE parent_id IS NULL AND enabled = 1
    UNION ALL SELECT c.id FROM product_categories c INDEXED BY product_categories_parent_sort JOIN visible p ON c.parent_id = p.id WHERE c.enabled = 1
  ) SELECT id FROM visible)`;
  const where = and(admin ? undefined : visible, input.parentId === "root" ? isNull(productCategories.parentId) : input.parentId ? eq(productCategories.parentId, input.parentId) : undefined);
  const query = db.select().from(productCategories).where(where).orderBy(asc(productCategories.sortOrder), asc(productCategories.id));
  const rows = await (pagination ? query.limit(pagination.pageSize).offset((pagination.page - 1) * pagination.pageSize) : query);
  const total = pagination ? (await db.select({ value: count() }).from(productCategories).where(where))[0].value : rows.length;
  const { defaultLocale } = await publicLocale(db);
  return {
    items: rows.map(row => {
      const item = adminView(row);
      if (admin) return item;
      return { id: item.id, parentId: item.parentId, ...localizedCategoryName(item.names, input.locale, defaultLocale), icon: item.icon, keyword: item.keyword, sortOrder: item.sortOrder };
    }),
    total, ...(pagination ? { page: pagination.page, pageSize: pagination.pageSize } : {}),
  };
}
export async function saveProductCategory(db: Database, id: string, raw: unknown) {
  parseInput(z.string().uuid(), id);
  const input = parseInput(categoryInput, raw), now = Date.now();
  if (input.parentId === id) throw new AppError("CATEGORY_PARENT", "A category cannot be its own parent.", 409);
  const values = { parentId: input.parentId, names: JSON.stringify(input.names), icon: input.icon ? JSON.stringify(input.icon) : null, keyword: input.keyword, sortOrder: input.sortOrder, enabled: input.enabled, updatedAt: now };
  try {
  if (input.version === 0) {
    const [created] = await db.insert(productCategories).values({ ...values, id, createdAt: now }).onConflictDoNothing().returning();
    if (!created) throw new AppError("CATEGORY_CONFLICT", "Category already exists; reload before editing.", 409);
    return adminView(created);
  }
  const [updated] = await db.update(productCategories).set({ ...values, version: input.version + 1 })
    .where(and(eq(productCategories.id, id), eq(productCategories.version, input.version),
      sql`NOT EXISTS (WITH RECURSIVE ancestors(id, parent_id) AS (
        SELECT id, parent_id FROM product_categories WHERE id = ${input.parentId}
        UNION ALL SELECT p.id, p.parent_id FROM product_categories p JOIN ancestors a ON p.id = a.parent_id
      ) SELECT 1 FROM ancestors WHERE id = ${id})`)).returning();
  if (!updated) throw new AppError("CATEGORY_CONFLICT", "Category changed or was removed; reload before editing.", 409);
  return adminView(updated);
  } catch (error) { categoryConstraint(error); }
}
function categoryConstraint(error: unknown): never {
  const message = [error, error instanceof Error ? error.cause : null].map(e => e instanceof Error ? e.message : String(e)).join(" ");
  if (/FOREIGN KEY constraint failed/.test(message)) throw new AppError("CATEGORY_PARENT", "Parent does not exist, or this category still has children.", 409);
  throw error;
}
export async function deleteProductCategory(db: Database, id: string, raw: unknown) {
  parseInput(z.string().uuid(), id);
  const { version } = parseInput(categoryDeleteInput, raw);
  try {
  const [deleted] = await db.delete(productCategories).where(and(eq(productCategories.id, id), eq(productCategories.version, version))).returning({ id: productCategories.id });
  if (!deleted) throw new AppError("CATEGORY_CONFLICT", "Category changed or was removed; reload before deleting.", 409);
  return { ok: true };
  } catch (error) { categoryConstraint(error); }
}
export async function importProductCategories(db: Database, raw: unknown) {
  const { items } = parseInput(categoryImportInput, raw), now = Date.now();
  const pending = new Map(items.map(item => [item.id, item]));
  const ordered: typeof items = [];
  while (pending.size) {
    const ready = [...pending.values()].filter(item => !item.parentId || !pending.has(item.parentId));
    if (!ready.length) throw new AppError("CATEGORY_PARENT", "Imported categories contain a parent cycle.", 409);
    for (const item of ready) { ordered.push(item); pending.delete(item.id); }
  }
  const inserts = ordered.map(item => db.insert(productCategories).values({
    ...item, names: JSON.stringify(item.names), icon: item.icon ? JSON.stringify(item.icon) : null,
    version: 1, createdAt: now, updatedAt: now,
  }));
  try {
    // D1 batch is transactional: a conflicting ID rolls back the entire import.
    await db.batch(inserts as [typeof inserts[number], ...typeof inserts[number][]]);
  } catch (error) {
    const message = [error, error instanceof Error ? error.cause : null].map(e => e instanceof Error ? e.message : String(e)).join(" ");
    if (/UNIQUE constraint failed: product_categories.id/.test(message))
      throw new AppError("CATEGORY_CONFLICT", "An imported ID already exists. Nothing was imported.", 409);
    categoryConstraint(error);
  }
  return { imported: items.length };
}
