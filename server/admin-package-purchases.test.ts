import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { createDb, type Database } from "./db/client";
import { packages, procurementBills, procurementOrders, procurementItems, procurementItemPackages, user, shipments, shipmentPackages } from "./db/schema";
import { packageShipping } from "./admin-package-shipping";
import { packagePhotos } from "./db/schema";
import { getShipmentDetail } from "./shipment-detail";
import { findPackagePurchaseMatches, packagePurchaseLinks } from "./admin-package-purchases";
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("cloudflare:sockets", () => ({ connect: vi.fn() }));
let mf: Miniflare, db: Database;
beforeAll(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "package-links-test", modules: true, script: "export default {fetch(){return new Response('test')}}", d1Databases: ["DB"] }] }));
  const binding = await mf.getD1Database("DB");
  for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort()) {
    await binding.batch(readFileSync(`drizzle/${file}`, "utf8").split(";").map(s => s.replaceAll("--> statement-breakpoint", "").trim()).filter(Boolean).map(s => binding.prepare(s)));
  }
  db = createDb(binding as unknown as D1Database);
  const now = Date.now();
  await db.insert(user).values(["owner", "other"].map(id => ({ id, email: `${id}@example.invalid`, name: id, memberCode: id, createdAt: new Date(now), updatedAt: new Date(now) })));
  await db.insert(packages).values(["p1", "p2", "foreign"].map(id => ({ id, userId: id === "foreign" ? "other" : "owner", publicId: id, domesticTrackingNumber: id, courier: "test", packageStatus: "PENDING", exceptionStatus: "NONE", vasStatus: "NONE", lockStatus: "NONE", disposition: "NONE", createdAt: now, updatedAt: now })));
  await db.insert(procurementOrders).values({ id: "o1", number: "DG-LINKED", customerId: "owner", platform: "1688", goodsCents: 600, shippingCents: 0, totalCents: 600, requestHash: "o1", createdBy: "owner", createdAt: now, updatedAt: now });
  await db.insert(procurementItems).values({ id: "i1", orderId: "o1", position: 0, name: "Desk lamp", sku: "LAMP-WHITE", quantity: 3, unitPriceCents: 200, productSnapshot: JSON.stringify({ imageUrl: "https://example.invalid/lamp.png", variantLabel: "White", internalCost: 200 }) });
  await db.insert(procurementBills).values({ id: "b1", orderId: "o1", customerId: "owner", currency: "USD", goodsCents: 750, serviceCents: 0, shippingCents: 0, totalCents: 750, snapshot: JSON.stringify({lines: [{itemId: "i1", quantity: 3, goodsCents: 750}]}), requestHash: "b1", createdBy: "owner", createdAt: now });
  await db.insert(procurementItemPackages).values([
    { id: "l1", orderId: "o1", itemId: "i1", packageId: "p1", allocatedQuantity: 1, receivedQuantity: 0, active: true, createdAt: now, updatedAt: now },
    { id: "l2", orderId: "o1", itemId: "i1", packageId: "p2", allocatedQuantity: 2, receivedQuantity: 1, active: true, createdAt: now, updatedAt: now },
    { id: "bad-owner", orderId: "o1", itemId: "i1", packageId: "foreign", allocatedQuantity: 1, receivedQuantity: 0, active: true, createdAt: now, updatedAt: now },
    { id: "inactive", orderId: "o1", itemId: "i1", packageId: "p1", allocatedQuantity: 1, receivedQuantity: 0, active: false, createdAt: now, updatedAt: now },
  ]);
}, 30000);
afterAll(async () => { await mf?.dispose(); });
it("returns goods per customer shipment package, including split purchases and forwarding declarations", async () => {
  const now = Date.now();
  await db.insert(shipments).values({ id: "s-detail", publicId: "SHP-DETAIL", userId: "owner", status: "CANCELLED", upstreamStatus: "PENDING", createdAt: now, updatedAt: now });
  const goods = [{ name: "Cup", quantity: 2, imageUrl: "https://example.invalid/cup.png" }];
  const otherPackages = ["warehouse", "prealert", "unknown"];
  await db.insert(packages).values(otherPackages.map(id => ({
    id, publicId: id, userId: "owner", domesticTrackingNumber: id, courier: "test", packageStatus: "RECEIVED",
    exceptionStatus: "NONE", vasStatus: "NONE", lockStatus: "NONE", disposition: "NONE", receivedAt: now, createdAt: now, updatedAt: now,
    productName: id === "prealert" ? "Scarf" : null, fulfillmentItems: id === "warehouse" ? JSON.stringify(goods) : null,
  })));
  await db.insert(shipmentPackages).values(["p1", "p2", "foreign", ...otherPackages].map(packageId => ({ shipmentId: "s-detail", packageId })));
  const photoUrl = "https://cdn.example.invalid/warehouse.jpg";
  await db.insert(packagePhotos).values([
    { id: "receipt", packageId: "p1", type: "PACKAGE_RECEIPT_IMAGE", remoteUrl: photoUrl },
    { id: "placeholder", packageId: "p1", type: "INBOUND", remoteUrl: null },
    { id: "video", packageId: "p1", type: "SERVICE_VIDEO", remoteUrl: "https://cdn.example.invalid/file.mp4" },
    { id: "foreign-photo", packageId: "foreign", type: "PHOTO", remoteUrl: "https://cdn.example.invalid/private.jpg" },
  ].map(photo => ({ ...photo, label: photo.id, createdAt: now })));
  const detail = await getShipmentDetail(db, "owner", "s-detail");
  expect(detail.packageCount).toBe(5);
  const byId = new Map(detail.packages.map(pkg => [pkg.id, pkg]));
  expect(byId.has("foreign")).toBe(false);
  expect(byId.get("p1")?.photos).toEqual([{ id: "receipt", type: "PACKAGE_RECEIPT_IMAGE", label: "receipt", url: photoUrl, createdAt: new Date(now).toISOString() }]);
  expect(byId.get("p2")?.photos).toEqual([]);
  expect(JSON.stringify(detail)).not.toContain("private.jpg");
  expect(byId.get("p1")?.items).toEqual([{ itemId: "i1", orderId: "o1", orderNumber: "DG-LINKED", name: "Desk lamp", sku: "LAMP-WHITE",
    variantLabel: "White", imageUrl: "https://example.invalid/lamp.png", quantity: 1, receivedQuantity: 0, unitPriceCents: 250, currency: "USD" }]);
  expect(byId.get("p2")).toMatchObject({ itemSource: "purchase", items: [{ itemId: "i1", quantity: 2, receivedQuantity: 1 }] });
  expect(byId.get("warehouse")).toMatchObject({ itemSource: "fulfillment", packageStatus: "RECEIVED", receivedAt: new Date(now).toISOString(), goodsItems: goods, items: goods });
  expect(byId.get("prealert")).toMatchObject({ itemSource: "prealert", items: [{ name: "Scarf", quantity: null, receivedQuantity: null, unitPriceCents: null }] });
  expect(byId.get("unknown")).toMatchObject({ itemSource: null, items: [], goodsItems: [] });
  await expect(getShipmentDetail(db, "other", "s-detail")).rejects.toMatchObject({ status: 404 });
});
it("projects only active, owner-matched item links without procurement costs", async () => {
  const result = await packagePurchaseLinks(db, ["p1", "p2", "foreign"]);
  expect(result.get("p1")).toHaveLength(1);
  expect(result.get("p1")![0]).toMatchObject({ orderNumber: "DG-LINKED", saleUnitCents: 250, saleCurrency: "USD", allocatedQuantity: 1, receivedQuantity: 0, orderedQuantity: 3, imageUrl: "https://example.invalid/lamp.png" });
  expect(result.get("p2")![0]).toMatchObject({ allocatedQuantity: 2, receivedQuantity: 1 });
  expect(result.has("foreign")).toBe(false);
  expect(JSON.stringify([...result])).not.toMatch(/internalCost|unitPriceCents|snapshot/);
  expect((await packagePurchaseLinks(db, [])).size).toBe(0);
});
it("searches order numbers, goods and SKU without matching foreign parcels", async () => {
  for (const term of ["DG-LINKED", "Desk lamp", "LAMP-WHITE"]) expect(await findPackagePurchaseMatches(db, term)).toEqual(new Set(["p1", "p2"]));
  expect((await findPackagePurchaseMatches(db, "missing")).size).toBe(0);
});

it("uses only a unique same-owner active shipment and never invents milestone dates", async () => {
  const now = Date.now();
  await db.insert(shipments).values([
    { id: "s-ready", publicId: "s-ready", userId: "owner", status: "READY_TO_SHIP", upstreamStatus: "WAIT_SHIP", createdAt: now, updatedAt: now },
    { id: "s-cancelled", publicId: "s-cancelled", userId: "owner", status: "CANCELLED", upstreamStatus: "WAIT_SHIP", createdAt: now, updatedAt: now },
    { id: "s-other", publicId: "s-other", userId: "other", status: "READY_TO_SHIP", upstreamStatus: "WAIT_SHIP", createdAt: now, updatedAt: now },
  ]);
  await db.insert(shipmentPackages).values([
    { shipmentId: "s-ready", packageId: "p1" },
    { shipmentId: "s-cancelled", packageId: "p1" },
    { shipmentId: "s-other", packageId: "p2" },
  ]);
  const result = await packageShipping(db, ["p1", "p2"]);
  expect(result.get("p1")).toEqual({ readyToShip: true, packedAt: null, shippedAt: null });
  expect(result.has("p2")).toBe(false);
  expect((await packageShipping(db, [])).size).toBe(0);
});
