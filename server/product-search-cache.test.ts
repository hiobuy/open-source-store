import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { sql } from "drizzle-orm";
import { createDb, type Database } from "./db/client";
import { productPricing, productSearchCache, productSearchSettings } from "./db/schema";
import { cachedProductSearch, cleanupProductSearchCache, readSearchCacheSettings, saveSearchCacheSettings } from "./product-search-cache";
import { permissionFor } from "../src/domain/staff";

let mf: Miniflare, db: Database;
const base = { channel: "1688", keyword: "shirt" };
const fetcher = vi.fn(async () => Response.json({ items: [{ id: "p1", title: "shirt", price: { original_currency: "CNY", original_amount: 10 }, cost: 123, seller_secret: "private" }], page: 1, page_size: 20, total: 1 }));
beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "search-cache-test", modules: true, script: "export default {fetch(){return new Response('test')}}", d1Databases: ["DB"] }] }));
  const binding = await mf.getD1Database("DB");
  for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) {
    await binding.batch(readFileSync(`drizzle/${file}`, "utf8").split(";").map(s => s.replaceAll("--> statement-breakpoint", "").trim()).filter(Boolean).map(s => binding.prepare(s)));
  }
  db = createDb(binding as unknown as D1Database);
}, 30000);
beforeEach(async () => {
  await db.batch([db.delete(productSearchCache), db.delete(productSearchSettings), db.delete(productPricing)]);
  fetcher.mockClear(); vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.unstubAllGlobals(); });
afterAll(async () => { await mf?.dispose(); });

it("shares normalized successful results and persists only the safe DTO", async () => {
  const first = await cachedProductSearch(db, "test-token", base);
  const second = await cachedProductSearch(db, "test-token", { keyword: " shirt ", channel: "1688", page: 1, page_size: 20, language: "en" });
  expect(second).toEqual(first); expect(fetcher).toHaveBeenCalledTimes(1);
  expect((await readSearchCacheSettings(db)).ttlSeconds).toBe(300);
  const rows = await db.select().from(productSearchCache);
  expect(rows).toHaveLength(1);
  expect(JSON.stringify(rows)).not.toMatch(/test-token|seller_secret|private|"cost"/);
});

it("does not reuse a missing or stale sale price after markup changes", async () => {
  expect(await cachedProductSearch(db, "token", base)).toMatchObject({items:[{price:{unitPriceCents:null}}]});
  await db.insert(productPricing).values({id:"current", currency:"USD", markupBps:1000, fixedCnyCents:50, serviceBps:0, serviceCnyCents:0, cnyPerCurrencyE4:72000, version:1, mutationId:"test", updatedAt:0, updatedBy:"test"});
  const priced = await cachedProductSearch(db, "token", base);
  expect(priced).toMatchObject({items:[{price:{unitPriceCents:1150, currency:"CNY", displayOnly:true}}]});
  expect(await cachedProductSearch(db, "token", base)).toEqual(priced);
  await db.update(productPricing).set({fixedCnyCents:100});
  expect(await cachedProductSearch(db, "token", base)).toMatchObject({items:[{price:{unitPriceCents:1200}}]});
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("separates all search parameters and authorization scopes", async () => {
  await cachedProductSearch(db, "test-token", base);
  const variants = [
    { keyword: "shoe" }, { channel: "taobao" }, { page: 2 }, { page_size: 10 }, { language: "zh" }, { user_id: "user2" },
    { sort: "PRICE_ASC" }, { sort_field: "sales", sort_order: "desc" }, { price_start: 1 }, { price_end: 100 },
    { ship_within_hours: 24 }, { experience_score_level: 2 }, { product_attrs: "new7" }, { filter: "a" },
    { category_ids: "1,2" }, { category_id: 1 }, { category_id_list: "1" }, { product_collection_id: "pool" },
    { sale_filters: [{ sale_type: "sales7", sale_start: "1" }] }, { keyword_translate: false },
  ];
  for (const variant of variants) {
    await cachedProductSearch(db, "test-token", { ...base, ...variant });
    await cachedProductSearch(db, "test-token", { ...variant, ...base, ...variant });
  }
  await cachedProductSearch(db, "another-token", base);
  expect(fetcher).toHaveBeenCalledTimes(variants.length + 2);
});

it("refreshes expired entries, caches empty results, and never caches upstream failures", async () => {
  await cachedProductSearch(db, "token", base);
  await db.update(productSearchCache).set({ expiresAt: 1 });
  await cachedProductSearch(db, "token", base);
  expect(fetcher).toHaveBeenCalledTimes(2);
  const empty = vi.fn(async () => Response.json({ items: [], total: 0 })); vi.stubGlobal("fetch", empty);
  await cachedProductSearch(db, "token", { ...base, keyword: "empty" });
  await cachedProductSearch(db, "token", { ...base, keyword: "empty" });
  expect(empty).toHaveBeenCalledTimes(1);
  const failure = vi.fn(async () => Response.json({ error: "failed" }, { status: 502 })); vi.stubGlobal("fetch", failure);
  for (let n = 0; n < 2; n++) await expect(cachedProductSearch(db, "token", { ...base, keyword: "failed" })).rejects.toThrow();
  expect(failure).toHaveBeenCalledTimes(2);
  expect(await db.select().from(productSearchCache)).toHaveLength(2);
});

it("changes TTL immediately, disables caching at zero, and cannot revive old results", async () => {
  await cachedProductSearch(db, "token", base);
  await saveSearchCacheSettings(db, { ttlSeconds: 60 });
  expect(await db.select().from(productSearchCache)).toHaveLength(0);
  await cachedProductSearch(db, "token", base);
  expect((await db.select().from(productSearchCache))[0].expiresAt - Date.now()).toBeLessThanOrEqual(60000);
  await saveSearchCacheSettings(db, { ttlSeconds: 0 });
  await cachedProductSearch(db, "token", base); await cachedProductSearch(db, "token", base);
  expect(await db.select().from(productSearchCache)).toHaveLength(0);
  await saveSearchCacheSettings(db, { ttlSeconds: 300 }); await cachedProductSearch(db, "token", base);
  expect(fetcher).toHaveBeenCalledTimes(5);
});

it("isolates a late cache write after settings change", async () => {
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const hold = new Promise<void>(resolve => { release = resolve; });
  vi.stubGlobal("fetch", vi.fn(async () => { started(); await hold; return Response.json({ items: [], total: 0 }); }));
  const pending = cachedProductSearch(db, "token", base);
  await ready; await saveSearchCacheSettings(db, { ttlSeconds: 60 }); release(); await pending;
  vi.stubGlobal("fetch", fetcher);
  await cachedProductSearch(db, "token", base);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("returns search results if the cache write fails, and removes expired rows", async () => {
  await db.run(sql`CREATE TRIGGER reject_search_cache BEFORE INSERT ON product_search_cache BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
  try { expect(await cachedProductSearch(db, "token", base)).toHaveProperty("items"); }
  finally { await db.run(sql`DROP TRIGGER reject_search_cache`); }
  await cachedProductSearch(db, "token", base);
  await db.update(productSearchCache).set({ expiresAt: 1 });
  await cleanupProductSearchCache(db);
  expect(await db.select().from(productSearchCache)).toHaveLength(0);
});

it("validates TTL and protects admin settings writes", async () => {
  for (const ttlSeconds of [-1, 86401, 1.5, "300"]) await expect(saveSearchCacheSettings(db, { ttlSeconds })).rejects.toThrow();
  expect(permissionFor("GET", "/settings/product-search-cache")).toBe("settings.read");
  expect(permissionFor("PUT", "/settings/product-search-cache")).toBe("settings.write");
});
