# Local development

How to run the project, where the code lives, and which layer to change when you extend it. Business boundaries are in [architecture.md](architecture.md). The [Developer Guide](guide.md) covers each workflow in detail and is also rendered at Admin → Developer Guide.

## Requirements

For mobile apps and external clients, see [Client API / App integration](architecture/client-api.md). After starting the server, visit `/api/docs` to browse endpoints and `/api/openapi.json` for the OpenAPI 3.1.1 specification.

- Node.js 22.12 or newer (required by the storefront toolchain)
- npm

Wrangler is a dev dependency, so no global install is needed. Local D1 lives in `.wrangler/`, which is not committed.

## First run

```bash
npm install
cp .dev.vars.example .dev.vars
openssl rand -base64 32   # paste into BETTER_AUTH_SECRET
cp .env.example .env      # API_INTERNAL_ORIGIN for the web Worker's server-side rendering
npm run dev:api           # terminal 1: API Worker on 127.0.0.1:8787
npm run dev               # terminal 2: web Worker (vinext). Open the URL it prints
```

The storefront calls `/api/*` on its own origin, and in development `apiDevProxy` forwards that to the local API Worker, so the storefront and the admin share one API, one database and one session. `API_INTERNAL_ORIGIN` in `.env` (`http://127.0.0.1:8787`) is only used by server-side rendering (product pages); plain HTTP is accepted for localhost only. You can register and sign in through the storefront's `/register` and `/login` against the local API. See [Storefront](storefront.md).

Minimum `.dev.vars`:

```bash
BETTER_AUTH_SECRET=a long random string
# Promotes the first owner. After that, Settings → Team manages staff.
ADMIN_EMAILS=you@example.com
# Optional. A key saved in Settings → Integration wins over this variable.
# HIOBUY_API_TOKEN=
```

`npm run dev:api` applies local D1 migrations first (`predev:api`), then runs the API Worker with `wrangler dev`. `npm run dev` runs the web Worker (storefront and `/admin`) with vinext; in development its `apiDevProxy` forwards all `/api/*` and HTTP requests to `/agents*` to `127.0.0.1:8787`. WebSocket upgrades are not proxied in development, so connect to the API Worker directly for the assistant. Every optional variable is listed in [`.dev.vars.example`](../.dev.vars.example) and [Deploy and environment](getting-started/deploy.md).

## Registration and the development mailbox

Registration needs an email, a name, and a password of at least 8 characters. The workspace opens after email verification. The welcome email is sent after verification, or right away for Google sign-in.

Without SMTP in development, verification and reset links are still written to `email_outbox`. Read them from the development mailbox (the storefront verify page no longer lists them):

```text
GET /api/dev/mailbox?email=you@example.com
```

This route returns 404 when `ENVIRONMENT=production`.

## Email

Workers cannot use Node's `net.Socket`, so SMTP runs over `cloudflare:sockets` with TLS or STARTTLS (and mail to `smtp.mx.cloudflare.net` uses the Cloudflare Email Sending `EMAIL` binding). Configure SMTP in Settings → Email or with environment variables. Environment variables win. The saved password is encrypted with `BETTER_AUTH_SECRET` and never returned to the browser. Rotating that secret means saving the password again.

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_ENCRYPTION=starttls   # or tls for implicit TLS on 465
SMTP_USERNAME=apikey
SMTP_PASSWORD=secret
SMTP_FROM_EMAIL=noreply@example.com
SMTP_FROM_NAME=HIOBuy
# SMTP_REPLY_TO=support@example.com
# APP_URL=https://example.com
```

Private network hosts are refused. Sent means the SMTP server accepted the message, not that it reached the inbox. Business mail is sent after the response, so it never blocks a package or shipment action.

## Customer payments

The customer wallet is USD and is separate from the HioBuy fulfillment wallet. Settings → Payments configures Stripe and one or more bank accounts. Keys are stored encrypted on the server. Test mode refuses live keys and the other way around.

Stripe uses hosted Checkout. The success page only shows the result. Money is credited by `POST /api/payments/stripe/webhook`. Point a Stripe webhook at that URL for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.dispute.created`, and `charge.dispute.closed`, and save the signing secret in settings. Only `payment_status=paid` credits the wallet, and an event id is applied once.

Card top-up is off until an operator enables it. A bank transfer adds balance only after an operator confirms it in Payments → Pending top-ups, once per request. A screenshot or reference number is not a receipt of funds. With neither method enabled, the top-up page asks the customer to contact support.

After a customer pays freight, paying HioBuy is a separate operator step (HioBuy Pay). A fulfillment failure never charges the customer again.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the web Worker (storefront and `/admin`) with vinext |
| `npm run dev:api` | Migrate local D1, then start the API Worker on port 8787 |
| `npm run test` | Vitest over `src/**/*.test.ts` and `server/**/*.test.ts` |
| `npm run typecheck` | Cloudflare and vinext type generation, then `tsc -p` for the web, admin, worker, and node projects |
| `npm run lint` | ESLint (ignores `server`, `src/admin`, `src/domain`, `src/mocks`, shared `src/types`, `drizzle`, `scripts`, `docs`) |
| `npm run build` | `build:web` (vinext) and `build:api` (dry-run bundle of the API Worker into `dist-api/`) |
| `npm start` | Preview the built web Worker |
| `npm run db:generate` | Generate a Drizzle migration from `server/db/schema` |
| `npm run db:migrate` | Apply `drizzle/*.sql` to local D1 |
| `npm run db:reset` | Wipe local D1 and migrate again. Accounts, packages, and the HioBuy connection are removed |
| `npm run deploy:web` | Deploy the web Worker (`vinext-cloudflare deploy`) |
| `npm run deploy:api` | Deploy the API Worker (`wrangler deploy --env production -c wrangler.jsonc`) |
| `npm run db:migrate:remote` | Apply `drizzle/*.sql` to the production D1 |
| `npm run cf-typegen:api` | Regenerate `worker-configuration.d.ts` from `wrangler.jsonc` |
| `npm run cf-typegen:web` | Regenerate the web Worker's Cloudflare types |

Tests use `vitest.config.ts`. Do not let tests load `vite.config.ts`, which carries the Cloudflare plugin.

There is no bare `deploy` script. Wrangler commands for the API Worker pass `-c wrangler.jsonc`. TypeScript is pinned to 5.9 (typescript-eslint needs <6.1) and `next-intl` to exactly 4.14.9 (4.15.3 breaks `vinext dev`).

After a schema change, run `npm run db:generate`, read the SQL, then `npm run db:migrate`. Never edit a migration that has already been applied anywhere.

History before v1.0.0 was squashed into `drizzle/0000_baseline.sql`. A database created before that squash cannot be upgraded in place: run `npm run db:reset` locally, and recreate a remote D1.

## Layout

```text
src/app                             Web Worker routes (Next.js App Router): storefront in (site), /admin entry
src/{components,lib,hooks,stores,i18n,config,content,assets}  Storefront code. messages/ and public/ belong to it
src/admin                           Operator console (React Router, own components and theme)
src/admin/App.tsx                   Admin routes (full /admin/... paths)
src/admin/pages                     Admin pages
src/admin/pages/guide               Developer Guide renderer (reads docs/ through sources.ts)
src/admin/shared                    Calculator, address, and purchase pieces shared inside the admin
src/admin/lib, src/admin/locales    Admin API client, auth, i18n, and translations
src/domain                          Testable money, status, quote, profit, and permission rules
server/index.ts                     Customer API and public calculator
server/admin.ts                     Admin API. Session, then staff role
server/data.ts                      Customer reads and writes
server/freight.ts                   API key, country switches, markup, and rate
server/calculator.ts                Quotes: open countries, markup, role-based field filtering
server/earnings.ts                  Freight snapshots, payment confirmation, refunds, and profit
server/hiobuy-ledger.ts             Read model for the fulfillment wallet
server/services/hiobuy              The only code that calls HioBuy
server/fulfillment-sync.ts          Notices, pulls, payment, cancel, intercept, and webhooks
src/domain/fulfillment-sync.ts      Pure rules for the above
src/domain/status.ts                Package and shipment labels
src/domain/guide.ts                 Developer Guide index
drizzle                             Committed D1 migrations
docs                                Markdown docs. The Guide renders the subfolders
```

Pages may arrange data. Eligibility, markup, rate, selling price, and profit live in `src/domain` and run on the server. Cover a new domain function with `npm run test`.

## Routes

The web Worker serves the storefront; the API Worker serves `/api/*` and `/agents/*` on the same origin. The old customer portal under `/app/*` no longer exists.

Public (storefront):

- `/` is the storefront home. `PUBLIC_SITE_MODE` is reported by the API but not used by the pages, and `PUBLIC_WEBSITE_URL` only changes the logo, return link, and email footer. See [Deploy and environment](getting-started/deploy.md).
- `/login`, `/register`, `/forgot-password`, `/auth/reset-password`, `/auth/confirm-email`

The signed-in customer center is under `/member-center`: warehouse and parcels, shipments (new, detail, checkout), wallet and top-up, purchase orders, profile and addresses, favorites, history, and inquiries. See [Storefront](storefront.md).

Staff sign in at `/admin/login` and accept invitations at `/admin/invite`.

The operator console is under `/admin` for active staff: overview, purchase drafts, packages, shipments, customers, marketing, payments, assistant, calculator, settings, and the Developer Guide at `/admin/guide`. `/admin/demo` is a read-only preview that only opens when `DEMO_MODE=true`.

## API

Apart from auth, health, the development mailbox, the Stripe and HioBuy webhooks, branding, and the public calculator, `/api/*` needs a session. `/api/admin/*` also needs a staff role with the route's permission. Webhooks check signatures instead of sessions.

Success is `{ "data": {}, "requestId": "req_..." }`. Failure is `{ "error": { "code", "message", "details" }, "requestId" }`. The id is also in `x-request-id`.

Main customer routes:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/warehouse` | Synced warehouse address. Empty until connected |
| `POST` | `/api/packages/prealert` | Pre-alert, up to 30 rows |
| `DELETE` | `/api/packages/:id` | Cancel and delete a `PENDING` package, withdrawing its HioBuy inbound notice |
| `POST` | `/api/shipping/quotes` | Consolidation quote for chosen packages and address |
| `POST` | `/api/shipments` | Submit a consolidation. The server recomputes the price |
| `POST` | `/api/checkout/:id/pay` | Pay from the USD wallet. A paid shipment is not charged again |
| `POST` | `/api/checkout/:id/stripe` | Freight Checkout. The amount comes from the server |
| `POST` | `/api/wallet/top-up/stripe` | Card top-up, when enabled |
| `POST` | `/api/wallet/bank-transfers` | Bank transfer request. Does not add balance by itself |

Calculators:

| Method | Path | Sees cost |
| --- | --- | --- |
| `GET` `POST` | `/api/shipping/calculator` with `/options` and `/channel` | No. Price, transit time, and channel notes only |
| `GET` `POST` | `/api/admin/calculator` with `/options` and `/channel` | Staff with `earnings.read` also get CNY cost and estimated profit. Other staff get the customer view |

Shipment creation and checkout payment accept `Idempotency-Key`. A repeat returns the first result. Stripe and bank top-ups are de-duplicated by event id and request id instead.

Customer amounts end in `Fen` and are US cents. HioBuy costs are CNY fen. Weight is grams. Dimensions are millimetres.

## Operator console

Put your email in `ADMIN_EMAILS`, restart, sign in at `/admin/login` (register first on the storefront `/register` if the account does not exist), and open `/admin`. You become the first owner. Staff accounts are invite-only: only this first owner registers on the storefront; invite everyone else from Settings → Team (they create their account at `/admin/invite`, and `/admin/login` has no sign-up link).

| Page | What it does |
| --- | --- |
| Overview | Customers, packages in stock, freight due, wallet totals, queues, HioBuy progress, freight profit |
| Shopping orders | Procurement orders, remote HioBuy submission/payment, reconciliation, cancellation, domestic tracking |
| Packages / Shipments | Filter by status, open a detail, inspect warehouse VAS catalog, act for the customer. Payment still uses the customer wallet |
| Customers / Customer addresses | Members, balances (manual adjustments require a reason), and customer address books |
| Announcements / Marketing | Multi-language announcements, coupons, and campaigns |
| Payments | Customer payments, multi-account bank top-up review, refunds, and disputes |
| Assistant | Publish official answers to questions the assistant could not answer |
| Calculator | The same quote as customers see, plus cost and estimated profit |
| Settings | Business, Integration, Client origins, Destinations, Pricing, Exchange rates, Product categories & pricing & search cache, HioBuy Wallet, Email, Advanced, Payments, Invoicing, Tracking, Team |

Settings notes:

- The API key is encrypted with `BETTER_AUTH_SECRET` in `freight_policy.api_key`, and only its last four characters are returned. `HIOBUY_API_TOKEN` is the fallback. After rotating `BETTER_AUTH_SECRET`, save the key again.
- Destination switches are local. A country sync keeps existing switches.
- Pricing is one markup percentage, one fixed CNY amount, and one exchange rate for every channel.
- HioBuy Wallet is read-only.

`POST /api/admin/settings/sync/warehouse` calls `GET /v1/fulfillment/locations`. `POST /api/admin/settings/sync/channels` calls the channel list. A key without warehouse mode fails the sync, and the page shows the upstream error instead of a placeholder address.

## Signed-in assistant

The assistant lives at `/agents/forwarding-assistant/{user id}`. `server/index.ts` requires that id to be the current user. The model is Workers AI `@cf/zai-org/glm-4.7-flash`. `wrangler.jsonc` sets `ai.remote` to `true` for local development.

Pre-alert, claim, consolidation submit, and consolidation cancel ask the customer to confirm first. Payment and top-up only open the page. The assistant does not submit warehouse value-added service requests directly. Policy questions it cannot answer go to `assistant_unanswered`. Once an operator publishes an answer at `/admin/assistant` into `assistant_knowledge`, later replies use it.

Freight estimates call `calculateRates` in `server/data.ts`, which uses the same live quote and markup as the calculator. Tracking only reads the current customer's own shipments, matched by tracking number or `SHP-` number.

## Configuration

`wrangler.jsonc`:

| Key | Notes |
| --- | --- |
| `vars.ENVIRONMENT` | `production` in the production env block |
| `d1_databases[0]` | Binding `DB`, database `hiobuy-procurement`. Use your own `database_id` |
| `ai` and `durable_objects` | Signed-in assistant. An env block does not inherit them from the top level |
| `r2_buckets[0]` | Binding `PHOTOS`, bucket `hiobuy-procurement-photos` |

`appConfig` in `server/config.ts` holds the currency, free storage days, and quote and checkout expiry. The customer currency is `USD`.

Before a production deploy, follow the [Production checklist](getting-started/production.md).

## Where to change

### Admin list pagination and scrolling

Purchase orders, warehouse packages and logistics orders share `AdminListViewport` and `AdminPagination` in `src/admin/pages/AdminListLayout.tsx`. Filters and pagination stay outside the scroll region; table headers stick within it. The list height is `clamp(20rem, 56dvh, 46rem)`, with horizontal scrolling on narrow screens. Pagination/filter changes reset vertical scroll and selected rows. Empty and failed queries retain the footer; controls are disabled while loading or on error.

The UI defaults to 20 records and supports 5, 10, 20, 25 and 50 per page. The packages and shipments admin GET endpoints accept `pageSize`; omitted/unsupported sizes retain the previous API default of 25. Invalid page values normalize to 1, and pages past the filtered result set clamp to its final page. Demo lists use the same rules. `src/domain/admin-pagination.ts` owns normalization and page-number windows. Existing batch synchronization and HioBuy shipment payment limits remain 25 records, independently of the selected page size. No database migration or customer frontend change is required.

### Shipment measurements, margin and event times

Admin shipment list/detail responses expose `hiobuyOrderSn` from the existing fulfillment task's `remoteSecondary` (HioBuy `order_sn`), matched to the currently linked remote shipment ID. The UI shows this serial, not `hiobuyShipmentId`; missing or conflicting serials show pending sync. The resource ID remains unchanged for API calls.

The admin shipment list and drawer share `ShipmentViewParts`. Total volume sums complete packed-carton dimensions in m³; reference chargeable weight sums each carton's greater actual weight or volumetric weight at the existing 5000 cm³/kg divisor. This reference never determines billing. Missing, zero or partial measurements remain unavailable, with an explanation; source-parcel dimensions are not treated as final multi-parcel packing dimensions.

Pending orders may display the existing snapshot's estimated profit. For legacy paid USD checkouts whose earnings snapshot lacks payment recognition, `earningViewsFor` uses a single confirmed `PAID` checkout item as read-only payment evidence. It preserves the historical cost, exchange rate and adjustments, does not sum ambiguous duplicate receipts, and never charges or writes back money. This display fallback does not repair the separate earnings-summary ledger.

Migration `0034_tidy_warbound.sql` adds `shipment_milestones`. Existing HioBuy detail refresh/status synchronization saves documented `SHIPMENT_PACKED`, `SHIPMENT_PAID` and `SHIPMENT_DISPATCHED` timeline timestamps. Only timezone-aware event times are accepted. Partial, repeated or out-of-order responses retain the earliest known event per kind. Lists prefer these event times over successful local synchronization attempts; customer payment time comes from customer payment evidence, never HioBuy payment. Older shipments acquire event times on their next sync/detail refresh; no remote request is added per list row. Missing times display `暂无` in Chinese.

### Business modules

- Selling price or profit formula: `src/domain/freight.ts` or `src/domain/earnings.ts`, with tests. Historical shipments keep reading `shipment_earnings`. Do not recompute them from current settings.
- Calculator: request handling and field filtering are in `server/calculator.ts`. Upstream calls stay in `server/services/hiobuy/`. Public responses never include cost.
- Which countries can ship: `freight_areas.enabled`, managed in Settings → Destinations. Quotes and new shipments both respect it.
- Pages: storefront in `src/app` and `src/components`, admin in `src/admin/pages`. Do not write a second price calculation for display.
- Tables: `server/db/schema`, plus a new migration.
- A new HioBuy endpoint: confirm the path and fields in the official docs, add a function in `server/services/hiobuy/`, and expose it from `server/admin.ts` or `server/index.ts` by role. Never call `api.hiobuy.com` from React.
- Staff permissions: `src/domain/staff.ts`. Every new admin route needs a rule there.
- Assistant tools: `server/assistant.ts`. Do not treat one user's chat as a site-wide answer.
- Developer Guide pages: add the Markdown under a `docs/` subfolder and an entry in `src/domain/guide.ts`.

Purchase drafts and marketing configuration are persisted through the APIs documented in [operations.md](workflows/operations.md). Apply migration `0005_procurement_marketing.sql` locally before using these modules. Standard purchase checkout and coupon redemption are now connected; see [purchase-api.md](workflows/purchase-api.md). Campaign attribution is not connected.

Migration `0006_faithful_carmella_unuscione.sql` adds independent product pricing and purchase bill snapshots. Configure product pricing in Admin Settings, then confirm purchase costs and preview/issue a bill in the purchase draft details. Bills can be voided with a reason; issuance does not debit wallets. Historical pricing stays unchanged. Run `npm run db:migrate` to apply pending local migrations.

Migration `0007_sloppy_wrecker.sql` adds item/package links, cumulative receiving reconciliation, aftersales cases and immutable handling events (three tables). The order detail UI uses `/api/admin/procurement/:id/tracking` and `/package-options`. These merchant records do not mutate package lifecycle, shipment eligibility or money. Apply pending local migrations before opening order details; see [operations.md](workflows/operations.md) for command payloads, concurrency and status rules.
