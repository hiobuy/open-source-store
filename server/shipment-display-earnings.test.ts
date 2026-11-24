import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { createDb, type Database } from "./db/client";
import { earningViewsFor } from "./earnings";
import { charges, checkouts, checkoutItems, shipmentEarnings, shipments } from "./db/schema";
import { listShipments } from "./data";
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("cloudflare:sockets", () => ({ connect: vi.fn() }));

let mf: Miniflare, db: Database;
beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "shipment-receipt-test", modules: true, script: "export default {fetch(){return new Response()}}", d1Databases: ["DB"] }] }));
  const binding = await mf.getD1Database("DB");
  for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) {
    await binding.batch(readFileSync("drizzle/" + file, "utf8").split(";").map(s => s.replaceAll("--> statement-breakpoint", "").trim()).filter(Boolean).map(s => binding.prepare(s)));
  }
  db = createDb(binding as unknown as D1Database);
}, 30000);
afterAll(async () => { await mf?.dispose(); });

it("includes HioBuy-awaiting-payment shipments in the customer's ready-to-ship total and pagination", async () => {
  for (const [id, userId, status, upstreamStatus] of [
    ["awaiting-hiobuy", "customer-a", "READY_TO_SHIP", "WAIT_PAYMENT"],
    ["awaiting-dispatch", "customer-a", "READY_TO_SHIP", "WAIT_SHIP"],
    ["customer-unpaid", "customer-a", "TO_PAY", "WAIT_PAYMENT"],
    ["another-customer", "customer-b", "READY_TO_SHIP", "WAIT_PAYMENT"],
  ]) await db.insert(shipments).values({ id, userId, publicId: id, status, upstreamStatus, hiobuyShipmentId: `remote-${id}`, createdAt: 1, updatedAt: 1 });
  const first = await listShipments(db, "customer-a", "ready_to_ship", "", 1, 1);
  const second = await listShipments(db, "customer-a", "ready_to_ship", "", 2, 1);
  expect(first.total).toBe(2); expect(second.total).toBe(2);
  expect(new Set([...first.items, ...second.items].map(item => item.id))).toEqual(new Set(["awaiting-hiobuy", "awaiting-dispatch"]));
  const search = await listShipments(db, "customer-a", "ready_to_ship", "awaiting-hiobuy", 1, 20);
  expect(search.total).toBe(1); expect(search.items[0].displayStatus.key).toBe("payment_received");
  expect((await listShipments(db, "customer-a", "to_pay", "", 1, 20)).items.map(item => item.id)).toEqual(["customer-unpaid"]);
});

async function receipt(shipmentId: string, id: string, status = "PAID", currency = "USD") {
  await db.insert(checkouts).values({ id, userId: "u", status, currency, totalFen: 760, createdAt: 1, expiresAt: 100, paidAt: status === "PAID" ? 50 : null });
  await db.insert(checkoutItems).values({ id, checkoutId: id, referenceType: "SHIPMENT", referenceId: shipmentId, amountFen: 760, label: "Freight" });
}

it("recovers a legacy Stripe payment for display from its paid receipt without writing or repricing the snapshot", async () => {
  await db.insert(shipmentEarnings).values({ shipmentId: "legacy", hiobuyCostCnyFen: 4700, cnyPerUsdE4: 68000, billedUsdFen: 760, collectedUsdFen: null, costConfirmed: true, paidAt: null, createdAt: 1, updatedAt: 1 });
  await db.insert(charges).values({ id: "c", shipmentId: "legacy", type: "FREIGHT", name: "Freight", amountFen: 760, currency: "USD", status: "PAID" });
  await receipt("legacy", "pending", "READY");
  await receipt("legacy", "paid");
  const before = await db.select().from(shipmentEarnings);
  for (let retry = 0; retry < 2; retry++) {
    expect((await earningViewsFor(db, ["legacy"])).get("legacy")).toMatchObject({ status: "finalized", paidAt: 50, customerChargedUsdFen: 760, hiobuyCostUsdFen: 691, grossProfitUsdFen: 69 });
  }
  expect(await db.select().from(shipmentEarnings)).toEqual(before);
});

it("keeps unpaid estimates, unknown costs and ambiguous or foreign-currency receipts distinct", async () => {
  for (const shipmentId of ["unpaid", "ambiguous", "foreign", "missing-cost", "frozen"]) await db.insert(shipmentEarnings).values({ shipmentId, hiobuyCostCnyFen: shipmentId === "missing-cost" ? null : 4700, cnyPerUsdE4: 68000, billedUsdFen: 760, collectedUsdFen: shipmentId === "frozen" ? 800 : null, paidAt: shipmentId === "frozen" ? 30 : null, createdAt: 1, updatedAt: 1 });
  await receipt("unpaid", "ready", "READY");
  await receipt("ambiguous", "a1"); await receipt("ambiguous", "a2");
  await receipt("foreign", "foreign", "PAID", "CNY");
  await receipt("missing-cost", "missing-cost"); await receipt("frozen", "frozen");
  const views = await earningViewsFor(db, ["unpaid", "ambiguous", "foreign", "missing-cost", "frozen"]);
  for (const id of ["unpaid", "ambiguous", "foreign"]) expect(views.get(id)).toMatchObject({ paidAt: null, status: "pending", grossProfitUsdFen: 69 });
  expect(views.get("missing-cost")).toMatchObject({ paidAt: 50, status: "unavailable", grossProfitUsdFen: null });
  expect(views.get("frozen")).toMatchObject({ paidAt: 30, customerChargedUsdFen: 800 });
});
