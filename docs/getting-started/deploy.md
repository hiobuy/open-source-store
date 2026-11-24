# Deploy and Environment

> Status: Implemented

The application consists of two Cloudflare Workers sharing a single domain. The **API Worker** (`server/`, Hono, configured in `wrangler.jsonc`) serves `/api/*` and `/agents/*`, and owns D1, R2, and the AI assistant. The **Web Worker** (the Next.js app at the repository root, run by vinext, configured in `cloudflare.config.ts`, Worker name `hiobuy-procurement-website`) serves the storefront, member center, and `/admin` console. Data is stored in D1.

## First Local Run

Requires Node.js 22.12 or later.

```bash
npm ci
cp .dev.vars.example .dev.vars
openssl rand -base64 32
cp .env.example .env      # API_INTERNAL_ORIGIN used by Web Worker SSR
npm run dev:api           # Terminal 1: applies local D1 migrations, then starts the API Worker on 127.0.0.1:8787
npm run dev               # Terminal 2: Web Worker. Open the URL printed by vinext; admin is at /admin
```

`.dev.vars` requires at least the following:

```bash
BETTER_AUTH_SECRET=a long random string
# Promotes the initial owner account (the only staff member who registers on the storefront). Subsequent staff can only join via invite in Settings -> Team.
ADMIN_EMAILS=you@example.com
# Optional. A key saved on the Settings -> Integration page takes precedence over this environment variable.
# HIOBUY_API_TOKEN=
```

`npm run dev:api` runs database migrations before starting. Registration requires email verification; when SMTP is not configured, the dev mailbox writes verification links to `email_outbox`, readable via `GET /api/dev/mailbox?email=...` (available only in non-production environments).

The API Worker listens on `127.0.0.1:8787` (fixed by `dev:api`). The Web Worker uses the address printed by vinext. In development, Vite middleware (`apiDevProxy`) forwards all `/api/*` requests and HTTP requests to `/agents*` to the API Worker, so the browser sees a single origin (the storefront calls `/api/...` directly just like the admin console). Server-side rendered product pages reach the API Worker via `API_INTERNAL_ORIGIN` (`http://127.0.0.1:8787`) in `.env`. WebSocket upgrades are not proxied in development.

## Common Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Starts the Web Worker with vinext (storefront and `/admin`) |
| `npm run dev:api` | Runs local D1 migrations, then starts the API Worker on port 8787 |
| `npm run test` | Runs Vitest across `src/**/*.test.ts` and `server/**/*.test.ts` |
| `npm run typecheck` | Generates types first, then runs `tsc -p` for web, admin, worker, and node |
| `npm run lint` | Runs ESLint |
| `npm run db:generate` | Generates a Drizzle migration from schema changes |
| `npm run db:migrate` | Applies `drizzle/*.sql` to local D1 |
| `npm run db:reset` | Wipes local D1 and reapplies migrations |
| `npm run build` | Runs `build:web` (vinext) and `build:api` (dry-run bundle to `dist-api/`) |
| `npm run deploy:web` | Deploys the Web Worker (`vinext-cloudflare deploy`) |
| `npm run deploy:api` | Deploys the API Worker (`wrangler deploy --env production -c wrangler.jsonc`) |
| `npm run db:migrate:remote` | Applies `drizzle/*.sql` to the production D1 database |

After modifying the data model, add a new migration file instead of editing already-applied SQL files.

Workers Logs and Workers Traces are disabled in `wrangler.jsonc` (`observability.enabled`, `observability.logs.enabled`, and `observability.traces.enabled` are all `false`), and invocation logs are also turned off. Deploying this configuration applies those settings to the production Worker. Application audit records in D1 and persisted sync error logs remain available.

## Two Workers, One Domain

| Worker | Configuration | Served Paths |
| --- | --- | --- |
| API Worker | `wrangler.jsonc` (`env.production`), no static assets | `/api/*` and `/agents/*` |
| Web Worker | `cloudflare.config.ts`, `vite.config.ts`, `next.config.ts` | Everything else: storefront, `/member-center`, `/admin` |

The browser calls `/api/*` directly on its own domain, so the Cloudflare Routes below are the sole routing mechanism. The Web Worker also holds an `API` service binding pointing to the API Worker (`hiobuy-procurement`, matching the `env.production` name in `wrangler.jsonc`), which SSR uses to read product details while forwarding the customer's session cookie. No `.env` settings are needed in production: `API_INTERNAL_ORIGIN` is development-only and is not included in production builds. If you rename the API Worker, update `worker` in `cloudflare.config.ts` accordingly.

Add Cloudflare Routes on your custom domain as follows (Cloudflare selects the most specific route):

| Route | Worker |
| --- | --- |
| `example.com/api/*` | API Worker |
| `example.com/agents/*` | API Worker |
| All other paths (`example.com/*`) | Web Worker |

Deployment order: apply D1 migrations first (`npm run db:migrate:remote`), then run `npm run deploy:api`, and finally `npm run deploy:web`. The API Worker must already exist before deploying the Web Worker because the service binding references it. Both deploys modify production and require your own configured Cloudflare account.

The storefront and admin console share a single Google sign-in callback: `<origin>/api/auth/callback/google`. Register it in the Google Cloud console. See `docs/storefront.md` in this repository.

`env.production` in the repository's `wrangler.jsonc` is a HioBuy sample deployment (`workers_dev: true`, no `routes`, no `APP_URL`). Replace the D1 ID with your own, add routes in the Cloudflare Dashboard, and set `APP_URL` as a secret.

**Stale wrangler redirect.** Machines or CI runners that previously built the legacy Vite SPA may have a leftover `.wrangler/deploy/config.json` that causes bare `wrangler` commands to pick up the wrong config. The API scripts pass `-c wrangler.jsonc` to avoid this; delete any stale `.wrangler/deploy/` directory on those machines.

## Where Configuration Lives

| Setting | Location |
| --- | --- |
| Runtime environment | `vars.ENVIRONMENT` in `wrangler.jsonc`. Must be `production` in production |
| D1 database | Binding name `DB`. Replace `database_id` before deploying |
| Image storage | R2 binding name `PHOTOS`, bucket `hiobuy-procurement-photos` |
| AI assistant | `ai`, `durable_objects`, and `migrations`. The production environment block does not inherit top-level config automatically |
| Currency and TTLs | `appConfig` in `server/config.ts`. Customer-side currency is `USD` |

The following environment variables are optional and can be left blank if unused:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Customer Google sign-in. Both must be set; takes precedence over Settings -> Advanced |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Customer-side Turnstile bot verification. Both must be set; takes precedence over Settings -> Advanced |
| `CUSTOMER_AI_ENABLED` | Locks the customer AI assistant toggle when set to `true` or `false` |
| `APP_URL` (set as a secret in production), `BUSINESS_NAME`, `BUSINESS_EMAIL` | Default values used before Settings -> Business is saved |
| `TRUSTED_APP_ORIGINS` | Additional comma-separated origins allowed to be saved as the app URL in Settings -> Business |
| `PUBLIC_SITE_MODE` | Retained for compatibility (defaults to `integrated`, can also be `app-only`); read by the API Worker and returned by `GET /api/branding`. The current Next.js storefront no longer reads this value, and `/` is always the storefront homepage |
| `PUBLIC_WEBSITE_URL` | External marketing website URL used for the admin brand logo link, back links, and email footers; overridden by the value saved in Settings -> Business -> Public Website URL. When blank, no default domain is fabricated. Server-generated sign-in, password reset, welcome email (`/member-center`), staff invite (`/admin/invite?token=`), and Stripe default return URLs are maintained centrally in `src/domain/site.ts` and always point to the deployed app domain rather than the external website |
| `DEMO_MODE` | When set to `true`, sends only account-related emails via SMTP and blocks HioBuy Pay. Independent of `PUBLIC_SITE_MODE` |
| `SMTP_HOST` and other SMTP variables | Overrides the SMTP password and configuration saved in Settings -> Email |

For details on numbering rules, Google sign-in, Turnstile, and assistant toggles, see [Advanced Settings](../customization/advanced-settings.md).

Store secrets in `.dev.vars` or via `wrangler secret`. Never commit `.dev.vars`, `.env`, `.wrangler/`, `.cloudflare/`, `.vinext/`, `.next/`, `node_modules/`, `dist/`, or `dist-api/`.

## Related Code

- Storefront routes: `src/app`; Admin console routes: `src/admin/App.tsx`
- Customer API: `server/index.ts`
- Admin API: `server/admin.ts`

## Custom Domain Routing & Production Updates

`env.production` omits `routes` and `APP_URL` so custom domain routes are managed in the Cloudflare Dashboard and `APP_URL` is stored as a secret. Keep the placeholder production `database_id` (`00000000-0000-0000-0000-000000000000`) in the committed `wrangler.jsonc`; for your own production deployment, either copy `wrangler.jsonc` to `wrangler.local.jsonc` (gitignored) with your real D1 `database_id`, or pass `CLOUDFLARE_D1_DATABASE_ID` (and optional `CLOUDFLARE_API_WORKER_NAME` / `CLOUDFLARE_R2_BUCKET` / `CLOUDFLARE_D1_DATABASE_NAME`) in CI. `npm run deploy:api` and `npm run db:migrate:remote` run through `scripts/wrangler-api.mjs`, which resolves `WRANGLER_CONFIG` → `wrangler.local.jsonc` → env vars automatically and blocks accidental deploys against the placeholder ID. For the Web Worker, `cloudflare.config.ts` supports optional `WEB_WORKER_NAME` and `API_WORKER_NAME` overrides. Production uses its own `BETTER_AUTH_SECRET`, and the initial owner email is configured via the `ADMIN_EMAILS` secret.

Same-origin routing: manually add Routes for your custom domain (hereafter `<host>`) in the Cloudflare Dashboard rather than committing them to the repo. API Worker (`hiobuy-procurement`): `<host>/api/*`, `<host>/agents/*`; Web Worker (`hiobuy-procurement-website`): `<host>/*`. Because `/api/*` and `/agents/*` are more specific, they match the API Worker first while everything else routes to the Web Worker. When using Routes alone, the hostname also requires a proxied DNS record (for example, `AAAA <subdomain> -> 100::`, orange cloud).

Set the `APP_URL` secret (value `https://<host>`):

```bash
npx wrangler secret put APP_URL --env production -c wrangler.jsonc
```

Do not configure `APP_URL` as a plain dashboard variable: `vars` overwrites it on every deploy, whereas a secret persists.

Updating a production deployment (API Worker first, then Web Worker):

```bash
# Run only when new database migrations exist; verify the target database first
npm run db:migrate:remote
npm run deploy:api
npm run deploy:web
```

`deploy:api` already includes `-c wrangler.jsonc`; you do not need to set `CLOUDFLARE_ENV` or run a Vite build first.

In production mode the dev mailbox is disabled. SMTP, HioBuy integration, pricing, and payment methods must be configured directly on the live instance; local users, balances, orders, and encrypted settings are never uploaded automatically. Configure SMTP before completing email verification for the first admin account.
