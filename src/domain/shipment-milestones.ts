/** Use the documented event code and timezone-aware timestamp, never localized titles. */
export function readShipmentMilestones(payload: unknown) {
  const result: { packedAt: number | null; hiobuyPaidAt: number | null; shippedAt: number | null } = { packedAt: null, hiobuyPaidAt: null, shippedAt: null };
  if (!payload || typeof payload !== "object") return result;
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : root;
  for (const event of Array.isArray(data.timeline) ? data.timeline : []) {
    if (!event || typeof event !== "object") continue;
    const key = event.code === "SHIPMENT_PACKED" ? "packedAt" : event.code === "SHIPMENT_PAID" ? "hiobuyPaidAt" : event.code === "SHIPMENT_DISPATCHED" ? "shippedAt" : null;
    if (!key || typeof event.occurred_at !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(event.occurred_at)) continue;
    const at = Date.parse(event.occurred_at);
    if (Number.isFinite(at)) result[key] = Math.min(result[key] ?? at, at);
  }
  return result;
}
