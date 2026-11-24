# Demo Admin Mode

> Status: Implemented

Demo Admin allows signed-in customers to browse the existing admin console pages backed by a fixed fictional dataset. It is strictly for product preview—it is not a real admin role and never reads or mutates the real business database.

An official demo site should be deployed on a dedicated Worker and a dedicated D1 database. Production deployments serving real customers should keep this mode turned off.

## How to Enable

The server decides whether Demo Admin is enabled by reading the `DEMO_MODE` environment variable. Its value must be the exact string `true`; any other value (including unset) leaves the mode disabled, and frontend flags cannot turn it on.

```bash
DEMO_MODE=true
# Optional. Defaults to https://github.com/hiobuy/forwarding when unset.
GITHUB_REPO_URL=https://github.com/hiobuy/forwarding
```

`GITHUB_REPO_URL` takes effect only if it matches `https://github.com/owner/repo`; trailing slashes are stripped automatically and invalid values are ignored. When unset, the link defaults to `https://github.com/hiobuy/forwarding`.

`wrangler.jsonc` does not set `DEMO_MODE` by default, so it stays off unless explicitly enabled. For local development (read by the API Worker), put it in the untracked `.dev.vars` file (see `.dev.vars.example`). On a deployed Worker, manage the toggle via a secret so it is never committed to the repository:

```bash
npx wrangler secret put DEMO_MODE --env production -c wrangler.jsonc   # enter: true
npx wrangler secret delete DEMO_MODE --env production -c wrangler.jsonc # turn back off
```

Do not also add `DEMO_MODE` under `vars` in `wrangler.jsonc`; Cloudflare rejects a secret with the same name as an existing environment variable.

Restart `npm run dev:api` after changing the variable, and verify using the public status endpoint:

```bash
curl http://127.0.0.1:8787/api/demo/status
```

When disabled, the response body is `{ "data": { "enabled": false, "githubUrl": null } }`.

## Who Can Access It

| Visitor | UI and Behavior |
| --- | --- |
| Unauthenticated visitor opening `/admin/demo` | Redirects to `/admin/login?next=/admin/demo` and returns after sign-in |
| Signed-in user when mode is enabled | Opening `/admin/demo` enters the preview directly; the storefront has no button linking to it, so share the URL directly |
| `owner`, `manager`, or `support` | Visiting `/admin/demo` still shows only the sample dataset; their normal console is `/admin` |
| Any user when mode is disabled | Visiting `/admin/demo` displays a notice that Demo Admin is disabled; demo data endpoints return 404 |

The staff sign-in page preserves the `next` parameter only for `/admin/demo` and `/admin/invite`. The former "Try Admin Demo" and "Admin demo" buttons lived in the removed legacy customer portal and are not part of the storefront.

## What the Preview Includes

`/admin/demo` reuses the admin console's layout, sidebar, and page components with a compact top banner:

`Demo Mode — Sample data only. Changes are not saved.`

The banner also includes a link back to the storefront homepage (`/`) and, when `GITHUB_REPO_URL` is valid, a link to GitHub.

| Section | Route | Available Features |
| --- | --- | --- |
| Overview | `/admin/demo` | Customer count, package count, shipment count, wallets, earnings, pending items, and fulfillment stats |
| Packages | `/admin/demo/packages` | List, search, status filters, details, and sample sync logs |
| Shipments | `/admin/demo/shipments` | List, search, filters, details, customer payment, HioBuy payment, and sample profit |
| Customers | `/admin/demo/users` | Fictional customer profiles along with their packages, shipments, and wallet ledgers |
| Payments | `/admin/demo/payments` | Sample payment, top-up, and refund records |
| Earnings | Overview gross profit module | Revenue, HioBuy cost, and margin calculated from the same sample shipments |
| Calculator | `/admin/demo/calculator` | Quotes by weight, country, and goods type using local sample rates only |
| Settings | `/admin/demo/settings` | Business info, integration, destinations, pricing, HioBuy wallet, email, payments, and team |
| Developer Guide | `/admin/demo/guide` | Same Developer Guide as the production admin console, plus HioBuy API documentation links |

Search and filters operate on the sample dataset. Markup percentage, flat markup, and exchange rate can be adjusted temporarily in the browser and reset to 15%, ¥5.00, and 7.2000 CNY/USD on page reload. Every calculator result displays:

`Sample rates — Not live shipping quotes`

## Sample Dataset

The sample dataset is generated in memory from a fixed random seed in `src/domain/demo.ts`, never read from D1, and remains identical across page reloads. The earnings reporting window is anchored to `2026-10-16T15:00:00.000Z` rather than the visitor's current date.

- 20 customers with member codes starting at `DM10001`
- 50 packages with public numbers starting at `DP24000`, covering the entire package lifecycle
- 20 shipments with public numbers starting at `HS78000`
- Every shipment links to real packages within the sample dataset
- Wallet deductions match the corresponding shipment's customer payment records
- HioBuy Pay statuses align with shipments ready to ship
- Gross profit is computed from shipment revenue and cost using the same earnings helpers as the real admin console
- Sync logs cover succeeded, failed, and pending states
- The sample company name on the settings page is Northwind Forwarding

The sidebar brand identity still reflects the current instance's public branding returned by `/api/branding`. On a dedicated demo instance, set that branding to whatever name you want visitors to see.

## Isolation Mechanism

Demo Admin uses the `demo` role—not `owner`, `manager`, or `support`—and never elevates a customer to any real admin role.

`/api/demo` is a standalone Hono app. While the demo shell is mounted, the browser rewrites `/api/admin/...` requests to `/api/demo/...` and stores demo query results in a separate cache. Leaving the demo shell stops rewriting immediately, so the real admin client behavior is unaffected.

The `demo` role can only read settings, payments, earnings, wallet, fulfillment, customer, package, and shipment data; it cannot write secrets, settings, business data, payments, shipments, packages, team members, or assistant replies.

Only `GET` requests are permitted, plus `POST /api/demo/calculator` for local rate estimates. All other write requests return:

`403 Demo mode is read-only. This change is not saved.`

When `DEMO_MODE` is not `true`, every demo route except `GET /api/demo/status` returns 404. Unauthenticated requests still pass through session middleware first, so unauthenticated data requests receive 401 before reaching demo routes; `GET /api/demo/status` is public.

The following actions remain disabled in the UI and are also rejected by the server:

- Saving or replacing the HioBuy API key, and calling HioBuy APIs
- Inbound pre-alerts, shipment creation, HioBuy Pay, cancellation, and interception
- Wallet top-ups, Stripe Checkout, bank transfer approval, and refunds
- Sending SMTP emails, inviting staff, changing roles, and delete actions
- Persisting business settings or uploading files

Disabled controls show a brief hint such as `Not saved in demo` or `HioBuy sync is off in demo`.

## Related Files

| File | Responsibility |
| --- | --- |
| `src/domain/demo.ts` | Fixed sample dataset and query helpers |
| `src/domain/demo.test.ts` | Tests for data consistency, search, quotes, and access rules |
| `server/demo.ts` | `/api/demo` routes and `DEMO_MODE` guard |
| `server/demo.test.ts` | Tests for disabled state, overview, and write rejection |
| `src/admin/lib/api.ts` | Rewrites admin API requests only while the demo shell is mounted |
| `src/admin/pages/AdminShell.tsx` | Demo route guard, banner, and link prefix |
| `src/admin/App.tsx` | Mounts the same admin pages under both `/admin` and `/admin/demo` |
| `wrangler.jsonc` | Does not set `DEMO_MODE` by default (disabled when unset) |

## Verification Checks

```bash
npx vitest run --config vitest.config.ts src/domain/demo.test.ts server/demo.test.ts
```

When enabled, confirm that `/api/demo/overview` returns 20 customers and 50 packages while `/api/admin/overview` continues to return real database figures. `POST /api/demo/shipments/:id/hiobuy-pay`, `PUT /api/demo/settings/api-key`, and `POST /api/demo/users/:id/wallet` must return 403. When disabled, those data routes must return 404 and the public status endpoint must return `enabled: false`.

## Known Limitations

- The initial version does not persist demo edits or simulate the full warehouse state machine.
- Sample rates must never be used for real orders.
- Staff accounts do not see a customer-side demo entry point, though they can still open `/admin/demo` directly when enabled and will likewise see only the sample dataset.
- Some write buttons shown in the real admin console for other permissions remain hidden because the `demo` role lacks those permissions; even if triggered outside the UI, the server rejects the write.
