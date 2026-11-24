# Exceptions and Refunds

> Status: Partially Implemented

## Purpose

Record package issues that require a customer decision, and refund USD payments made by customers to this application. This repository does not create HioBuy return-to-seller shipments.

## Preconditions

Package condition and exception workflows are independent of the lifecycle. A package can be in both `RECEIVED` and `EXCEPTION` states at the same time. Unresolved exceptions block consolidation.

Refunds apply to `payments` records with status `paid` or `disputed`. Refunds do not reverse-call `/v1/fulfillment/shipments/{id}/pay`, nor do they call `/v1/fulfillment/returns`.

## Workflow Steps

### Exceptions

1. When a status pull reports item condition as `EXCEPTION` or a `package.exception` webhook is received, `condition_status=EXCEPTION` and `exception_status=ACTION_REQUIRED` are set.
2. When the package has no prior unresolved exception, the webhook inserts a `package_exceptions` record and notifies the customer.
3. The customer handles it on the package page, updating the local exception record. This action only records the exception decision locally.
4. Admin package and shipment details, as well as the client catalog endpoint, read enabled inbound and outbound value-added services from HioBuy. Catalog prices are denominated in CNY yuan. A read-only service request list probe separately reports provider availability. Existing local value-added service history records remain visible. See [Client Catalog Endpoint](../architecture/client-api.md#warehouse-value-added-service-catalog).

### Refunds

1. An admin initiates a refund in Payment Management; the amount cannot exceed the original payment amount minus any previously refunded amount.
2. Wallet payments refund the amount back to `wallets` and write to `refund_records`.
3. Stripe payments call `stripe.refunds.create`. Top-up refunds deduct the wallet balance first, and restore it if Stripe fails.
4. Bank refunds write a manual `refund_records` entry; top-up bank refunds likewise deduct the wallet balance.
5. When cumulative refunded amounts equal the original payment amount, `payments.status` becomes `refunded`.
6. If a shipping profit snapshot exists, profit adjustments are handled via `shipment_earning_adjustments` in `server/earnings.ts`. The same idempotency key is written only once.

## HioBuy API

Currently used:

- Item condition from package details, applied by status pulls
- Webhook `package.exception`

Not yet used:

- `POST /v1/fulfillment/returns` and confirmation or cancellation routes (Planned).
- `POST /v1/fulfillment/service-requests` (Planned).

## Local Data

- `packages.condition_status`, `packages.exception_status`
- `package_exceptions`
- `vas_requests` (for local value-added service records)
- `refund_records`, `payments.status`, `wallets` (for USD refunds)

Customer refunds do not change HioBuy's `payment_status`. If HioBuy was previously paid, the CNY balance remains spent and must be handled manually in the HioBuy wallet; this application does not automate that part.

## HioBuy Status

Exceptions do not set the package lifecycle to a special value. Return and disposal requests use `disposition` (`RETURN_REQUESTED`, `DISPOSAL_REQUESTED`) and block consolidation. `DISCARDED` is a lifecycle value reported by HioBuy. This application does not provide a button to call the disposal API.

## Failure Handling

Receiving another `package.exception` for a package already in `ACTION_REQUIRED` will not insert a duplicate exception record. Refunding an amount exceeding the remaining refundable balance returns `INVALID_STATE`. If a Stripe refund for a top-up fails, the prior wallet deduction is restored.

## Related Code

- `applyPackageException` in `server/fulfillment-sync.ts`
- `packageEligibility` in `src/domain/status.ts`
- `refundPayment` in `server/payments.ts`
- `server/earnings.ts`
- Admin payments page: `src/admin/pages/AdminPayments.tsx`
