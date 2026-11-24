import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "./db/client";
import { productSearchCache, productSearchSettings } from "./db/schema";
import { singletonRow, SINGLETON_ID } from "./db/singleton";
import { productSearchInput } from "../src/domain/product-search";
import { parseInput } from "./operations-input";
import { readProductDisplayPolicy } from "./product-billing";
import { queryProducts } from "./purchase-products";

export const searchCacheSettingsInput = z.object({ ttlSeconds: z.number().int().min(0).max(86400) }).strict();
export async function readSearchCacheSettings(db: Database) {
  const row = await singletonRow(db, productSearchSettings);
  return { ttlSeconds: row.ttlSeconds, generation: row.generation };
}
export async function saveSearchCacheSettings(db: Database, raw: unknown) {
  const input = parseInput(searchCacheSettingsInput, raw);
  const values = { ...input, generation: crypto.randomUUID(), updatedAt: Date.now() };
  // The new generation also invalidates writes from searches already in flight.
  await db.batch([
    db.insert(productSearchSettings).values({ id: SINGLETON_ID, ...values }).onConflictDoUpdate({ target: productSearchSettings.id, set: values }),
    db.delete(productSearchCache),
  ]);
  return { ttlSeconds: values.ttlSeconds, generation: values.generation };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
async function cacheKey(token: string, generation: string, input: unknown, markup: readonly number[] | null) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical({ version: 2, token: token.trim(), generation, input, markup }))));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}

export async function cachedProductSearch(db: Database, token: string, raw: unknown) {
  const input = parseInput(productSearchInput, raw);
  const [settings, policy] = await Promise.all([readSearchCacheSettings(db).catch(() => null), readProductDisplayPolicy(db)]);
  if (!settings?.ttlSeconds) return queryProducts(token, "search", input, policy);
  const key = await cacheKey(token, settings.generation, input, policy ? [policy.markupBps, policy.fixedCnyCents] : null);
  try {
    const row = (await db.select().from(productSearchCache).where(and(eq(productSearchCache.key, key), gt(productSearchCache.expiresAt, Date.now()))))[0];
    if (row) {
      const result = JSON.parse(row.result) as Awaited<ReturnType<typeof queryProducts>>;
      if ("items" in result && Array.isArray(result.items)) return result;
    }
  } catch { /* Cache storage failure must not prevent a real search. */ }
  const result = await queryProducts(token, "search", input, policy);
  const serialized = JSON.stringify(result);
  // Cache only the customer-safe DTO, never raw upstream data or credentials.
  if (new TextEncoder().encode(serialized).length <= 512 * 1024) {
    const values = { result: serialized, expiresAt: Date.now() + settings.ttlSeconds * 1000 };
    await db.insert(productSearchCache).values({ key, ...values }).onConflictDoUpdate({ target: productSearchCache.key, set: values }).catch(() => undefined);
  }
  return result;
}

export async function cleanupProductSearchCache(db: Database) {
  await db.delete(productSearchCache).where(sql`${productSearchCache.key} IN (SELECT key FROM product_search_cache WHERE expires_at <= ${Date.now()} ORDER BY expires_at LIMIT 500)`);
}
