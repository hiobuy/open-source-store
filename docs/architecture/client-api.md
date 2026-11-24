# Client API / App Integration

Web and native apps share the existing customer business APIs, accounts, permissions, and data. Clients use signed Bearer session authentication, an OpenAPI 3.1.1 specification, and searchable documentation. Here, OpenAPI refers to the API description specification, not an OpenAI model service protocol.

## Discovery Endpoints

### Customer Shipment Ready-to-Ship Filter

`GET /api/shipments?status=ready_to_ship` includes both `displayStatus.key=ready_to_ship` and `payment_received`, with pagination and `total` calculated over the combined result set. `payment_received` means the customer has already paid the freight and the operator still needs to pay HioBuy—the customer must not be charged again. Returned items preserve the `payment_received` status for backward compatibility with existing clients; `status=to_pay` includes only orders awaiting customer payment. Keyword and customer ownership filters continue to apply.

The service URL uses the deployed domain. In local development, the API Worker direct address is `http://127.0.0.1:8787` (`npm run dev:api`); the storefront dev server (`npm run dev`) forwards all `/api/*` requests to that address.

| Path | Purpose |
| --- | --- |
| `GET /api/docs` | Searchable API documentation filterable by method and tag; expand entries to view parameters, request bodies, and response fields |
| `GET /api/openapi.json` | Raw OpenAPI 3.1.1 JSON, importable into compatible API tools or SDK generators |
| `GET /api/docs/endpoints?q=packages&method=GET&page=1&pageSize=20` | Documentation query API supporting `q`, `tag`, `method`, `page`, and `pageSize` (max `pageSize` is 100) |
| `GET /api/client/capabilities` | Integration entry points and catalog of implemented capabilities; actual enabled states remain governed by security, payment, and other configuration endpoints |

These endpoints expose only API structure and never return user data or secrets. The documentation page is read-only and does not execute business writes. Administrators can also read this guide from "Client API / App Integration" in the developer guide.

## Warehouse value-added service catalog

Authenticated users can read `GET /api/packages/services/catalog` (packages, `INBOUND`) and `GET /api/shipments/services/catalog` (shipments, `OUTBOUND`). The admin console uses the corresponding `/api/admin/packages/services/catalog` and `/api/admin/shipments/services/catalog`, requiring package-read and shipment-read permissions respectively. Optional query parameter `language=en|zh|zh-CN|zh-TW`, defaulting to `en`.

Responses use the standard business envelope. Taking the outbound catalog as an example, the catalog can still be displayed even when the service request list is unavailable:

```json
{"data":{"stage":"OUTBOUND","items":[{"stage":"OUTBOUND","code":"2","name":"Packaging Reinforcement (Custom)","description":"","pricingType":"PER_PACKAGE","unit":"package","price":20,"currency":"CNY","minQuantity":1,"maxQuantity":1,"requiresConfirmation":false}],"requestListAvailable":false,"applicationAvailable":false,"message":"Warehouse service temporarily unavailable"},"requestId":"req_example"}
```

Catalog prices are displayed in CNY yuan (for example, `20` means ¥20.00). Service codes may overlap across stages, so identify services by `(stage, code)` together. When the catalog request succeeds and no items are enabled, `items` is empty. When the request list is readable, `message` is `null`; this flag only indicates query availability. Clients should check `applicationAvailable` to determine whether the warehouse can accept new requests. Upstream catalog failures return HTTP 503 with "Warehouse service temporarily unavailable".

### Customer Warehouse Value-Added Service Requests

Clients can submit `{"services":[{"code":"2","quantity":1}]}` to `POST /api/packages/:id/service-requests` or `POST /api/shipments/:id/service-requests`. The path parameter is the local resource ID. Each service code can be selected at most once, and `quantity` must be a positive integer complying with the corresponding stage catalog limits. Packages use `INBOUND` and shipments use `OUTBOUND`.

A package must belong to the current customer, be received both locally and in the warehouse, and be in an actionable state. Requests are disallowed if the package has an exception, is locked, returned, abandoned, already has a service in progress, or is already consolidated. A shipment must belong to the current customer, have a warehouse ID, still be consolidating or awaiting weighing locally, and have warehouse status `PENDING`. Requests are disallowed for shipments that are billed, paid, assigned a tracking number, being intercepted, or cancelled.

When consolidating packages, append the same `services` array to the existing `POST /api/shipments` request body to select outbound shipment services. All selected packages must meet the inbound actionable requirements. Validation failures return 400, unauthorized resources return 404, and disallowed states return 409. Currently, creation via the HioBuy warehouse HTTP provider is not yet open. Valid submissions return 503 with "Warehouse service temporarily unavailable", and consolidation exits before creating the shipment or locking packages. Customers can uncheck services and submit `services: []` or omit the field to proceed with the standard consolidation flow.

Pushing a shipment and requesting warehouse value-added services are two separate operations. Once the warehouse officially supports creation, outbound services should use the HioBuy shipment ID returned by the first push to initiate the second request. The current release disables warehouse service request writes; clients can inspect `applicationAvailable` in the catalog to check availability.

## Authentication & Sessions

1. Fetch `GET /api/security/public` and render email, Google, Turnstile, and assistant capabilities according to the active configuration.
2. Register with email via `POST /api/auth/sign-up/email`; after verifying the email address, sign in via `POST /api/auth/sign-in/email`. When Turnstile is enabled, pass `X-Turnstile-Token`—native apps do not bypass verification.
3. Read the full signed token from the `set-auth-token` response header upon completed authentication. Do not substitute the raw `token` from the response body; the server requires a signed token. The token is an opaque session credential, not a self-parseable JWT.
4. Send `Authorization: Bearer <full-signed-token>` on subsequent requests. This also applies to photo, proof, and PDF downloads; resource ownership is still enforced server-side.
5. Store the token in secure OS storage—never in URLs, logs, or public configuration. Clear credentials and re-authenticate on 401; 403 indicates insufficient permissions or disallowed account status and must not be retried indefinitely.
6. `POST /api/auth/sign-out` signs out the current session; see "Login & Security" in the docs for device listing and revocation endpoints. There is no separate refresh-token protocol; Better Auth session expiration and renewal semantics apply.

```bash
curl -i -X POST 'https://your-site.example/api/auth/sign-in/email' \
  -H 'Content-Type: application/json' \
  --data '{"email":"customer@example.com","password":"YOUR_PASSWORD"}'

# Read set-auth-token from the response headers above, store it securely, and use it on requests:
curl 'https://your-site.example/api/packages?page=1&pageSize=20' \
  -H 'Authorization: Bearer YOUR_SIGNED_SESSION_TOKEN'
```

Native clients need a cookie jar to complete intermediate steps of two-factor authentication; intermediate responses do not mean a final session has been established. Google login, email confirmation, and Stripe continue to use the existing HTTPS browser flows. Native apps should handle these browser flows and obtain the session afterward; no native OAuth deep-link callback or platform-specific SDK has been added. Auth endpoints are generated by the active Better Auth plugins; refer to the OpenAPI specification for exact parameters and response shapes.

Website cookie-based sign-in remains available. When both `Authorization` and cookies are sent, `Authorization` takes precedence, and an invalid token does not fall back to cookie authentication. Disabled accounts cannot access customer business APIs or the assistant.

## Forgot Password & Password Reset

Reuses Better Auth's public authentication endpoints without requiring sign-in and without the business `{ data, requestId }` envelope. Client frontends implement their own reset page independently, while the existing website page remains available.

1. `POST /api/auth/request-password-reset` with JSON containing the email and an optional client page URL:

   ```json
   {"email":"customer@example.com","redirectTo":"https://app.example.com/reset-password"}
   ```

   The origin of `redirectTo` must be this site or an origin permitted in the admin "Client CORS Allowlist"; if no admin setting has been saved, `CLIENT_API_ORIGINS` applies. HTTPS is required (HTTP is allowed for local `localhost`/`127.0.0.1`); arbitrary external URLs and custom app URL schemes are not supported. When omitted, it redirects to `/auth/reset-password` on this site. If password-reset CAPTCHA is enabled, obtain a Turnstile token first and submit it via the `X-Turnstile-Token` header.

   A successful response returns `{"status":true,"message":"If this email exists in our system, check your email for the reset link"}`. The response is identical regardless of whether the email exists to prevent account enumeration; success does not guarantee email delivery, which follows the existing email queue and SMTP configuration. Rate-limited to 5 requests per 5 minutes per rate-limit identifier (429 when exceeded).

2. The user opens the server link in the email (`GET /api/auth/reset-password/{token}?callbackURL=...`). After verification, the server responds with 302 redirecting to the reset page with a `token` query parameter. Tokens are valid for 1 hour; if invalid or expired, the page receives `error=INVALID_TOKEN` and should prompt the user to request a new link. Opening the email link itself does not change the password.

3. `POST /api/auth/reset-password` with JSON containing the email reset token and new password:

   ```json
   {"token":"TOKEN_FROM_EMAIL_CALLBACK","newPassword":"YOUR_NEW_PASSWORD"}
   ```

   Password length must be 8–128 characters. A successful response returns `{"status":true}`; the reset token is single-use and all existing sessions for the account are revoked, so clients must sign in again. Invalid, expired, or already-used tokens return 400; rate-limited to 10 submissions per 5 minutes per rate-limit identifier (429 when exceeded). Note that `token` here is the email reset token, not a login Bearer token.

Clients must not log, share, or persist the reset token; clear it from the address bar after reading it from the URL, and avoid loading third-party scripts or leaking the full URL from the reset page. Search "Forgot Password" under "Login & Security" in the online docs; `auth.requestPasswordReset` and `auth.resetPassword` in `GET /api/client/capabilities` expose the endpoint entry points.

Isolated integration tests: `npm test -- server/client-api/password-reset.test.ts server/client-api/client-api.test.ts`. These use a temporary D1 database and mocked email without sending real emails, covering trusted redirects, single-use and expired tokens, session revocation, unknown emails, and rate limiting.

## Origin Configuration

Native apps typically do not send an `Origin` header and do not need CORS configuration. Other web clients should configure `CLIENT_API_ORIGINS` in the server environment as a comma-separated list of exact origins, such as `https://app.example.com,https://portal.example.com`. Only exact HTTPS origins are accepted (HTTP is allowed for local `localhost`/`127.0.0.1`). Do not include paths, wildcards, or credentials.

Allowed origins are also added to Better Auth `trustedOrigins`, and CORS exposes `set-auth-token`, `x-request-id`, `Content-Disposition`, and `ETag`. The existing same-origin website requires no configuration. Cross-origin writes from unauthorized origins are rejected; never add untrusted websites in production.

During development, Vite may respond to `OPTIONS` first; therefore, do not judge whether an origin is allowed solely from the preflight status code—also inspect `Access-Control-Allow-Origin`. The Worker itself rejects preflight and write requests from unauthorized origins.

## Capabilities & Protocols

Customer APIs cover account profile and security, notifications, warehouse information, package listing and pre-alerts, exception appeals, addresses, freight quotes, package consolidation and shipment creation, checkout and wallet, Stripe, bank transfers and proofs, invoice profiles, documents, photos, and assistant connections. Admin procurement ledgers, internal after-sales records, pricing, and marketing management do not become customer permissions through this document; unimplemented customer workflows are not advertised as callable capabilities.

- Business JSON success: `{ data, requestId }`; failure: `{ error: { code, message, details }, requestId }`. Retain `requestId` for troubleshooting. Auth endpoints, PDFs, images, and WebSockets use their own native protocols.
- Request body fields share Zod validation schemas with business endpoints. Amounts are integer minor units; read currency from the response and `/api/locale` rather than inferring currency from field suffixes. Quotes and charges are authoritative on the server.
- Never conflate internal IDs, display numbers, and HioBuy remote IDs. Pagination parameters and responses follow each endpoint's specification; packages and shipments accept `pageSize`, while wallet transactions and bank transfers keep fixed page sizes.
- Reuse the same `Idempotency-Key` when retrying shipment creation or wallet payments. This follows existing implementations and does not imply all write endpoints are idempotent or safe under arbitrary concurrent duplicates; clients should disable duplicate submissions, avoid concurrent payments, and query state after network timeouts.
- Bank transfers upload proofs via `multipart/form-data`, and uploading proof does not credit the balance. Stripe returns a redirect URL, and landing on the success redirect does not prove settlement—confirm via the payment session query endpoint.
- `GET /agents/forwarding-assistant/{userId}` is the WebSocket upgrade endpoint, requiring the authenticated user's own `userId` and subject to the assistant enablement setting. Native handshakes may include a Bearer token; text, voice, and tool confirmations must implement the Cloudflare Agents/AIChat messaging protocol rather than plain REST or OpenAI Chat Completions. OpenAPI describes the connection entry point, not the full bidirectional message protocol. The legacy customer portal's assistant panel was removed along with the old portal, and the storefront currently has no assistant UI, so integrations must implement this protocol themselves; during development, the storefront's `apiDevProxy` does not proxy WebSocket upgrades—connect directly to the API Worker. Business write actions still require tool confirmation, and payments redirect to existing flows.

## Shipping Address Responses

List items in `GET /api/addresses`, returned objects from `POST /api/addresses` and `PATCH /api/addresses/:id`, and the `address` field in `POST /api/shipping/quotes` share the `Address` response model, which includes `countryCode` and a read-only string `countryName`, e.g., `"countryCode": "US", "countryName": "United States"`.

`countryName` is generated server-side using existing country name rules: built-in country names take priority, falling back to English `Intl.DisplayNames`, and returning the raw code if unresolved. This field does not change with client locale. Creating or updating an address still submits only `countryCode`; do not submit `countryName`. There is currently no standalone `GET /api/addresses/:id` detail endpoint; a shipment's `destination` address snapshot is not part of this `Address` response model.

List items in `GET /api/shipments` and details in `GET /api/shipments/:id` share the `Shipment` response model, whose `destination` also includes a read-only string `countryName` generated by the same rules from the shipment's address snapshot `countryCode` rather than the customer's current address book. When there is no address snapshot, `destination` remains `null`. The `Shipment` returned on shipment creation also includes this field; no request parameter changes or database migrations are needed.

## Extending & Verifying

When adding customer routes in `server/index.ts`, keep the operation catalog in `server/client-api/catalog.ts`, shared validation schemas in `server/client-api/requests.ts`, and response models in `server/client-api/responses.ts` in sync. `openapi.ts` merges business definitions with definitions generated by the auth plugin, and `docs.ts` serves the searchable documentation page. Do not duplicate business validation schemas in docs, and never expose admin endpoints or server secrets.

`server/client-api/client-api.test.ts` uses an isolated local D1 database to verify signed authentication, sign-out, expiration, disabled accounts, resource ownership, CORS origin rules, route coverage, documentation queries, and standard OpenAPI parsing. Run `npm test -- server/client-api/client-api.test.ts`, followed by `typecheck` and `build`. Test accounts and sessions exist only in the isolated test database.

References: [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html), [Better Auth Bearer](https://better-auth.com/docs/plugins/bearer), [Better Auth OpenAPI](https://better-auth.com/docs/plugins/open-api).

## Procurement Products & Orders

Added product search, product details, URL parsing, and procurement order preview, creation, listing, details, and customer wallet payment APIs. Upstream order placement, procurement payment, and cancellation remain subject to admin staff confirmation. See the "Procurement Products" and "Procurement Orders" tags in `/api/docs`, and see [HioBuy Product & Procurement API](../workflows/purchase-api.md) for workflows and database changes.

Cart, product favorites, shop products, and image search are provided via customer APIs. See [Procurement API](../workflows/purchase-api.md#cart-favorites-and-product-discovery-2026-11-11) for endpoints, platform limitations, and cart-to-order integration steps; the online docs add "Cart" and "Favorites" tags, while shop and image search are grouped under "Procurement Products". Client frontends remain independent and are not developed in lockstep with the admin console.

### Admin CORS Allowlist

Admin Settings → Client CORS Allowlist lets operators configure full origins, supporting values such as `https://app.example.com:8443` and `http://localhost:5173`. Enter one origin per line with exact scheme, host, and port matching; paths, query strings, wildcards, and credentials are forbidden. Reading requires `settings.read`, modifying requires `secrets.write`, and Demo mode is read-only. Before the first save, `CLIENT_API_ORIGINS` is used; after saving, the database value is authoritative, and saving an empty list disables cross-origin access. Changes take effect on the next request and apply simultaneously to CORS, Better Auth `trustedOrigins`, and the assistant WebSocket. This does not affect `TRUSTED_APP_ORIGINS` used for email links. Migration `0014` must be applied before deploying the code.

## Unified Multi-Currency Exchange Rates (Phase 1)

Admin Settings → Multi-Currency Exchange Rates manages unified exchange rates, enabled status, and version history. Product pricing and freight pricing now only display the current unified exchange rate and no longer edit rates separately. Permissions are `settings.read` / `settings.write`. Freight continues to settle in USD, and products continue to use the configured customer settlement currency; this phase does not add multi-currency wallets or change payment flows.

- `GET /api/exchange-rates`: Public endpoint returning enabled currencies only. `baseCurrency=CNY`, with new `unitsPerCnyScale=100000000`; `unitsPerCnyE8=13888889` means `1 CNY ≈ 0.13888889 USD`. Legacy `cnyPerUnitE4` and `scale=10000` preserve their original direction for backward compatibility with older clients—do not mix the two directions. `version` and `updatedAt` can be used to refresh client display caches.
- `POST /api/purchase-orders/preview` and `POST /api/cart/preview`: Added `referencePrice` containing `currency=CNY`, `displayOnly=true`, `goodsCents`, `serviceCents`, `shippingCents`, and `totalCents`. These amounts represent the customer reference selling price after store markup and service fees, not procurement cost. Existing top-level settlement fields, order creation, and payment requests remain unchanged.
- `POST /api/shipping/calculator` (`quotes[]`) and `POST /api/shipping/quotes` (`routes[]`): Added `referencePrice={currency:"CNY",amountCents,displayOnly:true}`. `amountCents` is the store freight selling price in CNY fen, while preserving existing settlement amounts. Freight quotes saved prior to migration may lack this optional field and cannot be used to derive exact historical CNY selling prices.
- Product search and details still use `pricing=preview_required`; actual selling prices must be obtained via quote previews rather than publishing upstream procurement prices as customer selling prices.

Clients convert CNY fen to minor units of a target currency using `roundHalfUp(cnyCents * unitsPerCnyE8 / unitsPerCnyScale)`. For example, 1800 CNY fen at forward rate 13888889 displays as 250 USD cents ($2.50). Integer or fixed-point decimal arithmetic is recommended. Display currencies must never be used as the basis for ordering or charging; final charges always follow the invoice currency and amount. Line-by-line conversion vs. total conversion may differ due to rounding, and the converted CNY reference total may also differ slightly from the original settlement total.

Admin endpoints: `GET /api/admin/settings/exchange-rates`, `GET /api/admin/settings/exchange-rates/:currency/history?page=1` (20 rows per page), and `PUT /api/admin/settings/exchange-rates/:currency`. Write parameters are updated to `{unitsPerCnyE8,enabled,version}` (an integer representing up to 8 decimal places multiplied by 100000000), while remaining compatible with legacy `{cnyPerUnitE4,enabled,version}`; submitting both directions together is disallowed. New currencies use version `0`; version conflicts return 409 and require reloading. CNY forward rate is fixed at `100000000` and enabled; USD and the active customer settlement currency cannot be disabled. Rate updates, history records, and product pricing version invalidation commit in a single D1 batch. Updates affect subsequent new quotes only; existing client quotes, bills, and payment snapshots are never recalculated. Admin bill creation previews invalidate when the product pricing version changes.

Migration `0015_square_vance_astro.sql` creates `exchange_rates` and `exchange_rate_history`, inheriting existing product and freight rates. If the previous USD product rate and freight rate differed, it marks `legacy_conflict` and temporarily disables the unified rate until an admin confirms and saves to resume new quotes; existing bills and payments are unaffected. Fresh databases do not fabricate a USD rate and require explicit configuration first. When releasing, back up and apply the migration before deploying compatible code; this development effort does not automatically modify remote D1 or deploy Workers.

### Reference Selling Price Rate Table in Channel Details

`rates` in `GET /api/shipping/calculator/channel` returns the system-marked-up reference selling rate table for the applicable destination region; the admin cost view still returns original procurement costs. Each row keeps `label`/`range`/`amount` and adds `type`/`minimum`/`maximum`/`unit`/`amountCents`/`currency`, with amounts in CNY fen.

Percentage markup is applied to each row, while fixed markup is listed separately via `ratePricing.fixedChargePerShipmentCents` and applied only once per shipment—never add it repeatedly to every first-weight or additional-weight row. `ratePricing` also includes `priceType=selling`, `currency=CNY`, `referenceOnly=true`, and a pricing explanation `note`. Rows represent reference unit prices; tier matching, surcharges, and total rounding remain governed by the freight quote API, and this table must not be used directly for billing.

Value-added service procurement prices are confirmed per operator and returned only in the admin view; `services[].price` in the public API remains `null`. Admin `purchasePrices` preserves applicable regions, billing basis, percentage points, or CNY fen instead of blindly picking the first unfiltered region price. Public APIs never return value-added service procurement costs.

Admin configuration, product/freight pricing, and order exchange rates all display `1 CNY = x target currency`. The database and historical bills still store the original direction, and the server converts new inputs to the existing E4 settlement precision, with products and freight sharing the converted effective rate. The admin UI shows the actual effective value; it does not maintain two independent rates or alter historical snapshots. No database migration is needed for this change. The 8-decimal reciprocal is a display approximation; final payment amounts remain governed by the invoice. Toggling enabled status only or saving the original value preserves raw precision, and version validation and atomic history recording remain unchanged.

### Package Items in Shipment Details

`data.packages[]` in `GET /api/shipments/:id` retains package numbers, domestic tracking numbers, carriers, weights, dimensions, and item attributes, and also returns `packageStatus`, `receivedAt`, and the package's item list `items[]`.

| `itemSource` | Origin and Quantity Meaning of `items` |
| --- | --- |
| `purchase` | Valid associations between procurement items and the package. Each row includes order ID and number, item ID, name, SKU, spec, image, allocated `quantity` for this package, and `receivedQuantity`. `unitPriceCents` and `currency` come from the customer invoice selling-price snapshot. |
| `fulfillment` | When no procurement link exists, uses synced warehouse item names, quantities, and images. |
| `prealert` | When only a pre-alert exists, uses pre-alert item names and quantities (`null` if quantity is unknown). |
| `null` | No item records yet; `items` is an empty array. |

`goodsItems[]` independently retains warehouse-recorded names, quantities, and images, which may describe the same goods as procurement items. When aggregating, count only the desired source. Missing selling prices, received quantities, images, and similar fields return `null`. Shipment lists continue to return package summaries.

Client order details return synced HioBuy warehouse photos per package. Read `data.packages[].photos[]` in shipment details and `data.logistics.domesticParcels[].photos[]` in procurement order details. Each photo contains `id`, `type`, `label`, the HioBuy image URL `url`, and local creation timestamp `createdAt`. Returns an empty array when no photos exist or no warehouse package is linked yet. Top-level `photos` on a shipment continues to represent the shipment's own packing and outbound photos.
