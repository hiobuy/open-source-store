import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { createDb, type Database } from "./db/client";
import { announcements, auditLogs } from "./db/schema";
import { listAnnouncements, readAnnouncement, saveAnnouncement } from "./announcements";
import { announcementInput, announcementTranslation } from "../src/domain/announcements";
import { can, permissionFor } from "../src/domain/staff";

let mf: Miniflare, db: Database;
const actor = { id: "test-staff", email: "staff@example.invalid" };
const input = () => ({ translations: { en: { title: "Service update", content: "New opening hours" }, "zh-Hans": { title: "服务通知", content: "新的营业时间" } }, status: "draft", pinned: false, version: 0 });
beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "announcements-test", modules: true, script: "export default {fetch(){return new Response('test')}}", d1Databases: ["DB"] }] }));
  const binding = await mf.getD1Database("DB");
  for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) {
    const statements = readFileSync(`drizzle/${file}`, "utf8").split(";").map(s => s.replaceAll("--> statement-breakpoint", "").trim()).filter(Boolean);
    await binding.batch(statements.map(s => binding.prepare(s)));
  }
  db = createDb(binding as unknown as D1Database);
}, 30000);
beforeEach(async () => { await db.delete(announcements); await db.delete(auditLogs); });
afterAll(async () => { await mf?.dispose(); });

it("keeps drafts and archived content private throughout publication", async () => {
  const id = crypto.randomUUID();
  await saveAnnouncement(db, actor, id, input());
  expect((await listAnnouncements(db, { status: "draft" })).total).toBe(0);
  await expect(readAnnouncement(db, id)).rejects.toMatchObject({ status: 404 });
  expect((await listAnnouncements(db, {}, true)).total).toBe(1);
  const published = await saveAnnouncement(db, actor, id, { ...input(), status: "published", version: 1 });
  expect(published.publishedAt).toBeTypeOf("number");
  const detail = await readAnnouncement(db, id, "zh-CN");
  expect(detail).toMatchObject({ title: "服务通知", content: "新的营业时间", locale: "zh-Hans" });
  expect(detail).not.toHaveProperty("version");
  expect(detail).not.toHaveProperty("translations");
  await saveAnnouncement(db, actor, id, { ...input(), status: "archived", version: 2 });
  expect((await listAnnouncements(db, {})).total).toBe(0);
  await expect(readAnnouncement(db, id)).rejects.toMatchObject({ status: 404 });
});
it("paginates, searches and puts pinned announcements first", async () => {
  await saveAnnouncement(db, actor, crypto.randomUUID(), { ...input(), status: "published" });
  const pinned = await saveAnnouncement(db, actor, crypto.randomUUID(), { ...input(), status: "published", pinned: true });
  const first = await listAnnouncements(db, { pageSize: 1 });
  expect(first.total).toBe(2); expect(first.items.map(r => r.id)).toEqual([pinned.id]);
  expect((await listAnnouncements(db, { pageSize: 1, page: 2 })).items[0].id).not.toBe(pinned.id);
  expect((await listAnnouncements(db, { q: "营业" })).total).toBe(2);
  expect((await listAnnouncements(db, { q: "missing" })).items).toEqual([]);
});
it("rejects concurrent stale writes and only audits successful mutations", async () => {
  const id = crypto.randomUUID();
  const created = await Promise.allSettled([1, 2].map(() => saveAnnouncement(db, actor, id, input())));
  expect(created.filter(r => r.status === "fulfilled")).toHaveLength(1);
  const edits = await Promise.allSettled([true, false].map(pinned => saveAnnouncement(db, actor, id, { ...input(), pinned, version: 1 })));
  expect(edits.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(await db.select().from(auditLogs)).toHaveLength(2);
  await expect(saveAnnouncement(db, actor, id, { ...input(), version: 1 })).rejects.toMatchObject({ status: 409 });
});
it("validates translations and enforces distinct staff permissions", () => {
  expect(announcementInput.safeParse({ ...input(), translations: {} }).success).toBe(false);
  expect(announcementInput.safeParse({ ...input(), translations: { en: { title: "Title", content: " " } } }).success).toBe(false);
  expect(announcementTranslation(input().translations, "ru", "en").title).toBe("Service update");
  expect(permissionFor("GET", "/announcements")).toBe("announcements.read");
  expect(permissionFor("PUT", "/announcements/123")).toBe("announcements.write");
  expect(can("support", "announcements.read")).toBe(true);
  expect(can("support", "announcements.write")).toBe(false);
  expect(can("manager", "announcements.write")).toBe(true);
});
