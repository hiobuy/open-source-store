import { expect, it } from "vitest";
import { readShipmentMilestones } from "./shipment-milestones";

it("reads documented event codes with explicit timezones, ignoring titles and invalid times", () => {
  const event = { code: "SHIPMENT_PACKED", occurred_at: "2026-11-18T18:00:25+08:00" };
  const expected = Date.parse(event.occurred_at);
  expect(readShipmentMilestones({ data: { timeline: [event, { ...event, occurred_at: "2026-11-19T10:00:25Z" }, { code: "UNKNOWN", title: "Shipped", occurred_at: event.occurred_at }] } })).toEqual({ packedAt: expected, hiobuyPaidAt: null, shippedAt: null });
  for (const occurred_at of ["2026-11-18 18:00:25", "invalid", null]) expect(readShipmentMilestones({ timeline: [{ ...event, occurred_at }] }).packedAt).toBeNull();
});
