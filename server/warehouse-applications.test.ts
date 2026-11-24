import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { eq } from "drizzle-orm";
import { createDb, type Database } from "./db/client";
import { addresses, charges, idempotencyKeys, packages, shipmentMilestones, shipmentPackages, shipments, user } from "./db/schema";
import { applyForPackageService, applyForShipmentService } from "./warehouse-applications";
import { createShipment, createShippingQuote } from "./data";
import { serviceApplication, inboundApplicationAllowed, outboundApplicationAllowed } from "../src/domain/warehouse-service-application";
import type { WarehouseStage } from "../src/domain/warehouse-service-catalog";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("cloudflare:sockets", () => ({ connect: vi.fn() }));
vi.mock("./warehouse-catalog", () => ({
  warehouseCatalog: vi.fn(async (_db, _token, stage: WarehouseStage) => ({
    stage, requestListAvailable: true, applicationAvailable: false,
    items: [{ stage, code: stage === "INBOUND" ? "1" : "2", minQuantity: 1, maxQuantity: 2 }],
  })),
}));
vi.mock("./freight", async importOriginal => ({
  ...await importOriginal<typeof import("./freight")>(), fulfillmentConnected: async () => true,
}));
vi.mock("./calculator", () => ({ liveShipmentRoutes: async () => ({
  routes: [{ routeCode: "route", routeName: "Test", description: "Test", daysMin: 1, daysMax: 3, estimatedMinFen: 200, estimatedMaxFen: 200 }],
}) }));
vi.mock("./fulfillment-sync", async importOriginal => ({
  ...await importOriginal<typeof import("./fulfillment-sync")>(), enqueueShipmentCreate: vi.fn(), refreshShipmentMedia: vi.fn(),
}));

const inbound = { hiobuyPackageId: "893", hiobuyStatus: "RECEIVED", packageStatus: "RECEIVED", conditionStatus: "NORMAL",
  exceptionStatus: "NONE", vasStatus: "NONE", lockStatus: "AVAILABLE", disposition: "NONE" };
const outbound = { status: "CONSOLIDATING", upstreamStatus: "PENDING", hiobuyPaymentStatus: null, interceptionStatus: null, trackingNumber: null };
const services = [{ code: "2", quantity: 1 }];
const unavailable = { status: 503, message: "仓库服务暂不可用" };
let mf: Miniflare, db: Database;
beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "warehouse-application-test", modules: true,
    script: "export default {fetch(){return new Response('ok')}}", d1Databases: ["DB"] }] }));
  const binding = await mf.getD1Database("DB");
  for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) {
    const sql = readFileSync("drizzle/" + file, "utf8").replaceAll("--> statement-breakpoint", "");
    await binding.batch(sql.split(";").map(s => s.trim()).filter(Boolean).map(s => binding.prepare(s)));
  }
  db = createDb(binding as unknown as D1Database);
  const now = Date.now();
  await db.insert(user).values({ id: "owner", email: "owner@example.invalid", name: "owner", memberCode: "TEST",
    createdAt: new Date(now), updatedAt: new Date(now) });
  await db.insert(packages).values({ ...inbound, id: "pkg", publicId: "PKG", userId: "owner", domesticTrackingNumber: "001",
    courier: "Test", weightGrams: 1000, createdAt: now, updatedAt: now });
  await db.insert(shipments).values({ ...outbound, id: "ship", publicId: "SHP", userId: "owner", hiobuyShipmentId: "211",
    hiobuySyncedAt: now, createdAt: now, updatedAt: now });
  await db.insert(addresses).values({ id: "addr", userId: "owner", name: "test", phone: "000", countryCode: "US",
    state: "WA", city: "Seattle", postalCode: "98101", addressLine1: "Test", createdAt: now, updatedAt: now });
}, 30000);
afterAll(async () => { await mf?.dispose(); });

it("validates service selections and rejects a client-supplied price", () => {
  expect(serviceApplication.safeParse({ services }).success).toBe(true);
  for (const value of [[], [...services, ...services], [{ code: "2", quantity: 1.2 }], [{ ...services[0], price: 0 }]]) {
    expect(serviceApplication.safeParse({ services: value }).success).toBe(false);
  }
});
it("accepts only actionable received packages and shipments that can still be packed", () => {
  expect(inboundApplicationAllowed(inbound)).toBe(true);
  for (const change of [{ hiobuyPackageId: null }, { hiobuyStatus: "PENDING" }, { packageStatus: "CONSOLIDATED" },
    { exceptionStatus: "ACTION_REQUIRED" }, { vasStatus: "PROCESSING" }, { lockStatus: "LOCKED" }, { disposition: "RETURN_REQUESTED" }]) {
    expect(inboundApplicationAllowed({ ...inbound, ...change })).toBe(false);
  }
  expect(outboundApplicationAllowed(outbound)).toBe(true);
  for (const change of [{ status: "TO_PAY" }, { upstreamStatus: "WAIT_SHIP" }, { hiobuyPaymentStatus: "PAID" },
    { trackingNumber: "TRACK" }, { interceptionStatus: "PENDING" }, { status: "CANCELLED" }]) {
    expect(outboundApplicationAllowed({ ...outbound, ...change })).toBe(false);
  }
});
it("enforces ownership, catalog stage, quantity bounds and packing milestones", async () => {
  await expect(applyForPackageService(db, "other", "pkg", services)).rejects.toMatchObject({ status: 404 });
  await expect(applyForShipmentService(db, "other", "ship", services)).rejects.toMatchObject({ status: 404 });
  await expect(applyForPackageService(db, "owner", "pkg", services)).rejects.toMatchObject({ status: 400 });
  await expect(applyForPackageService(db, "owner", "pkg", [{ code: "1", quantity: 1 }])).rejects.toMatchObject(unavailable);
  await expect(applyForShipmentService(db, "owner", "ship", [{ code: "2", quantity: 3 }])).rejects.toMatchObject({ status: 400 });
  await expect(applyForShipmentService(db, "owner", "ship", services)).rejects.toMatchObject(unavailable);
  await db.insert(shipmentMilestones).values({ shipmentId: "ship", packedAt: Date.now() });
  await expect(applyForShipmentService(db, "owner", "ship", services)).rejects.toMatchObject({ status: 409 });
});
it("keeps the package and quote available on failure and allows deselection with the same idempotency key", async () => {
  const quote = await createShippingQuote(db, "owner", ["pkg"], "addr");
  const input = { packageIds: ["pkg"], addressId: "addr", routeCode: "route", quoteId: quote.quoteId, packingInstruction: "Keep original seller packaging" };
  const requests = await Promise.allSettled([1, 2].map(() => createShipment(db, "owner", { ...input, services }, "same")));
  for (const result of requests) expect(result).toMatchObject({ status: "rejected", reason: unavailable });
  expect(await db.select().from(packages).where(eq(packages.id, "pkg"))).toMatchObject([{ packageStatus: "RECEIVED", lockStatus: "AVAILABLE" }]);
  expect(await db.select().from(shipmentPackages)).toHaveLength(0);
  expect(await db.select().from(idempotencyKeys)).toHaveLength(0);
  expect(await db.select().from(charges)).toHaveLength(0);
  expect(await db.select().from(shipments)).toHaveLength(1);
  await createShipment(db, "owner", { ...input, services: [] }, "same");
  await createShipment(db, "owner", input, "same");
  expect(await db.select().from(shipmentPackages)).toMatchObject([{ packageId: "pkg" }]);
  expect(await db.select().from(packages).where(eq(packages.id, "pkg"))).toMatchObject([{ packageStatus: "CONSOLIDATED", lockStatus: "LOCKED" }]);
  expect(await db.select().from(shipments)).toHaveLength(2);
});
