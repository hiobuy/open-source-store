import { afterAll, beforeAll, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { createDb, type Database } from "./db/client";
import { shipmentListTimes, shipmentOrderNumbers, visibleShipmentEarning } from "./admin-shipment-view";
import { storeShipmentMilestones } from "./shipment-milestones";

let mf: Miniflare, db: Database;
beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "shipment-view-test", modules: true, script: "export default {fetch(){return new Response('test')}}", d1Databases: ["DB"] }] }));
  const binding = await mf.getD1Database("DB");
  await binding.exec("CREATE TABLE fulfillment_sync_tasks (id TEXT PRIMARY KEY, entity_type TEXT, entity_id TEXT, action TEXT); CREATE TABLE fulfillment_sync_attempts (id TEXT PRIMARY KEY, task_id TEXT, attempt INTEGER, outcome TEXT, new_status TEXT, finished_at INTEGER, created_at INTEGER);");
  db = createDb(binding as unknown as D1Database);
  await binding.exec("CREATE TABLE shipment_milestones (shipment_id TEXT PRIMARY KEY, packed_at INTEGER, hiobuy_paid_at INTEGER, shipped_at INTEGER);");
  // Insert the deliberately small schema directly, keeping the fixture about read projection only.
  await binding.exec("INSERT INTO fulfillment_sync_tasks VALUES ('pull','shipment','s1','status_pull'),('pay','shipment','s1','shipment_pay'),('other','shipment','s2','shipment_pay'); INSERT INTO fulfillment_sync_attempts VALUES ('failed','pull',1,'failed','WAIT_PAYMENT',10,10),('packed','pull',2,'updated','WAIT_PAYMENT',20,19),('paid','pay',1,'synced',NULL,30,29),('retry','pay',2,'synced',NULL,40,39),('ship','pull',3,'updated','SHIPPED',50,49),('foreign','other',1,'synced',NULL,5,5);");
  await binding.exec("ALTER TABLE fulfillment_sync_tasks ADD remote_id TEXT; ALTER TABLE fulfillment_sync_tasks ADD remote_secondary TEXT; UPDATE fulfillment_sync_tasks SET remote_id='211',remote_secondary='JIYUNRI2932' WHERE id='pay'; UPDATE fulfillment_sync_tasks SET remote_id='222',remote_secondary='OTHER' WHERE id='other';");
}, 30000);
afterAll(async () => { await mf?.dispose(); });
it("selects earliest successful milestones and scopes by shipment", async () => {
  const result = await shipmentListTimes(db, ["s1", "missing"]);
  expect(result.get("s1")).toEqual({ packedAt: new Date(20).toISOString(), hiobuyPaidAt: new Date(30).toISOString(), shippedAt: new Date(50).toISOString() });
  expect(result.has("s2")).toBe(false);
  expect(result.has("missing")).toBe(false);
  expect((await shipmentListTimes(db, [])).size).toBe(0);
});
it("displays the HioBuy order serial only for the linked shipment ID", async () => {
  const result = await shipmentOrderNumbers(db, [{ id: "s1", hiobuyShipmentId: "211" }, { id: "s2", hiobuyShipmentId: "999" }, { id: "missing", hiobuyShipmentId: "211" }]);
  expect(result.get("s1")).toBe("JIYUNRI2932");
  expect(result.has("s2")).toBe(false);
  expect(result.has("missing")).toBe(false);
  expect((await shipmentOrderNumbers(db, [{ id: "s1", hiobuyShipmentId: null }])).size).toBe(0);
});

it("redacts procurement prices and adjustments while retaining customer receipts", () => {
  const earning = { status: "finalized" as const, fullyRefunded: false, customerChargedUsdFen: 2500, hiobuyCostCnyFen: 15000, hiobuyCostUsdFen: 2100, grossProfitUsdFen: 400, markupBps: 100, markupCnyFen: 0, cnyPerUsdE4: 72000, paidAt: "2026-01-01", adjustments: [{ id: "a", kind: "cost" as const, usdFen: null, cnyFen: 15000, note: "private cost", createdAt: "2026-01-01" }] };
  expect(visibleShipmentEarning(earning, true)).toBe(earning);
  expect(visibleShipmentEarning(earning, false)).toMatchObject({ customerChargedUsdFen: 2500, paidAt: "2026-01-01", hiobuyCostCnyFen: null, hiobuyCostUsdFen: null, grossProfitUsdFen: null, markupBps: null, markupCnyFen: null, cnyPerUsdE4: null, adjustments: [] });
});

it("persists upstream events, prefers their times over pulls, and retains them across partial/repeated responses", async () => {
  const payload = { timeline: [{ code: "SHIPMENT_PACKED", occurred_at: "2026-11-18T10:00:25Z" }, { code: "SHIPMENT_PAID", occurred_at: "2026-11-18T10:25:09Z" }] };
  await Promise.all([storeShipmentMilestones(db, "s3", payload), storeShipmentMilestones(db, "s3", payload)]);
  await storeShipmentMilestones(db, "s3", { timeline: [{ code: "SHIPMENT_PACKED", occurred_at: "2026-11-19T10:00:25Z" }] });
  await storeShipmentMilestones(db, "s3", {});
  expect((await shipmentListTimes(db, ["s3"])).get("s3")).toEqual({ packedAt: "2026-11-18T10:00:25.000Z", hiobuyPaidAt: "2026-11-18T10:25:09.000Z", shippedAt: null });
  await storeShipmentMilestones(db, "s1", payload);
  expect((await shipmentListTimes(db, ["s1"])).get("s1")?.packedAt).toBe("2026-11-18T10:00:25.000Z");
});
