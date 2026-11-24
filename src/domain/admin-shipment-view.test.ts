import { describe, expect, it } from "vitest";
import { packingVolume, packingChargeableWeight, shipmentViewStatus } from "./admin-shipment-view";

describe("admin shipment display queues", () => {
  const base = { status: "READY_TO_SHIP", hiobuyStatus: "WAIT_PAYMENT", hiobuyPaymentStatus: "UNPAID", charges: [{ status: "PAID" }] };
  it("separates customer debt from upstream debt", () => {
    expect(shipmentViewStatus(base).key).toBe("wait_payment");
    expect(shipmentViewStatus({ ...base, status: "TO_PAY", charges: [{ status: "DUE" }] }).key).toBe("customer_due");
    expect(shipmentViewStatus({ ...base, hiobuyPaymentStatus: "PAID" }).key).toBe("wait_ship");
  });
  it("does not treat warehouse-ready as customer payment evidence", () => {
    expect(shipmentViewStatus({ ...base, status: "TO_PAY", hiobuyStatus: "WAIT_SHIP" }).key).toBe("customer_due");
    expect(shipmentViewStatus({ ...base, status: "CONSOLIDATING", hiobuyStatus: "PENDING", charges: [] }).key).toBe("pending");
  });
  it("keeps delivery and cancellation visible, and flags partial payments / failed sync", () => {
    expect(shipmentViewStatus({ ...base, hiobuyStatus: "SHIPPED" }).key).toBe("shipped");
    expect(shipmentViewStatus({ ...base, status: "DELIVERED" }).key).toBe("signed");
    expect(shipmentViewStatus({ ...base, hiobuyPaymentStatus: "PARTIAL" }).key).toBe("exception");
    expect(shipmentViewStatus({ ...base, syncFailed: true }).key).toBe("exception");
    expect(shipmentViewStatus({ ...base, status: "CANCELLED", syncFailed: true }).key).toBe("cancelled");
  });
  it("includes unlinked local shipments in ordinary queues", () => {
    expect(shipmentViewStatus({ ...base, hiobuyStatus: null }).key).toBe("wait_ship");
    expect(shipmentViewStatus({ ...base, status: "WAITING_FOR_WEIGHT", hiobuyStatus: null }).key).toBe("pending");
  });
});

describe("packing volume", () => {
  const base = { cartons: [], finalLengthMm: 100, finalWidthMm: 200, finalHeightMm: 300 };
  it("converts mm cubed to m cubed and sums measured cartons", () => {
    expect(packingVolume(base)).toBeCloseTo(0.006);
    expect(packingVolume({ ...base, cartons: [{ lengthMm: 200, widthMm: 200, heightMm: 200 }, { lengthMm: 100, widthMm: 100, heightMm: 100 }] })).toBeCloseTo(0.009);
  });
  it("does not report partial or missing measurements as zero", () => {
    expect(packingVolume({ ...base, finalHeightMm: null })).toBeNull();
    expect(packingVolume({ ...base, cartons: [{ lengthMm: 100, widthMm: 100, heightMm: null }] })).toBeNull();
    expect(packingVolume({ ...base, finalHeightMm: 0 })).toBeNull();
  });
  it("sums per-carton reference chargeable weights even without overall dimensions", () => {
    const item = { finalWeightGrams: 11000, finalLengthMm: null, finalWidthMm: null, finalHeightMm: null,
      cartons: [{ weightGrams: 1000, lengthMm: 500, widthMm: 500, heightMm: 500 }, { weightGrams: 10000, lengthMm: 100, widthMm: 100, heightMm: 100 }] };
    expect(packingVolume(item)).toBeCloseTo(0.126);
    expect(packingChargeableWeight(item)).toBe(35000);
    expect(packingChargeableWeight({ ...item, cartons: [{ ...item.cartons[0], weightGrams: null }] })).toBeNull();
    expect(packingChargeableWeight({ ...item, cartons: [{ ...item.cartons[0], heightMm: null }] })).toBeNull();
    expect(packingChargeableWeight({ ...base, finalWeightGrams: 2000 })).toBe(2000);
  });
});
