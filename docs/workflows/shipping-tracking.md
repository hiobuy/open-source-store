# Shipping and Tracking

> Status: Implemented

## Purpose

Display warehouse-dispatched shipment status, save carrier tracking numbers, and label scan tracking events for customers.

## Preconditions

- The shipment has a `hiobuy_shipment_id`.
- HioBuy freight payment has advanced it to `WAIT_SHIP`, or the warehouse dispatches the shipment from that status.
- The customer's USD payment record already exists. Dispatch events arriving before local payment permits shipping are marked as Needs review.

## Workflow Steps

1. Pull shipment details or receive a `shipment.dispatched` webhook.
2. When the customer has paid, `applyShipmentRemote` sets `upstream_status` to `SHIPPED` and local status to `IN_TRANSIT`.
3. Copies the tracking number from the payload. An empty remote tracking number does not clear an existing local tracking number.
4. Linked packages in `RECEIVED` or `CONSOLIDATED` status change to `SHIPPED`.
5. When opening a shipment, `readFulfillmentShipmentTracking` loads `GET /v1/fulfillment/shipments/{id}/tracking`. Event labels come from Settings -> Tracking (`src/domain/tracking-events.ts`).
6. Upon receiving a `shipment.delivered` webhook or pulling `SIGNED`, the local shipment status is set to `DELIVERED` and linked package statuses are set to `DELIVERED`.

Opening a shipment in `WAIT_PAYMENT` or later saves packing media (`PACKING_IMAGE`, `PACKING_VIDEO`) and `boxes`. List payloads do not include this data. Files whose type contains `VIDEO` are treated as videos.

## HioBuy API

- `GET /v1/fulfillment/shipments/{id}`
- `GET /v1/fulfillment/shipments/{id}/tracking`
- Webhooks `shipment.dispatched` and `shipment.delivered`

## Local Data

- `shipments.upstream_status`, `status`, `tracking_number`, `hiobuy_synced_at`
- `packages.package_status` on linked records
- `package_photos` and carton records from `boxes`
- Customer notifications `SHIPPED` and `DELIVERED`

## HioBuy Status

| HioBuy Shipment Status | Local Customer Status | Package Status |
| --- | --- | --- |
| `WAIT_SHIP` | `READY_TO_SHIP` if customer paid | `CONSOLIDATED` |
| `SHIPPED` | `IN_TRANSIT` | `SHIPPED` |
| `SIGNED` | `DELIVERED` | `DELIVERED` |

Package `DELIVERED` and shipment `SIGNED` are different status codes for the same physical delivery event. Never write `SIGNED` into `packages.package_status`.

## Failure Handling

When HioBuy reports dispatched before local payment permits shipping, `dispatchDecision` returns Needs review. Upstream status is still saved as `SHIPPED`, while the `shipment_refresh` task explains the conflict. The customer wallet is unaffected.

Tracking fetch failures preserve the existing tracking number.

## Related Code

- `applyShipmentRemote`, `applyDispatched`, `applyDelivered` in `server/fulfillment-sync.ts`
- `readFulfillmentShipmentTracking` in `server/services/hiobuy/fulfillment.ts`
- `src/domain/tracking-events.ts`
- Customer tracking page: storefront `src/app/(site)/(storefront)/member-center/shipments/[id]`
- Timeline: `src/domain/timeline.ts`, `src/admin/components/timeline.tsx`, `src/admin/components/carrier-tracking.tsx`
