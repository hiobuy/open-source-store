export function warehousePackageMatches(item: { displayStatus: { key: string }; conditionStatus: string; readyToShip?: boolean }, key: string) {
  if (key === "wait_ship") return ["received", "consolidated"].includes(item.displayStatus.key) && item.readyToShip === true;
  if (key === "all") return true;
  if (key === "in_warehouse") return ["received", "consolidated"].includes(item.displayStatus.key);
  if (key === "attention") return item.conditionStatus === "EXCEPTION" || item.displayStatus.key === "unclaimed";
  if (key === "exception") return item.conditionStatus === "EXCEPTION";
  return item.displayStatus.key === key;
}

export function warehousePackageLabel(status: { key: string; label: string }) {
  if (status.key === "pending") return "Awaiting warehouse receipt";
  if (status.key === "received") return "Received in warehouse";
  return status.label;
}

export function storageDurationDays(pkg: { packageStatus: string; receivedAt: string | null; shippedAt?: string | null }, now = Date.now()) {
  if (!pkg.receivedAt) return null;
  const end = pkg.shippedAt ? Date.parse(pkg.shippedAt) : ["RECEIVED", "CONSOLIDATED"].includes(pkg.packageStatus) ? now : NaN;
  const elapsed = end - Date.parse(pkg.receivedAt);
  return Number.isFinite(elapsed) && elapsed >= 0 ? Math.floor(elapsed / 86_400_000) : null;
}

export function receiptPlaceholder(status: string) {
  return status === "PENDING" ? "Not received yet" : "Time not recorded";
}
