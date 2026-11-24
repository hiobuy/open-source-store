# Payment Channels

> Status: Partially Implemented

Customer payment methods include Stripe Checkout, manual bank transfers, or demo top-ups. Paying HioBuy is not a customer payment channel—see [HioBuy Pay](../workflows/hiobuy-pay.md).

## Where to Configure

"Settings → Payments" (stored in `payment_settings`):

- Stripe publishable key, secret key, and test/live mode. Live keys cannot be saved in test mode. The webhook signing secret is registered automatically by the system and is never returned to the browser.
- Bank transfer instructions (supports configuring multiple receiving bank accounts for customers to choose from during checkout or top-up). Uploading a transfer proof does not credit the wallet immediately; an admin must review and approve it once.
- When neither method is enabled, the top-up page informs the customer that no payment method is available and credits no funds.

Stripe webhook receiver endpoint: `POST /api/payments/stripe/webhook`.

On every settings save, whenever a Stripe secret key is already saved or newly entered (including when saving with the secret input left blank), the server creates a replacement webhook endpoint. The server uses the public HTTPS `APP_URL` (not the browser origin) and the API version of the installed Stripe SDK. `localhost` and HTTP URLs cannot be registered; use a public HTTPS test deployment for end-to-end testing. The configured key must have permissions to manage webhook endpoints.

## Frontend Payment Return URLs

When creating a Stripe payment, clients may pass optional `successUrl` and `cancelUrl` in the JSON request body. There is no global admin setting for these. These browser redirect targets are independent of `APP_URL` and Stripe webhooks. Omitting either field keeps the built-in default redirect URL.

Supported endpoints:

| Endpoint | Other Required Body Fields |
| --- | --- |
| `POST /api/purchase-orders/:id/stripe` | `id`, `confirm`, `billVersion`, `amountCents` |
| `POST /api/checkout/:id/stripe` | None; empty body is still supported |
| `POST /api/wallet/top-up/stripe` | `amountFen` |

Example freight payment request body:

```json
{
  "successUrl": "https://client.example/payment/result?lang=zh",
  "cancelUrl": "https://client.example/payment/cancel"
}
```

If provided, each URL must be a non-empty, full HTTPS URL (HTTP is allowed only for `localhost`, `127.0.0.1`, or `::1` in development) without credentials, URL fragments, whitespace, or template placeholders. Both `null` and empty strings are invalid. Authenticated customers specify their own browser redirect targets; the server never fetches these URLs and never appends credentials.

The server preserves custom query parameters and overwrites the following reserved parameters with authoritative values:

| Parameter | Value Description |
| --- | --- |
| `purpose` | `purchase`, `shipment`, or `topup` |
| `result` | `success` or `cancel`; indicates browser redirect outcome only, not proof of settlement |
| `session_id` | Actual Stripe Checkout session ID substituted by Stripe on payment success |
| `orderId`, `billId`, `paymentId` | Included for procurement order payments |
| `checkoutId` | Included for shipment payments |

For example, passing `https://client.example/payment/result?lang=zh` for a procurement payment produces a return URL containing `lang=zh&purpose=purchase&orderId=...&billId=...&paymentId=...&result=success&session_id=...`. The frontend must authenticate as the customer and query `GET /api/purchase-orders/:id/stripe/:paymentId` for procurement payment status, or `GET /api/payments/stripe/session?session_id=...` for freight/top-up payment status. Returning immediately may catch the verified webhook still in flight, temporarily showing a `pending` status. Navigating to the cancel URL does not close or unlock a procurement payment; call the existing cancel endpoint when appropriate.

Procurement payment attempts freeze the generated success and cancel target URLs before contacting Stripe. Retrying with the same `paymentId` reuses the initially frozen target URLs even if the caller passes different URLs or omits them. Existing sessions keep their original redirect URLs; legacy payment attempts without a URL snapshot keep their saved origin. Migration `0030_amused_anthem.sql` has been applied locally; `0031_dashing_lilandra.sql` removed unused admin redirect columns while retaining URL snapshots on procurement payment attempts. Payment amounts, settlement statuses, and notification links remain unchanged.

Stripe reference docs: [Checkout Return URLs & Session ID](https://docs.stripe.com/payments/existing-customers?platform=web&ui=stripe-hosted).

Registered webhook events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, and `charge.dispute.closed`.

Registration records are persisted before contacting Stripe using a stable idempotency key. A failed registration does not alter active settings. The same save can be retried after network failures; if an unknown outcome remains unresolved for 23 hours, registration halts for manual review to avoid creating duplicate endpoints past Stripe's 24-hour idempotency window. Look up the request via `settings_operation` in endpoint metadata; if the signing secret can be recovered from the original Stripe response, restore it—otherwise delete the orphaned endpoint and the uncommitted `stripe_webhook_registrations` row before retrying. Never delete the row currently referenced by `payment_settings.stripe_webhook_registration_id`.

Payment settings and bank accounts switch atomically in a single D1 batch with a unique revision claim. Concurrent or stale saves return a conflict error prompting a refresh and retry. After a successful switch, the previous endpoint and its signing secret remain active for three days so Stripe can retry callbacks for earlier payments. Afterward, the existing Worker cron deletes only old endpoints previously auto-registered by this application using the original encrypted API key. Deletion failures appear on the settings page and are retried by cron or on the next save; event IDs continue to guarantee deduplication. Legacy manually configured endpoints lack a stored endpoint ID and cannot be auto-deleted—remove them manually in the Stripe Dashboard after the first successful auto-registration.

Official reference docs: [Create Webhook Endpoint](https://docs.stripe.com/api/webhook_endpoints/create), [Idempotent Requests](https://docs.stripe.com/api/idempotent_requests), [Delete Webhook Endpoint](https://docs.stripe.com/api/webhook_endpoints/delete).

Top-ups are credited only when `payment_status=paid`. Event IDs are persisted so retries never double-credit.

## Integrating Additional Payment Channels

There is currently no payment plugin registry. To add a new payment channel, create a server module alongside `server/payments.ts`, implement webhook verification that does not trust browser return pages, support idempotency keys, and add the corresponding value to `payments.method`. Never debit or mutate `wallets` from a React success page.

Never merge this balance with `GET /v1/fulfillment/balance`.

## Compatibility Notes

- All amounts are denominated in USD cents.
- Both wallet-paid and Stripe-paid shipments record `hiobuy_status=pending` in `payments`.
- Refund requests for unknown payment methods must fail closed. Currently supported branches are `stripe`, `wallet`, and `bank`.

## Related Code

- `server/payments.ts`
- `src/admin/pages/AdminPayments.tsx`
- Storefront wallet and payment pages: `src/app/(site)/(storefront)/(with-sidebar)/member-center/wallet`, `src/app/(site)/(storefront)/member-center/shipments/checkout/[id]`, `src/app/(site)/(storefront)/payment`
