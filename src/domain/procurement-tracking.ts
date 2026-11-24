export const AFTERSALE_KINDS = ["missing", "damaged", "wrong_item", "return", "other"] as const;
export const AFTERSALE_STATUSES = ["open", "in_progress", "resolved", "cancelled"] as const;
export type AftersaleStatus = typeof AFTERSALE_STATUSES[number];
export function canTransitionAftersale(from: AftersaleStatus, to: AftersaleStatus) {
  // Same-state updates add a handling note. Closed cases remain immutable.
  return (from === "open" || from === "in_progress") && (to === from || to === "in_progress" || to === "resolved" || to === "cancelled");
}
export function receivingProgress(ordered: number, allocated: number, received: number) {
  if (![ordered, allocated, received].every(Number.isSafeInteger) || ordered < 1 || allocated < 0 || received < 0 || received > allocated || allocated > ordered) throw new Error("Invalid receiving quantities.");
  return { ordered, allocated, received, unallocated: ordered - allocated, outstanding: ordered - received, status: received === 0 ? "not_received" : received === ordered ? "fully_received" : "partially_received" };
}
