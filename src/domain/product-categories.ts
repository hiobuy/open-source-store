import { z } from "zod";
import { localeCatalog, matchNavigatorLocale } from "./locale";

const localeCode = z.enum(localeCatalog.map(l => l.code));
const label = z.string().trim().min(1).max(100);
export const categoryNames = z.partialRecord(localeCode, label).refine(v => !!v.en, "An English fallback name is required.");
export const categoryIcon = z.discriminatedUnion("type", [
  z.object({ type: z.literal("name"), value: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/) }).strict(),
  z.object({ type: z.literal("url"), value: z.string().url().max(2000).refine(value => {
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
  }, "Use an HTTPS image URL without credentials.") }).strict(),
]).nullable();
export const categoryInput = z.object({
  names: categoryNames, icon: categoryIcon, parentId: z.string().uuid().nullable().default(null),
  keyword: z.string().trim().min(1).max(120), sortOrder: z.number().int().min(0).max(999999),
  enabled: z.boolean(), version: z.number().int().min(0),
}).strict();
export const categoryQuery = z.object({
  locale: z.string().trim().min(1).max(35).optional(), parentId: z.union([z.literal("root"), z.string().uuid()]).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
export const categoryDeleteInput = z.object({ version: z.number().int().positive() }).strict();
export function localizedCategoryName(names: Record<string, string>, requested: string | undefined, fallback: string) {
  const matched = requested ? matchNavigatorLocale(requested, localeCatalog.map(l => l.code)) : null;
  const locale = [matched, fallback, "en"].find(code => code && names[code]) ?? "en";
  return { name: names[locale], locale };
}
export const categoryImportInput = z.object({
  items: z.array(categoryInput.omit({ version: true }).extend({ id: z.string().uuid() }).strict()).min(1).max(100),
}).strict().refine(v => new Set(v.items.map(i => i.id)).size === v.items.length, "Duplicate category IDs.");
export type CategoryForm = z.infer<typeof categoryInput>;
export type CategoryRecord = CategoryForm & { id: string; createdAt: number; updatedAt: number };
