# Project Collaboration Guide

This file applies to the entire repository and is intended for AI coding assistants contributing to the codebase (the former `client/AGENTS.md` has been merged here and `client/` no longer exists). Always prioritize the user's current task; if a subdirectory has a more specific `AGENTS.md`, follow it within its scope. Keep code identifiers and existing product copy consistent with the repository's conventions.

## Project Scope & Tech Stack

HioBuy Store is a self-hosted, white-label cross-border shopping agent (procurement), parcel forwarding, and package consolidation platform. It is structured as a modular monolith intended for single-operator deployments; do not assume multi-tenant isolation.

- **Storefront & Member Center (Web Worker)**: Next.js 16 App Router run by vinext / Vite and deployed on Cloudflare Workers; TypeScript, Tailwind CSS v4, shadcn/ui, Zustand, next-intl. Browser code calls same-origin `/api/*` directly (same as the admin console); server-side rendering for product pages accesses the API via `src/lib/server/api.ts`.
- **Admin Console Frontend**: React, React Router, TanStack Query, and custom components/theme (`src/admin/`), mounted client-side through the Next.js `/admin` catch-all route.
- **Backend (API Worker)**: Hono on Cloudflare Workers, Zod validation, Better Auth authentication, and Cron triggers (`* * * * *` for cache/temporary-image/webhook cleanup, procurement polling, and fulfillment sync).
- **Data & Storage**: Cloudflare D1 + Drizzle ORM; R2 stores product, inbound warehouse, and uploaded proof images.
- **External Services**: HioBuy Fulfillment and Product/Procurement APIs, Stripe, and email delivery (SMTP / Cloudflare Email Sending).
- **Customer Assistant**: Cloudflare Agents, Durable Objects (`ForwardingAssistant`), and Workers AI.
- **Testing & Linting**: Vitest; ESLint and Prettier. Refer to `package.json` and `package-lock.json` for exact versions. TypeScript is pinned to `5.9` (`typescript-eslint` requires `<6.1`), and `next-intl` is pinned to exact version `4.14.9` (`4.15.3` breaks `vinext dev` with `getRequestConfig is not a function`). Do not upgrade them without explicit approval.

The deployment topology is **two Workers sharing one custom domain**: the **Web Worker** (Next.js app at repo root, configured in `cloudflare.config.ts`, Worker name `hiobuy-procurement-website`, `workersDev: false`) serves the storefront, member center, and `/admin` pages and reaches the API Worker on the server side via the `API` service binding; the **API Worker** (`server/`, configured in `wrangler.jsonc`, Worker name `hiobuy-procurement`, no static assets) serves `/api/*` and `/agents/*`. Custom domain routes (`<host>/*` vs `<host>/api/*` and `<host>/agents/*`) are managed in the Cloudflare Dashboard. The legacy `/app/*` customer portal, old marketing pages, and old `/auth/*` pages have been removed; customer routes live at `/member-center/...`, `/login`, `/register`, `/forgot-password`, `/auth/reset-password`, and `/auth/confirm-email`, while staff sign in at `/admin/login` and accept invitations at `/admin/invite`.

This application owns customers, staff, selling prices, procurement bills, customer payments, freight settlement, and profit records; HioBuy owns upstream product/procurement fulfillment, receiving, weighing, packing, storage, and international dispatch. Do not build this project as a warehouse management system (WMS).

## Before Starting a Task

1. Read the relevant code and adjacent tests. For background, consult `docs/development.md`, `docs/architecture.md`, `docs/storefront.md`, `docs/guide.md`, and the relevant workflow docs.
2. When code and docs disagree, treat the actual implementation as the source of truth and update the docs when changing behavior.
3. If Git metadata is present, inspect the working tree and preserve the user's existing changes. The directory may be a plain source copy—do not initialize a Git repository unprompted.
4. Keep changes tightly scoped. Do not opportunistically upgrade dependencies, reformat unrelated files, rewrite architecture, or fix unrelated issues. Briefly note out-of-scope risks if you spot them.

## Directory Layout & Responsibilities

| Path | Responsibility |
| --- | --- |
| `src/app/` | Web Worker Next.js routes: `layout.tsx` is the root layout (Poppins / Noto Sans Arabic fonts, next-intl, and `LocaleHydrator`); `globals.css` is the storefront stylesheet imported by `(site)/layout.tsx` (with `StorefrontBootstrap`) and `not-found.tsx`; `(site)/` contains the storefront (`(storefront)` and `(auth)` route groups); `admin/` is the admin entry (`layout.tsx` loads admin CSS, Inter, and admin fonts; `[[...path]]/page.tsx` client-mounts `src/admin/AdminRoot.tsx`) |
| `src/{assets,components,config,content,hooks,i18n,lib,stores,types}`, `messages/`, `public/` | Storefront code: shared UI (`components/ui` for shadcn), feature modules, fixed site config, local blog & help-center JSON, hooks, i18n, procurement API client (`src/lib/procurement/`) and server calls (`src/lib/server/`), Zustand stores; translations in `messages/*.json` |
| `src/admin/` | Admin frontend SPA: `App.tsx` (routes), `AdminRoot.tsx`, `pages/`, `components/`, `lib/` (api, auth, brand, download, i18n, utils), `locales/`, `shared/`, `auth/` |
| `src/domain/` | Testable pricing, money, permission, status, procurement, and sync rules; `src/domain/site.ts` centralizes server-generated page URLs (`sharedAppRoutes`, `authActionUrls`, `paymentReturnUrls`, `purchaseReturnUrls`, `staffInviteUrl`) |
| `src/types/{api,operations,admin-packages}.ts`, `src/mocks/` | Types and sample data shared with the API Worker (imported by `server/`); changes must consider both sides |
| `server/index.ts`, `server/admin.ts` | Public/customer API, admin API, middleware, and Cron entrypoints |
| `server/data.ts` | Customer forwarding and account reads, writes, and orchestration |
| `server/purchase*.ts`, `server/shopping*.ts`, `server/cart-*.ts`, `server/manual-purchase.ts`, `server/operations.ts`, `server/product-*.ts` | Product search/cache/categories/pricing, unified cart, catalog & manual purchase orders, procurement Stripe checkout, and fulfillment polling |
| `server/wallet.ts`, `server/payments.ts`, `server/stripe-webhooks.ts` | Customer wallet, payments, refunds, and payment webhooks |
| `server/freight.ts`, `server/calculator.ts`, `server/earnings.ts`, `server/exchange-rates.ts` | Freight policy, quote filtering, unified exchange rates, cost & profit snapshots |
| `server/fulfillment-sync.ts`, `server/warehouse-catalog.ts`, `server/warehouse-applications.ts` | Fulfillment tasks, status pulls, webhooks, retry orchestration, and warehouse value-added service catalog & applications |
| `server/client-api/` | External Client API Bearer auth, CORS allowlist (`clientCors`), OpenAPI spec, and docs |
| `server/email/`, `server/services/email.ts` | Email queue, template rendering, and SMTP / Cloudflare Email Sending delivery |
| `server/services/hiobuy/` | HioBuy HTTP integration boundary (fulfillment, product/procurement, warehouse services, wallet, quotes, and locations) |
| `server/db/schema/`, `drizzle/` | Database schema and versioned SQL migrations |
| `server/assistant.ts` | Customer AI assistant and its business tools |
| `wrangler.jsonc` | API Worker bindings, environments, Cron triggers, and config run/built directly by Wrangler (production `APP_URL` is managed via `wrangler secret`) |
| `cloudflare.config.ts`, `vite.config.ts`, `next.config.ts` | Web Worker config: Worker name, `ASSETS` and `API` service binding, `workersDev: false`, dev-only `API_INTERNAL_ORIGIN`; Vite plugins (svgr, vinext, `@cloudflare/vite-plugin`) and dev-only `apiDevProxy`; next-intl and 308 legacy redirects |

Server-generated page links (welcome emails, staff invites, Stripe default return URLs, etc.) are centralized in `src/domain/site.ts`: welcome → `/member-center`, staff invite → `/admin/invite?token=`, and Stripe default redirects (used only when the caller omits `successUrl` / `cancelUrl`) → `/member-center/...`. Notification `href` values (such as `/app/packages/:id`) are intentionally preserved API data mapped to member-center routes by `src/components/features/logistics/procurement-notifications.tsx`—do not rewrite them on the server.

Follow the existing layering for new features: UI & interaction → API validation & auth → business orchestration → domain rules, database, and external services. Keep domain rules free of React, network, or Worker dependencies; never duplicate authoritative pricing logic in the UI. When growing large files, extract focused modules rather than introducing new frameworks or microservices for small changes.

## Local Commands

Requires Node.js 22.12+ and npm with the existing lockfile. Use `npm ci` when installing dependencies; do not mix package managers.

| Command | Purpose & Notes |
| --- | --- |
| `npm run dev` | Starts the Web Worker (vinext). In dev, `apiDevProxy` forwards all `/api/*` and `/agents*` HTTP requests to `127.0.0.1:8787`; WebSocket upgrades are not proxied in dev |
| `npm run dev:api` | Runs `predev:api` (local D1 migrations), then starts the API Worker via `wrangler dev --port 8787 -c wrangler.jsonc` |
| `npm run typecheck` | Generates Worker and vinext route types, then runs `tsc -p` across `tsconfig.json` (storefront), `tsconfig.admin.json`, `tsconfig.worker.json`, and `tsconfig.node.json` |
| `npm test` | Runs Vitest with `vitest.config.ts` across `src/**/*.test.ts` and `server/**/*.test.ts` |
| `npm test -- src/domain/fulfillment-sync.test.ts` | Runs a single test file (replace with any target test path) |
| `npm run lint` | ESLint; ignores `server`, `src/admin`, `src/domain`, `src/mocks`, shared `src/types` files, `drizzle`, `scripts`, and `docs` |
| `npm run format` / `npm run format:check` | Prettier format / check; storefront scope only—do not bulk-format `server` or `src/admin` |
| `npm run build` | Runs `build:web` (vinext Web Worker build) and `build:api` (API Worker dry-run bundle to `dist-api/`, no deploy) |
| `npm start` | Previews the built Web Worker locally (`vite preview`) |
| `npm run db:generate` | Generates a Drizzle migration from schema changes; inspect the generated SQL |
| `npm run db:migrate` | Applies migrations to local D1 |
| `npm run cf-typegen:web` | Regenerates Web Worker Cloudflare binding types (`.cloudflare/types/`) |
| `npm run cf-typegen:api` | Regenerates API Worker types (`worker-configuration.d.ts`) after binding changes |
| `npm run db:reset` | Wipes and recreates local D1; destructive—requires user authorization |
| `npm run db:migrate:remote` | Applies migrations to remote production D1 via `scripts/wrangler-api.mjs` (uses `WRANGLER_CONFIG`, gitignored `wrangler.local.jsonc`, or `CLOUDFLARE_D1_DATABASE_ID`)—requires user authorization |
| `npm run deploy:api` | Deploys API Worker via `scripts/wrangler-api.mjs` (`--env production`)—requires user authorization; **must deploy before Web Worker** |
| `npm run deploy:web` | Deploys Web Worker (`vinext-cloudflare deploy`; supports optional `WEB_WORKER_NAME` / `API_WORKER_NAME`)—requires user authorization; depends on the deployed API Worker service binding |

Bare `deploy` / `preview` scripts no longer exist. Always pass `-c wrangler.jsonc` to API Wrangler commands: machines or CI environments that built the old SPA may have a stale `.wrangler/deploy/config.json` redirect causing bare `wrangler` to pick the wrong config—delete any stale `.wrangler/deploy/`. `typecheck` depends on route types generated by `vinext typegen` (such as `LayoutProps`); do not run bare `tsc` alone. Manage production `APP_URL` via `wrangler secret put APP_URL --env production -c wrangler.jsonc` so deploys do not overwrite it via `vars`. Production commands are not routine verification steps; database resets, remote migrations, deployments, and real charges require explicit user authorization (do not re-ask once clearly authorized).

Local development requires two terminals: copy `.dev.vars.example` to `.dev.vars` (at minimum set `BETTER_AUTH_SECRET`) and run `npm run dev:api`; then configure `API_INTERNAL_ORIGIN` in root `.env` (see `.env.example`, used only by product-page SSR) and run `npm run dev`, opening the URL printed by vinext (admin is at `/admin`).

Refer to `.dev.vars.example` for API settings and `.env.example` for storefront settings. Never overwrite existing `.dev.vars` or `.env`, and never print real secrets in terminal output, replies, or docs. Production domains, Worker names, and database IDs in `wrangler.jsonc` and `cloudflare.config.ts` are example deployment values—do not assume they belong to the user.

## Business Invariants

### Money, Pricing & Payments

- Keep the customer wallet and the HioBuy fulfillment wallet completely separate. Customer-side defaults to USD and fulfillment-side uses CNY; always check configured currencies rather than inferring currency from a `Fen` suffix.
- Represent amounts in integer minor units; express markups in basis points and follow existing exchange-rate scaling conventions. Reuse `src/domain/money.ts`, `freight.ts`, `earnings.ts`, etc.
- Compute and verify payable amounts, parcel eligibility, allowed destinations, quotes, and selling prices on the server; never trust client-submitted prices, discounts, or costs.
- Historical profit reads immutable cost, selling-price, and exchange-rate snapshots stored on the shipment/order—never recompute history from current settings, and never treat missing costs or exchange rates as zero.
- Customer payment and `HioBuy Pay` are separate actions; status pulls, webhooks, or fulfillment retries must never double-charge the customer wallet.
- Stripe success redirect pages are not proof of payment; settle only on verified webhook/payment events. Uploading bank transfer proof does not credit the wallet until an authorized staff member approves it.
- Preserve existing idempotency patterns: business idempotency keys for creation and wallet payments, event IDs for payment webhooks, and request records for bank top-ups. Never treat read-then-write checks as concurrency-safe.
- When modifying money flows, verify atomicity and failure recovery across balances, ledger entries, settlement statuses, and payment records. Existing multi-step writes and CAS patterns are not full transactions—design atomic writes, unique constraints, and compensation/reconciliation around D1's real capabilities.

### Fulfillment & State

- Keep all HioBuy HTTP requests inside `server/services/hiobuy/`; browsers must never call HioBuy directly or access its credentials. Verify official endpoint definitions before adding calls—do not guess paths, fields, or response shapes.
- Keep internal IDs, display numbers (`PKG-` / `SHP-`), and remote IDs distinct; never derive one from another.
- Package lifecycle status, exception condition, shipment status, payment status, and sync status are independent dimensions. Successful pre-alert ≠ received; successful sync ≠ paid or shipped.
- Preserve persistent sync tasks, idempotency keys, leases/locks, timeout recovery, retries, and manual-review (`needs_review`) semantics. Account for "remote succeeded, local timed out" scenarios.
- Verify signatures and deduplicate webhooks, handling duplicate or out-of-order deliveries while reusing domain state rules.
- Keep an explicit operator confirmation boundary for HioBuy freight payment; the fulfillment wallet is read-only here and must not implement implicit top-ups.
- Never show a fake warehouse address before a real warehouse is synced; never fall back to demo data in production.

## API, Security & Frontend Conventions

- Business JSON endpoints follow `{ data, requestId }` and `{ error: { code, message, details }, requestId }`; reuse `AppError` and frontend `ApiError` (admin: `src/admin/lib/api.ts`). Auth, file, and streaming endpoints keep their native protocols.
- Always enforce resource ownership on the server. Frontend route guards are not authorization; any new admin endpoint must define permissions in `src/domain/staff.ts` and enforce them server-side.
- Public and customer quotes must never leak cost, markup, or profit; filter admin responses by staff permissions as well.
- Handle secrets exclusively on the server using existing encryption utilities; never log passwords, session cookies, full API keys, or payment credentials. Consider `BETTER_AUTH_SECRET` rotation impact on encrypted settings.
- Keep `/api/dev/mailbox` disabled in production. Keep Demo Admin read-only without weakening production permission checks to accommodate demo mode.
- The in-memory quote rate limiter is per Worker isolate; never describe it as a global rate limit.
- New pages must reuse the host application's (storefront or admin) existing components, theme, branding, and i18n mechanisms; do not hardcode a single brand, locale, or currency into shared UI.
- Admin data fetching uses TanStack Query with `src/admin/lib/api.ts`; storefront uses `src/lib/procurement/client.ts`. Update or invalidate relevant caches after writes.
- Bind every customer assistant instance to the authenticated user; keep explicit user confirmation for write actions and direct payments/top-ups to existing pages. Personal chats must never automatically become global knowledge.

## Storefront & Member Center (`src/app`, storefront directories)

Applies to `src/app` (excluding `admin/`), `src/{assets,components,config,content,hooks,i18n,lib,stores}`, `messages/`, and `public/`.

- This is Next.js 16 App Router running on vinext; APIs, conventions, and file behavior may differ from older Next.js versions. Check `node_modules/next/dist/docs/` before writing code and heed deprecation notices. Keep Next.js route convention filenames intact.
- `page.tsx` is a Server Component handling metadata, data loading, and static content; place browser interactivity in sibling `page-client.tsx` files. Write explicit JSX without runtime template engines or component registries.
- Routing layout: `src/app/(site)/(storefront)/` holds shop and member pages (shared Header / Footer in the group layout); `(storefront)/(with-sidebar)/` holds member pages with the sidebar (route groups do not appear in URLs—put new sidebar member pages here and render only main content; detail, creation, and payment pages go under `(storefront)/member-center/` without the sidebar); `(site)/(auth)/` holds login, register, forgot-password, reset-password, and confirm-email. Root `not-found.tsx` imports `globals.css` directly.
- Component placement: `src/components/layout/` for Header, Footer, mobile nav, member sidebar, and layout containers; `src/components/features/` for cross-page business modules; single-page components in that route's `components/` (and dedicated logic/hooks in `lib/` / `hooks/`); `src/components/ui/` for shadcn primitives (`default` style, see `components.json`) and shared interactive controls.
- Naming: `PascalCase` for React components, `kebab-case` for source files and route directories, `useCamelCase` for hooks in `use-kebab-case.ts` files. Legacy URLs are handled via 308 redirects in `next.config.ts`.
- Business data: all calls go to same-origin `/api/*` via `src/lib/procurement/client.ts` (`apiBase = "/api/"`), with no storefront proxy, path allowlist, or cookie rewriting; write-request same-origin enforcement is handled by the API's `clientCors` and Better Auth `trustedOrigins`. Storefront auth requests pass relative return URLs (`/login?verified=1`, Google `callbackURL` / `errorCallbackURL`). Product-detail SSR calls the API via `fetchApi` in `src/lib/server/api.ts`: production uses the `API` service binding (`cloudflare.config.ts`, Worker `hiobuy-procurement`, deploy API Worker first), development uses `.env`'s `API_INTERNAL_ORIGIN`, forwarding only Better Auth cookies.
- Fixed theme & local content: theme is not fetched at runtime; `src/config/site.ts` fixes the store identifier and language list, logos live in `public/assets/brand/`, and CSS fixes the primary color, Poppins font, and border radii; blog (`src/content/blog/`) and help center (`src/content/help-center/`) are local JSON.
- Internationalization (`next-intl`): defaults to English (`en`), supporting `cn`, `ja`, `ko`, `es`, `fr`, `de`, `pt`, `ru`, `pl`, `ar`, and `it` with no `[locale]` URL prefix; persisted in a 1-year `locale` cookie, using a shared Zustand store on the client and per-request stores on the server; API locale codes, HTML `lang`, and RTL direction are centralized in `src/lib/locale.ts`. Use namespace-free `useTranslations()` / `getTranslations()` with English source keys containing no literal `.`; sync any new copy across all 12 files in `messages/`; use `t.raw()` when substituting custom business placeholders.
- SVGs are processed by `vite-plugin-svgr`; import them as `import { default as ServiceIcon } from "@/assets/home/s1.svg"` (vinext transforms shorthand default imports into image metadata objects).
- Auth uses same-origin Better Auth: `postAuth` strips the response `token` and keeps only `sessionEstablished`, leaving session persistence purely to same-origin cookies; Turnstile site keys must include the storefront domain; Google OAuth uses a single shared callback `<origin>/api/auth/callback/google` for both storefront and admin.
- Storefront uses `prettier.config.mjs` and ESLint; run `npm run lint` after edits.

## Admin Console Frontend (`src/admin`)

- Standalone React SPA: `src/app/admin/[[...path]]/page.tsx` renders `src/admin/AdminRoot.tsx` client-side only; internal routing uses React Router with full `/admin/...` paths (`src/admin/App.tsx`). Staff sign in at `/admin/login` and accept invites at `/admin/invite`. Staff accounts are invite-only (the invite page creates an account if the invited email has none); only the first owner registers on the storefront `/register` using an email in `ADMIN_EMAILS`; `/admin/login` intentionally has no "Create account" link.
- Uses its own components (`src/admin/components`), stylesheets (`src/admin/index.css`, `src/admin/pages/admin.css`), and theme under `<div class="admin-root" dir="ltr">`; `src/app/admin/layout.tsx` loads admin CSS and Inter. Translations live in `src/admin/locales/` via `useI18n` (`src/admin/lib/i18n.tsx`)—not the storefront's `next-intl`.
- Until the planned admin migration (to shadcn and Next.js routes) is complete, do not mix storefront shadcn components or `next-intl` into `src/admin`, and do not import admin components into the storefront.
- Type-checked with `tsconfig.admin.json`; ESLint and Prettier exclude `src/admin` by default—do not bulk-format it.
- Calls the API via `src/admin/lib/api.ts`; shared types with `server/` live in `src/types/` and `src/domain/`.

## Database & Generated Files

- Make schema changes in `server/db/schema/` and add a new `drizzle/` migration; never edit already-applied migrations or mutate databases directly instead of committing migrations.
- Verify default values for new columns, backward compatibility with existing rows, foreign keys, and unique constraints; explicitly call out any destructive or data-loss impact.
- Design indexes for real query patterns; prefer database-level filtering and pagination over loading full tables and slicing in memory.
- Regenerate `worker-configuration.d.ts` with `npm run cf-typegen:api` and Web Worker binding types with `npm run cf-typegen:web`; never hand-edit generated type files.
- Never commit secrets, `.wrangler/`, `.cloudflare/`, `.vinext/`, `.next/`, `dist/`, `dist-api/`, `node_modules/`, local databases, or temporary debug artifacts.

## Verification & Delivery

- For documentation-only changes, verify content, paths, and diffs—running a build is not required.
- For TypeScript / React changes, run `npm run typecheck`; for storefront changes (`src/app`, storefront directories), also run `npm run lint`; for domain or server behavior changes, run relevant tests (`npm test`); for routing, dependency, build-config, or cross-layer changes, run `npm run build`.
- Add meaningful tests when creating or modifying pricing, permission, status, or sync rules. Cover duplicate requests, concurrency conflicts, retries, or crash recovery in money and sync fixes, adding database integration tests where needed rather than testing pure helpers alone.
- Run Vitest via `vitest.config.ts`—never load `vite.config.ts` with Cloudflare plugins. Do not write brittle tests that merely mirror trivial styling or copy changes.
- When possible, inspect real pages for UI changes across narrow viewports and loading / empty / error states. If a check cannot be run, explain why rather than claiming it passed.
- Update relevant `docs/` when changing workflows, configuration, or API behavior. Adding a new page under the Developer Guide folders in `docs/` also requires updating `src/domain/guide.ts`, or `src/domain/guide.test.ts` will fail.
- In the final response, state what changed, verification results, and any remaining limitations; never report planned checks as completed.
