# System Architecture

> Status: Implemented

The browser communicates only with this application on the same origin. HioBuy API keys never leave the API Worker.

```text
Browser / Client
  ├── /*                → Web Worker (Next.js 16 storefront, member center & /admin SPA)
  │                         └─ Product detail SSR → `API` Service Binding (API_INTERNAL_ORIGIN in dev)
  └── /api/*, /agents/* → API Worker (Hono + Better Auth + Cron)
                            → Domain rules (src/domain) & server logic (server)
                              → Cloudflare D1, R2, Durable Objects, Workers AI
                              → server/services/hiobuy    server-only calls to HioBuy
```

Successful JSON responses use `{ "data": {}, "requestId": "req_..." }`, and error responses use `{ "error": { "code", "message", "details" }, "requestId": "..." }`. The same request ID is returned in the `x-request-id` response header.

## Callers & Route Access

| Caller | Routes |
| --- | --- |
| Public | Storefront pages (`/`, `/categories`, `/search`, `/product/*`, `/freight-estimation`, `/blog/*`, `/help-center/*`), public freight calculator, public product categories/search, and published announcement endpoints |
| Authenticated customer | Storefront member center `/member-center/*`, `/cart`, `/checkout`, `/fill-and-buy`, `/payment/*`, and remaining `/api/*` |
| Staff | `/admin/*` and `/api/admin/*` (active staff only). Each route also enforces role permissions |
| Stripe | `POST /api/payments/stripe/webhook` (signature-verified, no session) |
| HioBuy | `POST /api/webhooks/hiobuy` (signature-verified, no session) |
| Development only | `GET /api/dev/mailbox`. Returns 404 when `ENVIRONMENT=production` |

`ADMIN_EMAILS` is used only to bootstrap the initial owner(s) when no owner exists yet. Afterward, "Settings → Team" governs the staff roster and roles (`owner`, `manager`, or `support`). Authenticated users who are not active staff see an explanatory notice when visiting `/admin` and receive 403 from admin APIs. Per-route permissions are defined in `src/domain/staff.ts`.

## Layers to Keep Separate

Pages (`src/app` for the storefront, `src/admin/pages` for the admin console) organize and render data. Eligibility checks, markups, exchange rates, selling prices, and profit calculations live in `src/domain` and execute on the server. Add corresponding tests under `npm run test` for any new domain functions.

Never recalculate prices in React components, and never call `api.hiobuy.com` directly from React.

## Related Pages

- [Responsibilities](responsibilities.md)
- [Data Model](data-model.md)
- [API Client](api-client.md)
- [Sync Tasks & Logs](sync.md)
- [Customer Wallet vs. HioBuy Wallet](wallets.md)
