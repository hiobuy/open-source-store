vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("cloudflare:sockets", () => ({ connect: vi.fn() }));
import { describe, expect, it, vi } from "vitest";
import { purchaseItemPrice } from "./purchase-detail";

describe("customer purchase price projection", () => {
  it("uses the frozen selling price, never the procurement cost", () => {
    const price = purchaseItemPrice({ id: "line", position: 0, quantity: 3 }, { currency: "USD", snapshot: JSON.stringify({ policy: { markupBps: 5000 }, lines: [{ itemId: "0", quantity: 3, goodsCents: 1000, costCnyCents: 1200, sellingUnitCnyCents: 2400 }] }) });
    expect(price).toEqual({ currency: "USD", unitPriceCents: 333, subtotalCents: 1000, referencePrice: { currency: "CNY", unitPriceCents: 2400, subtotalCents: 7200 } });
    expect(JSON.stringify(price)).not.toContain("cost");
  });
  it("supports operator item IDs and does not invent prices for missing or mismatched snapshots", () => {
    const item = { id: "line", position: 0, quantity: 2 };
    expect(purchaseItemPrice(item).unitPriceCents).toBeNull();
    expect(purchaseItemPrice(item, { currency: "USD", snapshot: "invalid" }).unitPriceCents).toBeNull();
    expect(purchaseItemPrice(item, { currency: "USD", snapshot: JSON.stringify({ lines: [{ itemId: "line", quantity: 1, goodsCents: 800 }] }) }).unitPriceCents).toBeNull();
    expect(purchaseItemPrice(item, { currency: "USD", snapshot: JSON.stringify({ lines: [{ itemId: "line", quantity: 2, goodsCents: 800 }] }) }).unitPriceCents).toBe(400);
  });
});
