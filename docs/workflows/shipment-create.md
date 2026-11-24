# Shipment Creation

> Status: Implemented

## Purpose

Convert received packages, a shipping address, and a logistics channel into a local shipment, then request HioBuy to create a warehouse shipment.

## Preconditions

- Every selected package is eligible: `RECEIVED`, `NORMAL`, unlocked, no unresolved exceptions, and no unfinished local value-added services.
- The destination country/region is enabled.
- The quote ID matches the same package set and address and has not expired.
- HioBuy is connected. If not connected, a local shipment can still be created, but `shipment_create` will not be enqueued (`local_only`).

## Workflow Steps

1. The customer requests available routes via `POST /api/shipping/quotes`, and the server saves the result in `shipping_quotes`.
2. Consolidation is submitted via `POST /api/shipments`. Client-submitted prices are ignored, and the server re-runs `quoteForPackages`.
3. The server inserts a shipment with status `CONSOLIDATING`, copies the shipping address, saves channel information, and sets estimated freight as `ESTIMATED`.
4. Selected packages become `CONSOLIDATED` and `LOCKED`.
5. When `shipmentCreateReady` validation passes, `enqueueShipmentCreate` adds a `shipment_create` task.
6. The background task calls `POST /v1/fulfillment/shipments/create` and saves `hiobuy_shipment_id`. Upstream status starts as `PENDING`.

`shipmentCreateReady` requires a channel code, a complete shipping address, a remote package ID for every package, and remote package statuses all being `RECEIVED`. Otherwise, the task remains waiting with a recorded reason.

## HioBuy API

Calls `POST /v1/fulfillment/shipments/create` with an `Idempotency-Key`.

Official reference: [Shipments API](https://hiobuy.com/en/api-docs/fulfillment-shipments).

External reference: `shp_` plus the internal shipment ID.

## Local Data

- `shipments`, `shipment_packages`, `shipment_addresses`, `shipment_methods`, `charges`
- `packages.lock_status=LOCKED`, `package_status=CONSOLIDATED`
- `fulfillment_sync_tasks.action=shipment_create`

Status sync never creates remote shipments; creation is triggered exclusively through this consolidation workflow.

## HioBuy Status

Newly created shipments are in `PENDING` (displayed as Processing in the admin console). They do not transition to `WAIT_PAYMENT` until the warehouse finishes packing and returns the payable amount.

## Failure Handling

| Upstream Error Code | Local Outcome |
| --- | --- |
| `PACKAGE_ALREADY_CONSOLIDATED`, `PARCEL_NOT_FOUND`, `SHIPMENT_CREATE_EXCEPTION` | Needs review |
| Timeout | Retry without fabricating a remote ID |
| 409 with `existing_resource` | Adopted when external reference matches; otherwise Needs review |
| Package unlinked to remote or not yet received | Task stays `waiting`; local consolidation remains unchanged |

If the customer cancels the shipment before a remote ID exists, the creation task is marked as `skipped`. See [Cancellation and Interception](cancel-intercept.md).

## Related Code

- `createShipment` in `server/data.ts`
- `enqueueShipmentCreate` and callers of `shipmentCreateReady` in `server/fulfillment-sync.ts`
- `shipmentCreateReady`, `interpretShipmentCreate` in `src/domain/fulfillment-sync.ts`
- `createFulfillmentShipment` in `server/services/hiobuy/fulfillment.ts`
