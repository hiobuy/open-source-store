# Customer Payment

> Status: Implemented

## Purpose

Collect USD shipping payments from customers into this application. This payment flow does not call HioBuy's payment endpoint.

## Preconditions

- The shipment's local status is `TO_PAY`.
- A `DUE` shipping charge item already exists. This charge is converted to USD and written by this application after HioBuy enters `WAIT_PAYMENT` and returns the payable CNY amount.
- The checkout has not expired (`appConfig.checkoutTtlMs`).

`WAIT_PAYMENT` on HioBuy indicates that the warehouse has finished packing and is awaiting fulfillment freight payment; by itself, it does not prove that the customer has not paid.

## Workflow Steps

1. The `shipment.ready_for_payment` webhook or a shipment detail pull executes `readyForPaymentDecision`.
2. For shipments still in consolidation, the server replaces the estimated freight with a `DUE` charge, sets the local status to `TO_PAY`, and sets the upstream status to `WAIT_PAYMENT`.
3. The customer initiates checkout: first calling `POST /api/checkout`, then calling `POST /api/checkout/:id/pay` (wallet payment) or `POST /api/checkout/:id/stripe`.
4. Wallet payment deducts the `wallets` balance in a single compare-and-set update, marks the charges as `PAID`, marks the checkout as `PAID`, and sets the local shipment status to `READY_TO_SHIP`.
5. If HioBuy is connected, the same update sets `upstream_status` to `WAIT_PAYMENT`; if not connected, the code writes `WAIT_SHIP` locally. Neither write pays HioBuy.
6. `recognizeCheckoutPayment` records the profit snapshot; `recordWalletShipmentPayment` inserts a `payments` record with `hiobuy_status=pending`.
7. `queueShipmentPayments` enqueues `shipment_pay` with `waiting` status and the reason `"Waiting for an admin to pay HioBuy."`.

Stripe shipment checkout is only settled after the webhook reports `payment_status=paid`. The return page is for display only and does not credit the wallet on its own.

## HioBuy API

The customer payment path does not call any HioBuy API.

The payable amount comes from `amount_due` / `total.payable` (CNY fen) in the earlier shipment details. See [HioBuy Freight Payment](hiobuy-pay.md).

## Local Data

- `wallets.balance_fen` deducted by the USD total
- `wallet_transactions` with type `SHIPMENT_PAYMENT`
- `charges.status=PAID`, `checkouts.status=PAID`
- `shipments.status=READY_TO_SHIP`
- `payments.hiobuy_status=pending`
- `shipment_earnings` snapshot

Payment requests carrying an idempotency key return the same checkout result without double charging.

## HioBuy Status

This step does not change HioBuy status. While the customer has completed payment, HioBuy's `payment_status` can still be `UNPAID` and its lifecycle can still be `WAIT_PAYMENT`.

The client UI displays this combination as Payment Received (see `customerShipmentDisplay` in `src/domain/status.ts`). The admin console's payment column simultaneously shows customer paid and HioBuy unpaid; this combination is expected behavior.

Subsequent status pulls will not revert a paid shipment back to `TO_PAY` solely because the remote status is still `WAIT_PAYMENT`.

## Failure Handling

| Error Code | Meaning |
| --- | --- |
| `INSUFFICIENT_BALANCE` | Insufficient customer USD wallet balance; HioBuy is not involved |
| `CHECKOUT_EXPIRED`, `CHECKOUT_CLOSED`, `CHECKOUT_CHANGED` | Bill reconciliation required; no deduction occurred |
| `SHIPMENT_NOT_PAYABLE` | Local status is not `TO_PAY` |
| `ready_for_payment` amount mismatch | The `shipment_refresh` task enters Needs review, preserving the original payable amount |

Subsequent HioBuy payment failures will not charge the customer again.

## Related Code

- `payCheckout`, `createCheckout` in `server/data.ts`
- `readyForPaymentDecision` in `src/domain/fulfillment-sync.ts`
- `recognizeCheckoutPayment` in `server/earnings.ts`
- `recordWalletShipmentPayment`, `handleStripeWebhook` in `server/payments.ts`
- Pages: `src/app/(site)/(storefront)/member-center/shipments/checkout/[id]` (storefront), `src/admin/pages/AdminPayments.tsx`


## Procurement Card Payment

Procurement bills also support Stripe Checkout, including supplement bills for manual orders. The server freezes the unpaid bill amount and settlement currency; verified Stripe payment receipts atomically update the bill's `paidCents`, payment records, and coupon redemptions without touching the wallet or HioBuy. An active card payment session blocks concurrent wallet payments and bill cancellations. For endpoints, recovery flows, migrations, and required webhook events, see [Procurement API Integration](purchase-api.md#procurement-bill-stripe-payment).
