# Production Go-Live Checklist

> Status: Partially Implemented

Build and deploy commands are ready, but customer payment methods, email delivery, and a real production warehouse must still be configured step by step. This checklist is derived from the current codebase; placeholder settings are not production-ready.

## Pre-Launch Preparation

1. Create a real D1 database and provide its `database_id` via a gitignored `wrangler.local.jsonc` (copied from `wrangler.jsonc`) or the `CLOUDFLARE_D1_DATABASE_ID` environment variable in CI, then apply remote migrations (`npm run db:migrate:remote`).
2. Create the R2 bucket `hiobuy-procurement-photos` (if renamed, update `wrangler.jsonc` to match).
3. Configure the following production secrets on the API Worker (always include `-c wrangler.jsonc`):

```bash
npx wrangler secret put BETTER_AUTH_SECRET --env production -c wrangler.jsonc
npx wrangler secret put ADMIN_EMAILS --env production -c wrangler.jsonc
npx wrangler secret put APP_URL --env production -c wrangler.jsonc
# Optional fallback; can also be saved encrypted in Settings -> Integration
npx wrangler secret put HIOBUY_API_TOKEN --env production -c wrangler.jsonc
```

4. `ENVIRONMENT` in production must be set to `production` so `/api/dev/mailbox` returns 404; also verify that `DEMO_MODE` is not enabled.
5. When deploying with `--env production`, redeclare `ai`, `durable_objects`, and `migrations` inside that environment block (top-level settings are not inherited automatically).
6. Deploy the two Workers in order: **run `npm run deploy:api` first, then `npm run deploy:web`** (the Web Worker depends on the `API` service binding pointing to the API Worker), and add Routes in the Cloudflare Dashboard for your custom domain: `<host>/api/*` and `<host>/agents/*` to the API Worker, and `<host>/*` to the Web Worker (`workers.dev` is disabled on the Web Worker).
7. Bind your real production warehouse developer code in the developer portal, then test `hio_live_*` in **Settings -> Integration**. WH-DEV is not a production warehouse.
8. Enable only the destination countries/regions you actually ship to in **Settings -> Destinations**.
9. Save your markup and exchange rate settings in **Settings -> Pricing** and the unified exchange rate settings. Existing shipments and purchase bills are not recalculated using new rates.
10. Configure Stripe or bank transfer accounts (multiple bank accounts supported) in **Settings -> Payments**. Customers cannot top up until at least one method is enabled.
11. Enter SMTP settings in **Settings -> Email**, or set the corresponding SMTP environment variables. Standard SMTP uses Workers `cloudflare:sockets`; sending to `smtp.mx.cloudflare.net` uses Cloudflare Email Sending (the `EMAIL` binding). "Accepted" only means the mail server accepted the delivery request, not that the email reached the inbox. Security emails continue to be sent even if the customer disables business notifications.
12. In **Settings -> Advanced**, configure numbering rules for member codes, package numbers, shipment numbers, and purchase order numbers before customers register. Enable Google sign-in (shared callback `<origin>/api/auth/callback/google`) or Turnstile (site key must include the storefront domain; production rejects Turnstile test keys) only after **Check Configuration** passes. If HioBuy Pay two-factor authentication (2FA) is enabled, every `owner` and `manager` executing payments must enroll an authenticator first. See [Advanced Settings](../customization/advanced-settings.md).
13. Point the HioBuy webhook to `https://<host>/api/webhooks/hiobuy` and save the signing secret in the fulfillment sync panel. Without a configured secret, this route returns 401. Webhooks do not replace manual pulls; seven event types are currently supported, and recent deliveries can be viewed under **Webhook Deliveries** in the same panel. See [Sync Tasks and Logs](../architecture/sync.md).
14. Point the Stripe webhook to `https://<host>/api/payments/stripe/webhook` (can be registered automatically from `APP_URL` when saving Stripe settings). Wallet credit occurs only when `payment_status=paid`, and duplicate event IDs are never credited twice.

## Known Limitations

- Available warehouse value-added services depend on the service catalog enabled by the upstream HioBuy warehouse.
- Commercial customs invoices are not generated automatically (planned).
- The HioBuy fulfillment wallet is read-only inside this app; top it up in the HioBuy portal.
- Webhooks cover major package and shipment events, but do not replace periodic or manual status pulls.
- The built-in quote rate limiter is scoped per Worker isolate rather than globally across the edge; add Cloudflare WAF / rate-limiting rules for public quote and auth routes.

## Related Code

- `wrangler.jsonc`
- `server/config.ts`
- `server/email/mailer.ts`
- `server/payments.ts`
