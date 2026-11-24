import type { DisplayStatus } from "./status";
import { volumetricGrams } from "./units";

export const shipmentViewTabs = [
  { key: "all", label: "All shipment orders" },
  { key: "pending", label: "Processing" },
  { key: "customer_due", label: "Awaiting customer payment" },
  { key: "wait_payment", label: "Awaiting HioBuy payment" },
  { key: "wait_ship", label: "Shipment ready to dispatch" },
  { key: "shipped", label: "Shipped" },
  { key: "signed", label: "Shipment signed" },
  { key: "exception", label: "Exceptions" },
  { key: "cancelled", label: "Cancelled" },
] as const;

/** Display queue only: never changes the persisted lifecycle or payment eligibility. */
export function shipmentViewStatus(item: {
  status: string; hiobuyStatus?: string | null; hiobuyPaymentStatus?: string | null;
  interceptionStatus?: string | null; syncFailed?: boolean;
  charges: { status: string }[];
}): DisplayStatus {
  const remote = item.hiobuyStatus;
  if (item.status === "CANCELLED" || remote === "CANCELLED") return { key: "cancelled", label: "Cancelled", tone: "neutral" };
  if (item.syncFailed || ["INTERCEPTED", "FAILED"].includes(item.interceptionStatus ?? "") || item.hiobuyPaymentStatus === "PARTIAL") return { key: "exception", label: "Exceptions", tone: "danger" };
  if (item.status === "DELIVERED" || remote === "SIGNED") return { key: "signed", label: "Shipment signed", tone: "success" };
  if (["SHIPPED", "IN_TRANSIT"].includes(item.status) || remote === "SHIPPED") return { key: "shipped", label: "Shipped", tone: "info" };
  if (item.status === "TO_PAY" || item.charges.some(charge => charge.status === "DUE")) return { key: "customer_due", label: "Awaiting customer payment", tone: "warning" };
  if (item.status === "READY_TO_SHIP" && remote === "WAIT_PAYMENT" && item.hiobuyPaymentStatus !== "PAID") return { key: "wait_payment", label: "Awaiting HioBuy payment", tone: "warning" };
  if (item.status === "READY_TO_SHIP" && (!remote || remote === "WAIT_SHIP" || item.hiobuyPaymentStatus === "PAID")) return { key: "wait_ship", label: "Shipment ready to dispatch", tone: "success" };
  return { key: "pending", label: "Processing", tone: "info" };
}

export function packingVolume(item: { cartons: { lengthMm: number | null; widthMm: number | null; heightMm: number | null }[]; finalLengthMm: number | null; finalWidthMm: number | null; finalHeightMm: number | null }) {
  const boxes = item.cartons.length ? item.cartons : [{ lengthMm: item.finalLengthMm, widthMm: item.finalWidthMm, heightMm: item.finalHeightMm }];
  if (boxes.some(box => !validMeasurement(box.lengthMm) || !validMeasurement(box.widthMm) || !validMeasurement(box.heightMm))) return null;
  return boxes.reduce((sum, box) => sum + box.lengthMm! * box.widthMm! * box.heightMm!, 0) / 1_000_000_000;
}

function validMeasurement(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

/** Reference only, using the existing 5000 cm³/kg rule; never a billing input. */
export function packingChargeableWeight(item: Omit<Parameters<typeof packingVolume>[0], "cartons"> & { finalWeightGrams: number | null; cartons: { weightGrams: number | null; lengthMm: number | null; widthMm: number | null; heightMm: number | null }[] }) {
  if (packingVolume(item) == null) return null;
  if (item.cartons.length) {
    if (item.cartons.some(box => !validMeasurement(box.weightGrams))) return null;
    return item.cartons.reduce((sum, box) => sum + Math.max(box.weightGrams!, volumetricGrams(box.lengthMm!, box.widthMm!, box.heightMm!)), 0);
  }
  return validMeasurement(item.finalWeightGrams) ? Math.max(item.finalWeightGrams, volumetricGrams(item.finalLengthMm!, item.finalWidthMm!, item.finalHeightMm!)) : null;
}
