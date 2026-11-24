import { expect, it } from "vitest";
import { storageDurationDays, warehousePackageMatches } from "./warehouse-packages";

it("keeps physical warehouse status separate from exceptions and counts attention once", () => {
  const rows = [
    { displayStatus: { key: "pending" }, conditionStatus: "NORMAL" },
    { displayStatus: { key: "received" }, conditionStatus: "EXCEPTION" },
    { displayStatus: { key: "consolidated" }, conditionStatus: "NORMAL" },
    { displayStatus: { key: "unclaimed" }, conditionStatus: "EXCEPTION" },
    { displayStatus: { key: "shipped" }, conditionStatus: "NORMAL" },
  ];
  expect(rows.filter(row => warehousePackageMatches(row, "in_warehouse"))).toHaveLength(2);
  expect(rows.filter(row => warehousePackageMatches(row, "attention"))).toHaveLength(2);
  expect(rows.filter(row => warehousePackageMatches(row, "pending"))).toHaveLength(1);
  expect(rows.filter(row => warehousePackageMatches(row, "all"))).toHaveLength(5);
  expect(rows.filter(row => warehousePackageMatches(row, "exception"))).toHaveLength(2);
});

it("only shows in-warehouse parcels with confirmed dispatch readiness in the dispatch queue", () => {
  const parcel = { displayStatus: { key: "consolidated" }, conditionStatus: "NORMAL", readyToShip: true };
  expect(warehousePackageMatches(parcel, "wait_ship")).toBe(true);
  expect(warehousePackageMatches({ ...parcel, readyToShip: false }, "wait_ship")).toBe(false);
  expect(warehousePackageMatches({ ...parcel, displayStatus: { key: "shipped" } }, "wait_ship")).toBe(false);
});

it("counts complete storage days and stops at actual dispatch", () => {
  const pkg = { packageStatus: "RECEIVED", receivedAt: "2026-11-10T08:00:00Z" };
  const now = Date.parse("2026-11-15T07:00:00Z");
  expect(storageDurationDays(pkg, now)).toBe(4);
  expect(storageDurationDays({ ...pkg, packageStatus: "SHIPPED", shippedAt: "2026-11-11T10:00:00Z" }, now)).toBe(1);
  expect(storageDurationDays({ ...pkg, packageStatus: "SHIPPED" }, now)).toBeNull();
  expect(storageDurationDays({ ...pkg, receivedAt: null }, now)).toBeNull();
});
