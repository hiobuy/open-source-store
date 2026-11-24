# Cancellation and Interception

> Status: Implemented

## Purpose

Abort a shipment before warehouse packing, or request HioBuy to intercept a shipment after it is awaiting dispatch or has already been shipped. Interception does not replace the shipment's own lifecycle.

## Preconditions

In-app customer cancellation is only allowed when `can_cancel` is true and the local status is `CONSOLIDATING`. Once packing begins, the endpoint returns a `CANCEL_NOT_ALLOWED` error.

Remote cancellation is only allowed for HioBuy statuses `PENDING` or `WAIT_PAYMENT`.
Remote interception is only allowed for HioBuy statuses `WAIT_SHIP` or `SHIPPED`.

## Workflow Steps

### Customer Cancellation

1. The customer calls `POST /api/shipments/:id/cancel` (`cancelShipment` in `server/data.ts`).
2. The local status changes to `CANCELLED`. Linked packages that are still `CONSOLIDATED` revert to `RECEIVED` and `AVAILABLE`.
3. `noteShipmentCancelled` is executed.
4. If no `hiobuy_shipment_id` exists, unsynced creation tasks are marked as `skipped`.
5. If the remote status is `PENDING`, `WAIT_PAYMENT`, or still empty, a `shipment_cancel` task is enqueued.
6. If HioBuy has already moved past the payment stage, the cancellation task is set to `needs_review` and will not be sent as a standard cancellation.

The cancellation request body must include `cancel_reason`, which the client sends via `cancelFulfillmentShipment`.

### Admin Interception

1. Call `POST /api/admin/shipments/:id/intercept` with a reason and notes.
2. The server calls `POST /v1/fulfillment/shipments/{id}/intercept`.
3. On success, only `interception_status=REQUESTED` is set, while `upstream_status` remains `WAIT_SHIP` or `SHIPPED`.
4. The next time a detail pull includes an interception status, `PROCESSING`, `INTERCEPTED`, or `FAILED` is synced and written.

## HioBuy API

- `POST /v1/fulfillment/shipments/{id}/cancel`
- `POST /v1/fulfillment/shipments/{id}/intercept`

Official interception error codes include `SHIPMENT_NOT_FOUND`, `SHIPMENT_NOT_INTERCEPTABLE`, and `SHIPMENT_INTERCEPTION_ALREADY_REQUESTED`. When interception is rejected, this application passes through the upstream error message without modifying the shipment status.

## Local Data

- Cancellation: `shipments.status=CANCELLED`, clears package locks, updates creation or cancellation tasks
- Interception: Updates only `shipments.interception_status`, plus a sync attempt record

Neither path automatically refunds the customer's wallet. Refunds are a separate admin action; see [Exceptions and Refunds](exceptions-refunds.md).

## HioBuy Status

Cancellation targets `PENDING` and `WAIT_PAYMENT`, with the final status being `CANCELLED`.
Interception keeps the lifecycle at `WAIT_SHIP` or `SHIPPED` until a subsequent status pull reports a change.

If the stored status has already passed `WAIT_PAYMENT` but a status pull reports `CANCELLED`, it transitions to Needs review.

## Failure Handling

If HioBuy rejects interception, `UPSTREAM_ERROR` is returned and the interception status remains unchanged. Customer cancellations that cannot be synced upstream stay locally cancelled and remain in "Needs review". Never delete the HioBuy shipment ID in an attempt to "retry creation".

## Related Code

- `cancelShipment` in `server/data.ts`
- `noteShipmentCancelled` and interception handlers in `server/fulfillment-sync.ts`
- `cancelFulfillmentShipment` and `interceptFulfillmentShipment` in `server/services/hiobuy/fulfillment.ts`
- `interceptionDisplay` in `src/domain/status.ts`
