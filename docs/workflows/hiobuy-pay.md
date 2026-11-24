# HioBuy Freight Payment

> Status: Implemented

## Purpose

Pay CNY fulfillment freight from the HioBuy wallet after the customer has paid this application. This action is confirmed by an admin; customer checkout never calls this endpoint.

## Preconditions

`hiobuyPayReady` requires all of the following conditions to be met:

- The customer has paid (status is `READY_TO_SHIP`, `SHIPPED`, `IN_TRANSIT`, `DELIVERED`, or a paid payment record exists).
- `hiobuy_shipment_id` is set.
- The remote lifecycle status is `WAIT_PAYMENT`.
- `hiobuy_payment_status` is neither `PAID` nor `PARTIAL`.
- A payable CNY amount is recorded. If the profit snapshot lacks a cost, the server fetches shipment details once first.
- The available balance in the fulfillment wallet is sufficient to cover the cost.
- There is currently no `shipment_pay` task in `syncing` status.

`WAIT_SHIP`, `SHIPPED`, or `SIGNED` are treated as already paid and will not trigger another payment call.

## Workflow Steps

1. After customer payment, `shipment_pay` is enqueued with `waiting` status.
2. An admin opens the shipment and confirms payment. `payHiobuyShipment` validates the quote and sets the task to `pending`.
3. The background task calls `POST /v1/fulfillment/shipments/{id}/pay` with the saved idempotency key.
4. On success, `hiobuy_payment_status` is updated to `PAID`; if HioBuy returns the corresponding status, upstream status transitions to `WAIT_SHIP`.
5. Payment List -> Retry calls `requeueHiobuyPayment`, which only resets the paid customer payment record to `hiobuy_status=pending` and still requires admin confirmation.

If a previous attempt timed out, the next confirmation fetches the shipment first. When HioBuy already shows `PAID`, `WAIT_SHIP`, `SHIPPED`, or `SIGNED`, only local records are updated and the payment endpoint is not called again.

## HioBuy API

`POST /v1/fulfillment/shipments/{id}/pay`

Official error codes handled in this codebase:

| Error Code | Handling |
| --- | --- |
| `SHIPMENT_ALREADY_PAID` | Treated as success; status becomes `WAIT_SHIP`; customer is not charged again |
| `SHIPMENT_NOT_READY_FOR_PAYMENT` | Retry later; warehouse is not ready yet |
| `INSUFFICIENT_BALANCE` | Failed; customer wallet is not deducted again |
| `404 NOT_FOUND` | Failed; linked shipment ID does not exist upstream |

The balance lookup endpoint is `GET /v1/fulfillment/balance`.

## Local Data

- `shipments.hiobuy_payment_status`
- `shipments.upstream_status`
- `payments.hiobuy_status` and `payments.hiobuy_error`
- `fulfillment_sync_tasks.action=shipment_pay`

`wallets` is not updated here, and `shipment_earnings` is not recalculated from the payment response.

## HioBuy Status

Before payment: lifecycle is `WAIT_PAYMENT`, payment status is `UNPAID`.
After payment: lifecycle becomes `WAIT_SHIP`, payment status becomes `PAID`.

`PARTIAL` blocks further payment attempts until manual review is completed.

## Failure Handling

When the HioBuy wallet balance is insufficient, it returns `"The HioBuy wallet does not cover this shipment."`. The customer remains in paid status. Top up the wallet in the HioBuy portal and confirm again.

An indeterminate timeout aborts the current batch, leaving subsequent shipments in that batch skipped and unpaid (`payHiobuyShipments`).

## Authenticator

In Settings -> Advanced -> Security, you can require a TOTP code or recovery code each time an admin confirms payment. The code is verified by `authorizeHiobuyPay` before `payHiobuyShipment`. Once verified, a `pay_grants` record is written for that staff member and shipment. This grant is valid for 2 minutes, can only be used once, and cannot authorize a second payment. When this toggle is enabled, batch payments are rejected. For setup, reset, and demo mode, see [Advanced Settings](../customization/advanced-settings.md).

When `DEMO_MODE=true`, execution returns early before calling the HioBuy payment endpoint. `processDueFulfillment` will not pay shipments whose task reason is not `admin_confirmed`.

## Related Code

- `hiobuyPayReady`, `interpretPayResponse` in `src/domain/fulfillment-sync.ts`
- `hiobuyPayQuote`, `payHiobuyShipment`, `queueShipmentPayments` in `server/fulfillment-sync.ts`
- `payFulfillmentShipment` in `server/services/hiobuy/fulfillment.ts`
- `server/pay-factor.ts`
