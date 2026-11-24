# Duplicate Webhooks and Retries

> Status: Implemented

Two types of webhooks in this application can experience duplicate deliveries; they use different database tables and different signature verification mechanisms.

## HioBuy

`POST /api/webhooks/hiobuy` verifies `HioBuy-Signature` using the secret configured in `freight_policy`. If the secret is missing or the signature is invalid, the endpoint returns 401 and writes no data.

The event ID is the primary key of the `fulfillment_webhook_events` table. If that ID already exists and its status is not `failed`, the handler returns 200 immediately without reapplying the payload. Records with status `failed` can be reprocessed—this is the retry path.

`webhookDisposition` likewise rejects invalid signatures, ignores duplicate events, and ignores events with a stale status rank. All three outcomes are covered by tests in `src/domain/fulfillment-sync.test.ts`.

Currently handled event types are limited to `package.received`, `package.exception`, `shipment.ready_for_payment`, `shipment.dispatched`, `shipment.delivered`, `shipment.exception`, and `balance.low`. Other types are stored as processed without modifying any packages or shipments. To support additional types, extend `handleHiobuyWebhook`, and never reapply the same event ID.

Inbound pre-alert creation, shipment creation, and shipment payment requests also send an `Idempotency-Key`. Reuse that idempotency key only for the same logical request. When the outcome is unknown, query the remote shipment or package instead of generating a new idempotency key. According to the official documentation, duplicate conflict responses may include `error.details.existing_resource`.

## Stripe

`POST /api/payments/stripe/webhook` verifies `stripe-signature` and records the event ID. Duplicate deliveries will not credit the wallet again. Top-ups are credited only when `payment_status=paid`.

The checkout return page does not perform any wallet crediting; refreshing the page is safe.

## Customer-Side Retries

`Idempotency-Key` on shipment creation, wallet payment, and top-up endpoints returns the cached response directly. If the balance has changed, the wallet's compare-and-set (CAS) check rejects a second debit.

Sync retries use `nextRetryAt` with capped backoff. Manual retries are allowed for tasks in `failed` status whose error category is transient, rate limit, auth, unknown, or funds. Retrying a HioBuy payment will not charge the customer again.

## Related Code

- `handleHiobuyWebhook` in `server/fulfillment-sync.ts`
- `webhookDisposition` in `src/domain/fulfillment-sync.ts`
- `handleStripeWebhook` in `server/payments.ts`
- `idempotency_keys` in `server/db/schema/app.ts`
