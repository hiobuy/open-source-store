import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { createDb, type Database } from "./db/client";
import { productCategories } from "./db/schema";
import { importProductCategories, deleteProductCategory, listProductCategories, saveProductCategory } from "./product-categories";
import { categoryInput, localizedCategoryName } from "../src/domain/product-categories";
import { can, permissionFor } from "../src/domain/staff";
let mf: Miniflare, db: Database;
const input = () => ({ names: { en: "Clothing", "zh-Hans": "服饰", "zh-Hant": "服飾", ru: "Одежда" }, icon: { type: "name", value: "shirt" }, keyword: "服装", sortOrder: 10, enabled: true, version: 0 });
beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "categories-test", modules: true, script: "export default {fetch(){return new Response('test')}}", d1Databases: ["DB"] }] }));
  const binding = await mf.getD1Database("DB");
  for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) {
    const statements = readFileSync(`drizzle/${file}`, "utf8").split(";").map(s => s.replaceAll("--> statement-breakpoint", "").trim()).filter(Boolean);
    await binding.batch(statements.map(s => binding.prepare(s)));
  }
  db = createDb(binding as unknown as D1Database);
}, 30000);
beforeEach(async () => { await db.delete(productCategories); });
afterAll(async () => { await mf?.dispose(); });
describe("product categories", () => {
  it("resolves language aliases and missing translations deterministically", () => {
    const names = input().names;
    expect(localizedCategoryName(names, "zh-CN", "en")).toEqual({ name: "服饰", locale: "zh-Hans" });
    expect(localizedCategoryName(names, "zh-TW", "en")).toEqual({ name: "服飾", locale: "zh-Hant" });
    expect(localizedCategoryName(names, "ru-RU", "en")).toEqual({ name: "Одежда", locale: "ru" });
    expect(localizedCategoryName(names, "fr", "zh-Hans")).toEqual({ name: "服饰", locale: "zh-Hans" });
    expect(localizedCategoryName({ en: "Clothing" }, "ru", "zh-Hans")).toEqual({ name: "Clothing", locale: "en" });
  });
  it("validates fallback names, registered languages and safe icon formats", () => {
    expect(categoryInput.safeParse({ ...input(), names: { "zh-Hans": "服饰" } }).success).toBe(false);
    expect(categoryInput.safeParse({ ...input(), names: { en: "Name", unknown: "No" } }).success).toBe(false);
    for (const value of ["javascript:alert(1)", "data:image/svg+xml,test", "http://example.com/a", "https://user:pass@example.com/a"]) {
      expect(categoryInput.safeParse({ ...input(), icon: { type: "url", value } }).success).toBe(false);
    }
    expect(categoryInput.safeParse({ ...input(), icon: { type: "name", value: "<svg/>" } }).success).toBe(false);
    expect(categoryInput.safeParse({ ...input(), icon: null }).success).toBe(true);
  });
  it("returns all visible categories while retaining admin pagination and sorting", async () => {
    const a = await saveProductCategory(db, crypto.randomUUID(), input());
    await saveProductCategory(db, crypto.randomUUID(), { ...input(), sortOrder: 0, enabled: false });
    await saveProductCategory(db, crypto.randomUUID(), { ...input(), sortOrder: 1 });
    const first = await listProductCategories(db, { locale: "zh-CN", pageSize: 1 });
    expect(first.total).toBe(2);
    expect(first.items[0]).toMatchObject({ name: "服饰", locale: "zh-Hans", icon: { type: "name", value: "shirt" } });
    expect(first.items[0]).not.toHaveProperty("names");
    expect(first.items[0]).not.toHaveProperty("version");
    const filtered = await listProductCategories(db, { page: 2, pageSize: 1 });
    expect(filtered.total).toBe(2); expect(filtered.items).toHaveLength(2); expect(filtered.items[1].id).toBe(a.id);
    expect(filtered).not.toHaveProperty("page"); expect(filtered).not.toHaveProperty("pageSize");
    const adminPage = await listProductCategories(db, { page: 2, pageSize: 1 }, true);
    expect(adminPage).toMatchObject({ total: 3, page: 2, pageSize: 1 });
    expect(adminPage.items).toHaveLength(1);
    expect(filtered.items[0]).not.toHaveProperty("channel");
    expect((await listProductCategories(db, {}, true)).total).toBe(3);
  });
  it("returns more than the former maximum without truncating and supports empty results", async () => {
    expect(await listProductCategories(db, {})).toEqual({ items: [], total: 0 });
    const { version: _version, ...values } = input();
    await importProductCategories(db, { items: Array.from({ length: 100 }, (_, sortOrder) => ({ ...values, sortOrder, id: crypto.randomUUID() })) });
    await saveProductCategory(db, crypto.randomUUID(), { ...input(), sortOrder: 100 });
    const result = await listProductCategories(db, { locale: "zh-CN", page: 9, pageSize: 1 });
    expect(result.total).toBe(101); expect(result.items).toHaveLength(101);
    expect(result.items.map(item => item.sortOrder)).toEqual(Array.from({ length: 101 }, (_, i) => i));
  });
  it("prevents duplicate creates, lost concurrent edits and stale deletes", async () => {
    const id = crypto.randomUUID();
    const create = await Promise.allSettled([saveProductCategory(db, id, input()), saveProductCategory(db, id, input())]);
    expect(create.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const edits = await Promise.allSettled([1, 2].map(sortOrder => saveProductCategory(db, id, { ...input(), sortOrder, version: 1, icon: { type: "url", value: "https://cdn.example.com/icon.png" } })));
    expect(edits.filter(r => r.status === "fulfilled")).toHaveLength(1);
    await expect(deleteProductCategory(db, id, { version: 1 })).rejects.toMatchObject({ status: 409 });
    expect((await listProductCategories(db, {})).items[0]).toMatchObject({ icon: { type: "url", value: "https://cdn.example.com/icon.png" } });
    await deleteProductCategory(db, id, { version: 2 });
    expect((await listProductCategories(db, {})).total).toBe(0);
  });

  it("imports validated batches atomically and rejects duplicate or existing IDs", async () => {
    const { version: _version, ...values } = input();
    const a = { ...values, id: crypto.randomUUID() }, b = { ...values, id: crypto.randomUUID() };
    expect(await importProductCategories(db, { items: [a, b] })).toEqual({ imported: 2 });
    await expect(importProductCategories(db, { items: [a, a] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const fresh = { ...values, id: crypto.randomUUID() };
    await expect(importProductCategories(db, { items: [fresh, a] })).rejects.toMatchObject({ status: 409 });
    const listed = await listProductCategories(db, {}, true);
    expect(listed.total).toBe(2);
    expect(listed.items.some(row => row.id === fresh.id)).toBe(false);
    await expect(importProductCategories(db, { items: [{ ...fresh, names: {} }] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(importProductCategories(db, { items: Array.from({ length: 101 }, () => ({ ...values, id: crypto.randomUUID() })) })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(permissionFor("POST", "/settings/product-categories/import")).toBe("settings.write");
  });

  it("supports deep hierarchies and hides descendants of disabled ancestors", async () => {
    const root = await saveProductCategory(db, crypto.randomUUID(), input());
    const child = await saveProductCategory(db, crypto.randomUUID(), { ...input(), parentId: root.id });
    const leaf = await saveProductCategory(db, crypto.randomUUID(), { ...input(), parentId: child.id });
    expect((await listProductCategories(db, { parentId: "root" })).items.map(r => r.id)).toEqual([root.id]);
    expect((await listProductCategories(db, { parentId: root.id })).items.map(r => r.id)).toEqual([child.id]);
    expect((await listProductCategories(db, { parentId: child.id })).items[0]).toMatchObject({ id: leaf.id, parentId: child.id });
    await expect(saveProductCategory(db, root.id, { ...input(), version: 1, parentId: leaf.id })).rejects.toMatchObject({ status: 409 });
    await expect(deleteProductCategory(db, root.id, { version: 1 })).rejects.toMatchObject({ status: 409 });
    await saveProductCategory(db, root.id, { ...input(), version: 1, enabled: false });
    expect((await listProductCategories(db, {})).total).toBe(0);
    expect((await listProductCategories(db, { parentId: child.id })).total).toBe(0);
    expect((await listProductCategories(db, {}, true)).total).toBe(3);
    await saveProductCategory(db, root.id, { ...input(), version: 2, enabled: true });
    expect((await listProductCategories(db, {})).total).toBe(3);
  });
  it("prevents concurrent moves from introducing a cycle", async () => {
    const a = await saveProductCategory(db, crypto.randomUUID(), input()), b = await saveProductCategory(db, crypto.randomUUID(), input());
    const results = await Promise.allSettled([
      saveProductCategory(db, a.id, { ...input(), version: 1, parentId: b.id }),
      saveProductCategory(db, b.id, { ...input(), version: 1, parentId: a.id }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    await expect(saveProductCategory(db, crypto.randomUUID(), { ...input(), parentId: crypto.randomUUID() })).rejects.toMatchObject({ status: 409 });
  });
  it("imports children before parents safely, rejects cycles and rolls back missing parents", async () => {
    const { version: _v, ...values } = input();
    const root = { ...values, id: crypto.randomUUID(), parentId: null };
    const child = { ...values, id: crypto.randomUUID(), parentId: root.id };
    expect(await importProductCategories(db, { items: [child, root] })).toEqual({ imported: 2 });
    expect((await listProductCategories(db, { parentId: root.id })).items[0].id).toBe(child.id);
    const a = crypto.randomUUID(), b = crypto.randomUUID();
    await expect(importProductCategories(db, { items: [{ ...values, id: a, parentId: b }, { ...values, id: b, parentId: a }] })).rejects.toMatchObject({ status: 409 });
    await expect(importProductCategories(db, { items: [{ ...values, id: a, parentId: null }, { ...values, id: b, parentId: crypto.randomUUID() }] })).rejects.toMatchObject({ status: 409 });
    expect((await listProductCategories(db, {}, true)).total).toBe(2);
  });
  it("requires settings permissions for category configuration", () => {
    expect(permissionFor("GET", "/settings/product-categories")).toBe("settings.read");
    expect(permissionFor("PUT", "/settings/product-categories/id")).toBe("settings.write");
    expect(permissionFor("DELETE", "/settings/product-categories/id")).toBe("settings.write");
    expect(can("manager", "settings.write")).toBe(false);
    expect(can("support", "settings.read")).toBe(false);
    expect(can("owner", "settings.write")).toBe(true);
  });
});
