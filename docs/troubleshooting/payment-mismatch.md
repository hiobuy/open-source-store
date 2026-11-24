# Payment Status Mismatch

> Status: Implemented

It is normal for the customer-side USD payment status and the HioBuy-side CNY payment status to differ temporarily. Treat it as an issue only when the rules below are violated.

## Expected Status Combinations

| Customer Side | HioBuy Lifecycle | HioBuy Payment Status | Meaning |
| --- | --- | --- | --- |
| Unbilled, local `CONSOLIDATING` | `PENDING` | `UNPAID` | The warehouse has not finished packing yet |
| Awaiting payment, local `TO_PAY` | `WAIT_PAYMENT` | `UNPAID` | Packing is complete; the customer has not paid this app yet |
| Paid, local `READY_TO_SHIP` | `WAIT_PAYMENT` | `UNPAID` | The customer has paid; staff have not paid HioBuy yet. UI label: Payment Received |
| Paid, local `READY_TO_SHIP` | `WAIT_SHIP` | `PAID` | HioBuy has been paid; awaiting dispatch |
| Paid, local `IN_TRANSIT` | `SHIPPED` | `PAID` | Dispatched |

`WAIT_PAYMENT` by itself never means "the customer has not paid." `WAIT_SHIP` is the lifecycle status for awaiting dispatch.

## Conflicts Already Guarded Against in Code

- Pulling `WAIT_PAYMENT` does not revert an already-paid shipment back to `TO_PAY` (see `applyShipmentRemote`).
- If the newly calculated payable USD amount disagrees with the current unpaid bill, it enters manual review (`readyForPaymentDecision` returns kind `review`) and the existing bill remains unchanged.
- If the shipment is already dispatched upstream before local payment, the system saves the upstream status `SHIPPED` and opens `shipment_refresh` for manual review without debiting the customer wallet.
- When HioBuy payment status is `PARTIAL`, initiating another HioBuy payment is rejected.
- Seeing `PAID` on HioBuy's side during a status pull does not credit or debit the customer wallet.
- A customer refund does not reset `hiobuy_payment_status` to `UNPAID`.

## What to Check

1. Customer-side `charges.status` and `checkouts.status`.
2. `payments.hiobuy_status` (`pending` until staff confirm payment to HioBuy).
3. `shipments.upstream_status` and `shipments.hiobuy_payment_status`.
4. The reason on the `shipment_pay` task.

If the customer has paid and the task shows it is waiting for staff action, the system state is consistent. Confirm HioBuy Pay—never refund the customer to try to "reset" the HioBuy status.

## Related Code

- `customerShipmentDisplay`, `customerPaymentLabel`, and `hiobuyPaymentLabel` in `src/domain/status.ts`
- `applyShipmentRemote` and `readyForPaymentDecision` in `server/fulfillment-sync.ts` and `src/domain/fulfillment-sync.ts`
