import type { AdminShipment } from "./shared";
import type { Shipment } from "../../types/api";
import type { DisplayStatus } from "../../domain/status";

export type ShipmentView = AdminShipment & {
  hiobuyOrderSn?: string | null;
  viewStatus?: DisplayStatus;
  syncFailed?: boolean;
  times?: { packedAt: string | null; hiobuyPaidAt: string | null; shippedAt: string | null };
};
export type ShipmentDetailView = ShipmentView & Pick<Shipment, "photos" | "timeline"> & {
  services?: { id: string; packageId: string; serviceName: string; status: string; note: string | null; completedAt: string | null }[];
};
