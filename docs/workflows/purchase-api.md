# HioBuy Product and Procurement API

Based on [HioBuy OpenAPI](https://api.hiobuy.com/openapi.json) 1.0.8 (verified 2026-11-10), this reuses the existing integration configuration, customer accounts, procurement ledger, product pricing, bills, and package linking. Newly added customer APIs can be inspected under the "Procurement Products" and "Procurement Orders" groups in `/api/docs`.

## Keyword search cache

Customer `POST /api/products/search` and admin `/api/admin/procurement/products/search` share a D1 search result cache with a default TTL of 300 seconds. In Admin "Settings -> Products & Pricing -> Product Search Cache", this can be configured from 0 to 1440 minutes, where 0 disables caching. Admin API `GET/PUT /api/admin/settings/product-search-cache` requires `settings.read` / `settings.write` respectively; `PUT` accepts `{ttlSeconds: 0..86400}` (integer seconds). The demo admin cannot modify this setting.

Keyword search, image search, and shop product search all return the same reference price structure on each product. Across all three search types, `data.items[].price` matches the product-level reference price returned on product detail, for example `{"currency":"CNY","displayOnly":true,"unitPriceCents":1150,"promotionPriceCents":null}` representing CNY 11.50. Prices already apply the current product markup rules and exclude shipping and service fees; when the upstream price is missing, the currency is unsupported, or pricing is not configured, the corresponding amount is `null`. `pricing: "preview_required"` is preserved, and order placement still relies on preview.

The cache key includes the markup configuration that affects product display prices, all validated parameters with defaults populated (keyword, channel/platform, page, page size, language, `user_id`, filters, sorting, etc.), the current HioBuy authorization, and the configuration generation. Leading/trailing whitespace in keywords and object key ordering do not affect cache hits; array order and upstream aliases that are not explicitly normalized preserve their original semantics and are not arbitrarily merged. Different HioBuy keys do not share cached results, and the keys themselves are never stored in the cache table. Only customer product DTOs with sensitive fields filtered out are stored; successful empty results are also cached; errors and results exceeding 512 KiB are not cached.

On a cache hit, upstream search is skipped; after expiration, a fresh upstream request is issued, with TTL calculated from when the successful response is cached. Saving configuration atomically switches the generation and clears old records; in-flight requests still executing during a configuration change cannot turn stale results back into valid cache entries. The existing cron cleans up at most 500 expired records per run. If cache storage read/write fails, the system falls back to live search and does not use stale results to mask upstream errors. Concurrent first-time misses for the same criteria may still send multiple upstream requests; cross-isolate request coalescing is not guaranteed.

Request rate limiting, parameter validation, ownership checks, and admin permissions remain unchanged. Product detail, link parsing, image search, shop search, and order preview do not use this cache. Product listings may lag during the cache window, and final prices are still determined by order preview and server-side pricing. Apply `0033_lame_electro.sql` before deployment.

## Upstream scope

| HioBuy endpoint | Purpose |
| --- | --- |
| `POST /v1/products/search` | Search products |
| `POST /v1/products/detail` | Query product and SKUs |
| `POST /v1/products/parse` | Parse product link |
| `POST /v1/orders/preview` | Validate seller, quantity, availability, and amounts |
| `POST /v1/orders/create` | Create real order after staff confirmation |
| `POST /v1/orders/detail` | Query linked order |
| `POST /v1/orders/pay` | Pay procurement amount after staff confirmation |
| `POST /v1/orders/cancel` | Request cancellation, then query final outcome |

All endpoints use the `standard` format. Customer product queries are limited to at most 20 requests/minute and previews to at most 10 requests/minute; this is per-user rate limiting within a Worker isolate, upstream quotas apply independently, and it is not a global rate limit. Shop product search and image search are integrated (see below); advanced product capabilities such as upstream categories, rankings, and translation, as well as remote refund and return endpoints, are not yet integrated. The full order list of the shared HioBuy account is not exposed to customers.

2026-11-10 read-only product integration check: Using a locally configured real HioBuy key and the project's server-side wrapper, search, detail, and link parse for 1688 (`zh`), Weidian (`zh`), and Taobao (`en`) all returned HTTP 200. When passing `language=zh` for Taobao, upstream returned `CHANNEL_UPSTREAM_ERROR` / unsupported target language; the current default `en` works, so do not treat this result as meaning all languages are available. Search lists use a single-image `image` field, which is converted to this site's `images` array; pagination prioritizes the actual `page`/`page_size` returned by upstream. The browser was not logged in at the time, so this verification does not mean an authenticated client HTTP end-to-end test was completed. No real procurement, order preview, or payment endpoints were called.

Credentials continue to come from the admin integration configuration, with `HIOBUY_API_TOKEN` as fallback, used only on the server. Live procurement requires the production enablement, subscription, and permissions mandated by upstream; working product queries do not imply procurement is enabled. Raw upstream responses or secrets are never exposed to the browser.

## App integration flow

1. Sign in using the existing session cookie or signed Bearer token.
2. Call `/api/products/search`, `/detail`, or `/parse` to obtain the product `id` and variant `skuId`. Customer DTOs do not return procurement cost, seller account info, or raw metadata.
3. Call `POST /api/purchase-orders/preview` with `channel` and `lines: [{id, spec_id, quantity}]`, where `spec_id` uses `skuId`. All items must be from the same platform and seller; the address is generated server-side from the synced warehouse with the member code attached; customers cannot submit prices or warehouse addresses.
4. Preview returns the quote `id`, `expiresAt`, customer currency, and selling prices, valid for 8 minutes. Authoritative cost comes from the CNY fen amounts in order preview; yuan prices from product detail are not used to infer settlement amounts.
5. Call `POST /api/purchase-orders` with `{id: "operation-UUID", quoteId: "quote-ID"}` to atomically create the local order, item details, and bill. Retries reuse the same `id`, one quote can generate only one order, and no remote procurement order is submitted at this stage.
6. Call `GET /api/purchase-orders` and `GET /api/purchase-orders/:id` to view the authenticated customer's own orders and bills; pagination uses `page`/`pageSize` with a max `pageSize` of 100. Staff remarks, procurement costs, and full upstream responses are never returned.
7. After customer confirmation, call `POST /api/purchase-orders/:id/pay` with `{confirm:true}`. Customer wallet balance, bill, and ledger entry are atomically updated in a single D1 batch; duplicate payments do not double-charge. Insufficient balance or currency mismatch returns a conflict and does not trigger HioBuy payment.

Selling prices and exchange rates are preserved as snapshots. Explicit non-negative upstream surcharges calculated as `payment - merchandise - shipping` are included in the customer service fee without guessing or stacking an extra HioBuy service fee percentage; domestic shipping is itemized separately. Missing, quantity-mismatched, or irreconcilable preview amounts are never substituted with zero.

## Admin operations and recovery

For 1688 orders, the create response's `payment` is the total payable in CNY minor units and already includes `shipping`. For example, goods costing ¥4.44 and domestic freight of ¥2.00 produce a payable total of ¥6.44. The receipt check uses that total. Before payment, the server reads the linked order's current total and checks the operator's payment limit. For an existing order held for amount review, refresh its remote status to recheck the cost against the paid bill.

"Procurement Orders -> New HioBuy Purchase Order" supports customer selection, product search/link parsing, SKU, quantity, preview, and request creation. The legacy manual draft entry remains available, and existing drafts are not automatically submitted to remote.

The HioBuy panel in order detail displays procurement cost, remote ID, submission and payment statuses, and operation logs. `procurement.write` allows submitting, querying, and canceling; paying and manual reconciliation require `payments.money`; `support` is read-only.

- **Submit**: Requires the customer bill to be paid, re-previews to verify seller, address, and original quote; persists a mutually exclusive operation record before sending the create request. Weidian explicitly sets `direct_pay:false` so defaults never cause implicit charges.
- **Pay**: Queries the remote amount first to confirm it matches the confirmed cost, then requires staff confirmation to pay. When secondary verification for HioBuy payment is enabled, it reuses the existing TOTP/recovery-code and one-time authorization flow, isolated from shipment authorizations using the `purchase` prefix. Receiving `success` alone does not mean settlement is complete; payment is marked succeeded only when `payment_status=success` and not `pending`. The customer wallet is never charged again.
- **Refresh**: Queries only the bound order; updates statuses only on explicit `payment_status` or `cancelled`/`closed` states, and never auto-retries payment. Remote `wait_receive` (awaiting warehouse receipt) maps after sync to display stage `transit`, consistent with existing seller-shipped/awaiting-receipt states; after-sales, exception, and registered inbound stages keep their original display priorities.
- **Cancel**: Records a reason and requests cancellation; asynchronous acceptance remains pending confirmation. Cancellation does not auto-refund; refunds require separate manual reconciliation, and there is currently no automatic refund or automatic reorder.
- **Manual link**: If the creation outcome is unknown for more than 60 seconds, staff with financial permissions first verify on HioBuy, then enter the remote ID and reconciliation note. The server performs a read-only query to verify the ID, amount, and external order ID (when present), then links and logs an audit entry. When no external order ID is present, staff must confirm ownership, and a unique index prevents binding the same remote order twice.

Timeouts, network disconnects, unrecognized responses, or interrupted execution retain the operation record. Each order allows only one logical attempt per write action; the `Idempotency-Key` is saved with the record and is never automatically rotated or used to unlock unconfirmed payments. Execution records interrupted for over one minute are marked as needing reconciliation. "Still unpaid" must never be treated as proof that a prior payment attempt definitely failed.

## Data and maintenance

Migration `0008_milky_jackal.sql` adds three tables without deleting data or modifying prior migrations: `purchase_quotes` stores quotes and request/price snapshots; `procurement_remote` stores local-to-remote linking, procurement status, and cost; `purchase_attempts` stores stable operation keys, initiators, requests, and outcomes with a unique constraint on `(order_id, action)`.

New orders still write to `procurement_orders`/`items`/`bills`, customer payments write to `wallets`/`wallet_transactions`, and admin actions write to `audit_logs`. Local `draft`/`cancelled` and remote statuses are independent dimensions; do not judge submission or payment state solely from `draft`.

Admin endpoints: `/api/admin/procurement/remote/{preview|create}`, `/products/{search|detail|parse}`, `/:id/remote`, and `/:id/remote/{create|sync|pay|cancel|reconcile}`. See OpenAPI for full customer API schemas.

Run `npm run db:migrate` locally. Remote migrations, deployments, real procurement orders, or real charges are not executed here. `server/purchase.test.ts` uses an isolated D1 database and mocked upstream to verify quotes, ownership, duplicate requests, concurrent balance updates, rollbacks, Weidian non-direct payment, price changes, timeouts, and manual reconciliation. Official create/detail models are relatively permissive, so unrecognized structures block automatic progression; passing mock tests does not mean live account integration testing is complete.

## Client and test warehouse verification (2026-11-11)

The client entry point is `/member-center/purchase-orders` on the storefront (the legacy `/app/purchase-orders` was removed along with the old customer portal), supporting search/link parsing, image and variant selection, quote breakdown, order list/detail, wallet payment confirmation, and top-up when balance is insufficient. Order detail polls local procurement status every 30 seconds; external status is pulled via Admin "Refresh Remote Status" or scheduled procurement polling. All customer requests pass through existing authentication and resource ownership checks. Admin and client share the product selection component, while legacy manual drafts, parcel forwarding, and warehouse flows remain intact.

Product titles are saved from server-verified product detail, and prices are verified only via preview; out-of-stock or non-existent variants cannot generate quotes. The wallet ledger type is `PURCHASE_PAYMENT`, deduplicated by bill identity. A single atomic D1 batch updates the ledger, wallet balance, and bill status.

1688 may return a single-seller group with `seller_id=null`: only variants of the same product may proceed in this case; multiple products must have verifiable seller information. The test warehouse create response may use `order_sn`; this field is accepted only when the request succeeded and `external_order_id` matches this site's order. Unknown outcomes can recover identity from a saved successful response and query detail, never creating a duplicate order.

When the remote detail/create amount differs from the quote, the order is flagged `review_required`, showing the remote amount and blocking procurement payment. Do not modify paid bills or re-charge the customer wallet; operations must reconcile procurement fees, discrepancies, and refunds. Orders with a known remote order number can still refresh status or request cancellation; cancellation does not auto-refund. Writes guard against stale overwrites using status and `updated_at` conditions so late responses cannot clobber subsequent manual reconciliation.

Local real integration check: Under user authorization using 1688 product `713918005557`, quantity 1, with exchange rate 7.2 and zero product markup. A dedicated test account registered via the page and verified via the dev mailbox completed on-page payment using a clearly labeled 250-cent test adjustment ledger entry. Site order `79ff2bde-bcf0-4d44-8d21-caf0306aae4d` was created on HioBuy via the backend business service, returning remote order ID `DG2768` with detail status `wait_payment`. Preview was 1800 CNY fen while create and detail were 1500 CNY fen, so it remained in amount-review status. The procurement payment endpoint was not called. The real admin push invoked the business service directly via a local diagnostic script and does not claim end-to-end verification of the admin browser login flow. Test balances do not represent real receipts; diagnostic scripts and local databases are not committed to Git.

## Admin orders page alignment with new HTML

Admin procurement orders add all-time summary cards, order/after-sales views, procurement progress groupings, customer payment filters, package number and domestic tracking number search, additional filters (date / minimum customer payable), filter chips, and page-size selection. `GET /api/admin/procurement` adds `stage`, `payment`, and `minAmount` query parameters while keeping legacy `status` compatible. Minimum amount filters only bills in the current customer currency to avoid cross-currency comparisons; filtering and pagination run in the database, and statistics reflect an all-time global overview.

The list distinguishes customer bills, procurement cost, and HioBuy settlement, displaying linked package links, domestic tracking numbers, and actual registered arrival quantities. Detail is split into Overview, Arrival & After-Sales, and Activity Log, reusing existing bill, package-linking, after-sales, and remarks endpoints. Historical records without product image snapshots display a neutral icon rather than fabricating images or product source links.

`overview.stage` is a read-only display projection and does not mutate any order or warehouse status. Cancelled orders, open after-sales, and procurement/QC exceptions take display priority; full shipment/consolidation requires the entire ordered quantity to be linked to packages in the corresponding status; partial arrival is calculated from registered quantities, and package pre-alerts do not count as arrivals. Customer payment and HioBuy payment are independent. New orders automatically issue a bill and enter awaiting payment; legacy unbilled records are grouped under awaiting payment, but a valid bill is still required before payment. Manual order balance top-ups are calculated from remaining payable amount; overpayments are recorded for manual handling only and are not auto-refunded.

Batch push lists eligible and skipped orders in a confirmation dialog, invokes the existing admin push endpoint one by one, displays per-order results, and never auto-retries or auto-pays HioBuy. The server still enforces bill, price, permission, and idempotency checks. Payment reminders only generate copyable draft text and never send messages automatically. Export is scoped to the current page or selected rows on the current page, including customer payable, payment, procurement, package, and arrival details.

Order detail uses a full-height right-hand drawer: fixed order header, three tabs, and a bottom action bar with independent scrolling in the middle. Order Overview displays a six-step progress bar, product snapshot, and fee card; exchange rates come from historical bill snapshots rather than current settings. Arrival & QC shows real packages and arrival summaries, while consolidation eligibility remains governed by checks on the Packages page; the activity timeline uses real audit logs, remarks, and bill `paidAt`. Missing data shows placeholders without copying sample amounts, images, or timestamps from prototypes.

## Product images and display snapshots

Migration `0009_sad_blackheart.sql` adds a nullable `product_snapshot` column to `procurement_items`. New procurement quotes use server-verified product detail to store product ID, source URL, selected variant image (falling back to main product image), and variant label, persisting them together when creating the order. Admin list and detail return allowlisted image fields without exposing the full upstream response. Product selling prices and fee breakdowns come from historical valid bill snapshots rather than recalculating historical amounts from current pricing settings.

Historical HioBuy order details provide "Backfill Product Images": `POST /api/admin/procurement/:id/media` with `{ "confirm": true }`, requiring `procurement.write`. The server verifies sources using the product ID, channel, and item position/SKU from the original quote request, fills only missing images, and skips existing images on repeated calls; returns `{ data: { updated }, requestId }`. Image backfill only reads upstream product detail; it does not create or pay procurement orders, nor does it alter product title, unit cost, quantity, bills, or settlement status. Successful updates write an audit event.

Manual historical drafts without verifiable product sources do not guess images; missing images or CDN load failures show an explicit placeholder. Image links use HTTP(S) and support opening the original image and product source. Missing customer country displays `—`. Local test orders were backfilled with real 1688 images and verified to render in both list and detail; browser checks used a mocked admin session to read responses and do not represent full real admin login verification.

### Client list and detail display

`GET /api/purchase-orders`, `GET /api/purchase-orders/:id`, and order DTOs returned by create/pay uniformly add `items[].productId/imageUrl/sourceUrl/variantLabel` (nullable), and bills add `discountCents`. OpenAPI is updated with these fields. Client list and detail display stored real images, variants, quantities, and product source links; missing images or load failures show a notice, and missing variant labels fall back to SKU.

The fee card in list and detail uses goods amount, domestic shipping, service fee, discount, and total from the existing historical bill in the bill's currency; it never exposes procurement unit price, cost, markup strategy, or full snapshots. Order queries continue to verify customer ownership without triggering image backfill or re-quoting; detail reuses existing upstream queries for international logistics tracking, while the list does not fetch live tracking. Product selection, quoting, order creation, payment confirmation, wallet balance checks, and payment requests all preserve their original flows.

### Admin order amount column

Following the new HTML layout, the admin amount column shows goods amount, domestic shipping, service fee, total, and CNY reference amount, with icons supporting hover or keyboard focus for explanations. The service fee explanation reads the historical bill's rate, fixed per-item fee, and recorded upstream fee instead of the prototype's hardcoded 6%. The original CNY amount sums the CNY snapshots of selling unit prices and service fees rather than substituting procurement cost; when full snapshots are missing or a discount applies, a clearly labeled reference value back-calculated from the bill total via the historical exchange rate is shown, or empty if the exchange rate is missing. The total follows the existing rule of converting each line component and summing rather than converting a CNY sum as in the prototype. No fabricated numbers are shown when there is no separate top-up/refund bill. Client frontend and payment flows remain unchanged.

## Cart, favorites, and product discovery (2026-11-11)

Clients consume these APIs independently without modifying the customer frontend. All new endpoints require an existing session cookie or signed Bearer token; user identity is derived strictly from the session and never accepts `customerId`. Interactive documentation remains at `/api/docs`, and the OpenAPI 3.1 contract automatically includes the following groups and endpoints.

| Site API | Request & purpose |
| --- | --- |
| `GET /api/cart` | Unpaginated; returns all items grouped by platform and shop with CNY display unit prices and subtotals; see below |
| `POST /api/cart/items` | `{channel, productId, skuId, quantity}`; validates real product and SKU/stock before saving |
| `PATCH /api/cart/items/:id` | `{quantity, version}`, absolute quantity; optimistic locking prevents concurrent overwrites, returning 409 on conflict |
| `DELETE /api/cart/items/:id` | Idempotently removes the authenticated user's item; returns ok if repeated or non-existent |
| `POST /api/cart/preview` | `{items:[{id,type,version}]}`, up to 50 mixed standard and manual items; splits quotes by platform/shop |
| `POST /api/cart/checkout` | `{id,previewId,confirm:true}`, atomically creates split orders and awaiting-payment bills |
| `GET /api/cart/checkouts/:id` | Queries the authenticated user's unified checkout result for recovery after disconnect |
| `GET /api/favorites` | Paginated query of the user's favorites; `page`/`pageSize` default 1/20, max 50 |
| `POST /api/favorites` | `{channel, productId}`, fetches real product and adds to favorites |
| `DELETE /api/favorites/:id` | Idempotently removes the user's favorite |
| `POST /api/products/seller/search` | Pass `seller_open_id` for 1688, `shop_id` for Weidian; not supported for Taobao |
| `POST /api/products/search-by-image` | Image search; see below |

The cart table `cart_items` has a unique key on `(customer_id, channel, product_id, sku_id)`, and `product_favorites` has a unique key on `(customer_id, channel, product_id)`. Adding an existing item returns the existing row without accumulating or overwriting its quantity; apps wanting to increment quantity should read the current value and call `PATCH`. Row `id` is a site UUID, not a product or SKU ID. A successful `PATCH` returns an incremented `version`; retrying with an old `version` returns 409, and the client should re-fetch and let the user confirm the latest quantity.

Both tables store only display snapshots (image, title, variant, stock at time of addition, etc.) and never store procurement cost or authoritative selling prices. When moving a favorite to the cart, refresh SKUs via the product detail endpoint first before submitting `/cart/items`. Snapshots may become stale, and delisted products do not block reading or deleting local records. Lists are filtered and paginated in the database, ordered by `updated_at` and `id` descending.

Cart checkout example:

1. Call `GET /api/cart`; the client can select across platforms and shops, mixing standard products and manual items.
2. Call `POST /api/cart/preview` with `{"items":[{"id":"cart-item-uuid","version":1}]}`.
3. Use the response `id` as `previewId` and call `POST /api/cart/checkout`; once the `orders` array is returned, proceed through the existing payment flow per order.
4. Preview does not lock the cart; unified checkout re-verifies all versions and states, and on success the server removes the selected standard items and hides submitted manual entries in the same transaction. The client does not need to delete them again; on failure, everything is preserved.

Pricing, same-seller rules, and inventory are still validated by existing `previewPurchase`; preview neither charges money nor pushes remote orders. Adding/updating cart items also checks the SKU and currently known stock, deferring unknown stock confirmation to checkout preview.

Shop product search request example:
`{"channel":"1688","seller_open_id":"platform-provided-sellerOpenId","keyword":"T-shirt","page":1,"page_size":20,"language":"en"}`
For Weidian, use `channel=weidian` and `shop_id`. Shop identifiers must be supplied by the platform and cannot be derived from product IDs; product DTOs currently do not pass through unstructured upstream seller metadata. Shop queries call the official `POST /v1/products/seller/search`.

Image search calls the official `POST /v1/products/search-by-image`; exactly one of `image_id`, `image_url`, or `image_base64` is required:
- 1688 and Taobao support `image_base64` (raw base64 or JPEG/PNG/GIF data URL), up to 3 MB decoded; they also accept `image_id` or a public HTTPS `image_url`.
- Weidian requires a public HTTPS `image_url`. No image upload endpoint is added here; the app must obtain a public image URL first.
- Supports `keyword`, `page`, `page_size`, and `language`; max 50 items per page, default 20, default `language` is `en`.
- Images are forwarded to HioBuy only and are not stored in this site's R2. Request bodies exceeding 4.2 MB return 413, and invalid parameters return 400; image URLs disallow credentials, localhost/IP literals, and non-HTTPS schemes.
- Returns unified product DTOs and pagination without exposing costs, raw upstream responses, or keys. Unsupported upstream responses return 502 without falling back to fake products.

New write and search endpoints share a per-user 20 requests/minute Worker-isolate rate limit; product searches remain subject to existing product rate limits and HioBuy quotas and do not represent global quota enforcement. Standard new endpoints enforce a 16 KB request body limit.

Migration: `0010_broken_gunslinger.sql` only adds the two tables and indexes without altering historical orders. Run `npm run db:migrate` in development; remote migration and deployment are executed separately. New server tests use an isolated Miniflare database and mocked upstream and do not create real orders or charges.

## Client product categories

Categories are site-operator configured and unrelated to HioBuy's native category IDs; multi-level parent-child hierarchies are supported, with `parentId=null` denoting top-level categories. Clients continue to consume the API independently.

- `GET /api/products/categories?locale=zh-CN`: public read-only endpoint returning all visible enabled categories at once without pagination (legacy `page`/`pageSize` parameters are ignored), sorted by `sortOrder`/`id` ascending. Returns an empty list when unconfigured without generating demo categories.
- Returns `{items:[{id,parentId,name,locale,icon,keyword,sortOrder}],total}`, wrapped in `{data,requestId}`.
- `locale` supports existing language catalogs `en`, `zh-Hans`, `zh-Hant`, and `ru`, accepting aliases such as `zh-CN`, `zh-TW`, and `ru-RU`. Fallback order is requested locale -> site default locale -> `en`, and the returned `locale` indicates the matched translation. Omitting `locale` uses the site default locale; `Accept-Language` is not read.
- `icon` may be null, `{type:"name",value:"shirt"}`, or `{type:"url",value:"https://cdn.example.com/category.png"}`. Icon names are lowercase kebab-case identifiers agreed with clients, which handle mapping and fallback for unknown names; image URLs must be credential-free HTTPS URLs and do not accept HTML, raw SVG, or data URLs. No upload endpoint is added.
- When a customer selects a category, the client sends `keyword` together with the user-selected `channel` to existing `POST /api/products/search`; site category UUIDs must not be passed as upstream `category_id`. Name translations do not change the search keyword.

Admin configuration API (reuses existing staff auth; page entry: Admin Settings -> Product Categories):

| Method & path | Permission | Purpose |
| --- | --- | --- |
| `GET /api/admin/settings/product-categories` | `settings.read` | Paginated list of all categories, including disabled items and all translations |
| `PUT /api/admin/settings/product-categories/:id` | `settings.write` | Create by UUID or full-row update of a category |
| `DELETE /api/admin/settings/product-categories/:id` | `settings.write` | Delete a category by submitting `{version}` |

`PUT` example (`id` is a caller-generated UUID):
```json
{
  "parentId": null,
  "names": {"en": "Clothing", "zh-Hans": "Clothing (zh-Hans)", "zh-Hant": "Clothing (zh-Hant)", "ru": "Odezhda"},
  "icon": {"type": "name", "value": "shirt"},
  "keyword": "clothing",
  "sortOrder": 10,
  "enabled": true,
  "version": 0
}
```
`names` must provide a non-empty English (`en`) fallback and only allows keys from the existing language catalog. `icon=null` clears the icon. `version=0` indicates creation and returns `version=1` after save; updates and deletes must pass the latest version, and concurrent modifications, duplicate creates, or stale deletes return 409 so the caller re-queries before resubmitting. `enabled=false` disables a category while preserving configuration. Configuration changes log staff audit entries.

Adds the `product_categories` table and migration `0011_magical_human_fly.sql` storing multilingual names, icon, keyword, sort order, status, version, and timestamps. Client OpenAPI remains at `/api/openapi.json` and `/api/docs`, with categories grouped under "Procurement Products"; admin management APIs are not mixed into the public client contract.

### Admin configuration page and batch import

Admin Settings -> Product Categories supports names in four languages, icon name or HTTPS image URL, search keyword, sort order, and enable/disable toggles. `settings.read` grants read-only access and `settings.write` grants create, edit, toggle, and import access; this entry is hidden in demo admin. Version conflicts preserve form edits and prompt a refresh; switching settings tabs or closing the page with unsaved changes shows a prompt.

Batch import supports downloading a JSON template, selecting a JSON file or pasting content, and validating a preview before confirmation. File size limit is 1 MB, 1–100 items per batch, insert-only without overwriting existing entries; editing is disabled during submission. Each item uses single-category fields excluding `version`; `id` may be omitted in page uploads and will be assigned a stable UUID during preview. Retrying directly after a failed request reuses the batch IDs to prevent duplicate inserts.

Server `POST /api/admin/settings/product-categories/import` (`settings.write`) accepts `{items:[{id,parentId,names,icon,keyword,sortOrder,enabled}]}`, where `id` must be a UUID. All rows are validated first and then written in a D1 transactional batch; any existing ID conflict rolls back the entire batch and returns 409; success returns `{imported: count}` and logs an audit entry. Identical names with distinct IDs can coexist; the server does not merge by name. Single-item edits continue using version checks and are not overwritten via import.

The page previews the `shirt`, `box`, `smartphone`, `shopping-bag`, `home`, and `gift` icons; other valid icon names keep their raw value with a generic preview, and apps should map them on their own. Icon URLs continue using externally hosted images. This feature does not modify the customer frontend; migration `0012_wise_sway.sql` drops the category `channel` column and its index while retaining existing names, icons, keywords, sort order, and enabled status. Product search itself still requires `channel`.

### Multi-level category rules

- Categories are cross-platform and do not carry `channel`. `GET /api/products/categories` adds a `parentId` query parameter: `root` returns top-level categories, a UUID returns direct children, and omitting it returns all visible levels at once. Each item includes `parentId` so clients can assemble a tree.
- Admin displays top-level categories by default; click "View Subcategories" to drill down and click breadcrumbs to go back up; adding a category at the current level pre-fills the parent. When editing, open the parent picker, browse levels, and click "Use Current Level as Parent", or move back to top level.
- A category cannot have itself or any of its descendants as its parent; a missing parent returns 409. Cycle checks execute inside the same `UPDATE` statement to prevent two concurrent moves from creating a cycle. Deleting a node that still has child categories returns 409 without cascading deletion.
- Disabling a parent category hides all its descendants from clients while keeping them editable in admin. Re-enabling a parent restores descendants that are themselves enabled and whose entire ancestor chain is enabled.
- The import template includes parent-child examples. To reference a parent in the same batch, explicitly set the parent's `id` (UUID) and the child's `parentId`; ordering does not matter because the server topologically sorts before atomic insertion. Existing parent IDs may also be referenced. Omitting `parentId` creates a top-level category. Cycles, missing parents, or ID conflicts reject the entire batch without writing any rows.
- `0013_gray_reptil.sql` adds a nullable self-referencing `parent_id` and index; existing categories stay top-level with all other data unchanged. No fixed business depth limit is enforced; levels are queried on demand rather than downloading the entire tree in admin.

`GET /api/products/categories` is a public read-only unpaginated endpoint preserving parent filtering and ancestor-enabled filtering; cross-origin browsers still require the client CORS allowlist. Product keyword search is also public; cart and admin category management continue enforcing existing authentication and permissions.

The recursive visibility query for public categories is pinned to the existing `product_categories_parent_sort` index on parent ID to avoid full scans of enabled categories per node and prevent D1 overload; data and ancestor-enabled rules remain unchanged.

### Procurement cost and customer payment coverage verification

`purchase_quotes.cost_cny_cents` / `procurement_remote.cost_cny_cents` preserve the initial upstream procurement preview cost snapshot (merchandise, upstream domestic shipping, and explicit upstream fees), excluding this site's markup and service fees. Customer bills separately record goods selling price, service fee, shipping, and post-discount `total_cents`. Current HioBuy cost reads `order.total` from standard detail; `payment + shipping` returned by create preserves the existing adapter definition without adding any site fees.

Status sync and manual reconciliation take the net paid total of paid bills, convert it to CNY using each bill's historical exchange-rate snapshot, and compare against the current HioBuy cost using exact integer comparison without rounding away shortfalls. Coverage greater than or equal to cost proceeds normally; shortfalls transition to `review_required`. Missing reliable cost, paid bills, or historical exchange rates also remain in review and are never treated as zero. Unpaid bills do not count toward received funds, post-discount totals are not discounted a second time, and current display exchange rates are never used to recalculate historical revenue.

Pre-creation re-preview still validates seller, product, SKU, quantity, and purchasability; cost changes within customer-paid coverage are no longer blocked merely for differing from the old cost. Procurement payment still requires explicit staff action, re-querying and verifying remote order identity and cost coverage before paying, with `pay_amount` set to the current HioBuy cost rather than the historical preview cost or customer selling price. Protections for retries, unknown outcomes, cancellation, and identity mismatches remain independent; status sync never charges the customer wallet or auto-pays HioBuy.

### Confirming push and payment for pending orders

Staff with both `procurement.write` and `payments.money` can open "Push Procurement & Pay" from the order list, batch selection, or order detail. The modal displays order count, procurement cost cap, real HioBuy available balance, and projected remaining balance; staff without financial permissions retain the original push-only entry. When secondary payment verification is enabled, only one order is allowed at a time, reusing the existing payment verification endpoint.

After confirmation, the client invokes the existing `create -> sync -> pay` APIs one order at a time. HioBuy balance is re-read before each push; insufficient balance prevents creation. Creation must return an explicit result with a remote order ID, followed by sync verifying actual cost and payment status before requesting payment. `maxCostCnyCents` is the cap confirmed by the operator for this action; the server checks it during pre-create preview and pre-pay detail and halts if actual cost exceeds the cap, never substituting client-supplied amounts for real prices. Customer-paid checks, cost coverage, permissions, secondary verification, and persistent operation idempotency remain unchanged.

This flow is not a cross-system atomic transaction, nor does the projected balance reserve funds: if payment fails, the network drops, or secondary verification fails after creation succeeds, the created order is preserved and the remaining batch stops; the UI reports the outcome so staff can refresh remote status in detail before acting further. It never re-creates orders, auto-retries procurement charges, or re-charges the customer wallet. Ambiguous payment results also halt the batch. Server-side `pay` uses the current cost, while the amount cap strictly blocks payments exceeding the authorized maximum.

### Procurement cost and order profit display

Admin procurement info renders according to HioBuy payment status: when payment is unconfirmed, it displays estimated cost and unsettled status; when payment outcome is uncertain, it marks pending confirmation. Once payment is confirmed, `paid_cost_cny_cents` is stored as a snapshot that subsequent syncs never overwrite, while `cost_cny_cents` retains the original quote.

Profit for settled orders equals the net customer paid bill amount converted to CNY at the bill's historical exchange rate minus confirmed procurement cost, rounded to the nearest CNY fen. Discounts are not subtracted twice, and site service fees or markups are not added to procurement cost; this represents procurement gross profit excluding international freight and subsequent refunds. Profit is returned only to staff with the `earnings.read` permission.

Migration 0016 backfills historical cost only from explicitly succeeded procurement payment records; when reliable records are missing, the UI shows needs-review so actual paid cost can be obtained via remote order sync instead of passing off estimates as actual cost. Customer checkout and payment flows are unchanged.

### Public product keyword search

`POST /api/products/search` requires no login or Bearer token, preserving its request/response schema, product data filtering, and parameter validation. Rate limiting allows up to 20 requests/minute per client IP provided by Cloudflare, with missing IPs sharing a fallback bucket. Rate limiting is Worker-isolate scoped rather than a global quota. Cross-origin browsers still require the client origin allowlist. Product detail, link parsing, image search, cart, order creation, and payment continue requiring authentication. HioBuy keys remain server-side only.

### Procurement package linking and fulfillment inbound sync

When admin refreshes procurement status, the server reads `order.domestic_parcels[].tracking_number`, queries `GET /v1/fulfillment/packages?tracking_number=...&page=...&page_size=100`, and scans pages for an exact tracking-number match. Only when there is a unique match does it take `id`/`package_id` and then query `/v1/fulfillment/packages/{id}` to verify ID, tracking number, and external reference. Already-bound packages query detail directly by their stored ID; courier tracking numbers are never treated as fulfillment IDs.

Order items are matched using package `lines[].sku`/`quantity`; if the package uses a numeric SKU while this site stores `spec_id`, the server queries product detail using the original quote's product ID/channel, verifies the unique `variants[].sku_id -> upstream_sku_id` mapping, and caches it in the product snapshot for future reuse. Ambiguous identity or variant mappings are never guessed. The server then reuses an existing package for the same customer or creates a local package linked to the remote ID without issuing a new inbound pre-alert. Linking preserves split-parcel quantities, and repeated refreshes never create duplicates or over-allocate. Multiple tracking matches, customer ownership conflicts, non-unique SKUs, invalid quantities, and detail errors report explicit errors while keeping completed work so refreshes can resume after fixing. Procurement status sync may succeed while package linking fails; this never triggers re-procurement or payment.

Package lifecycle, weight, dimensions, and images reuse existing fulfillment detail sync. Pre-alert/`PENDING` alone does not count as arrival; once fulfillment confirms `RECEIVED` or a later warehouse stage, automatically linked item quantities on that package count toward arrivals, updating the order to partially stocked or stocked. Subsequent procurement refreshes, package list/detail fulfillment syncs, and receipt webhooks all reuse arrival writeback; scheduled procurement polling also reuses this query chain (see next section).

Migration `0017_complex_stick.sql` adds `receipt_source` on links (defaulting historical and manual links to `manual`) and a unique index on fulfillment package ID. Only `fulfillment`-sourced links are auto-written back; manual quantity edits switch the link to `manual` so later syncs do not overwrite it, nor do syncs restore manually unlinked items. Each automatic arrival records a `fulfillment_arrival` entry. If historical data contains duplicate bindings to the same fulfillment ID, the migration blocks release until ownership is verified and resolved manually without auto-deleting or merging packages.

Local real verification: `TG2611110001` on `DG2768` was linked via the filtered list to fulfillment ID `893` with allocated quantity 1, arrived quantity 0, and fulfillment status `PENDING`. Queries used read-only upstream endpoints without procurement payment or creating a new inbound pre-alert.

### Scheduled procurement status polling

Reuses the Worker's every-minute Cron to run procurement polling independently of fulfillment tasks. For orders with a remote order ID whose status is `created`/`unknown`/`review_required`/`cancel_pending` and not locally cancelled, polling runs every 5 minutes by default, reusing procurement `sync -> link fulfillment ID by tracking number -> fulfillment detail and inbound quantity sync`. It is read-only and never auto-creates procurement orders, submits pre-alerts, pays, or refunds; skipped when no key is configured.

Each Cron invocation processes at most 5 orders sorted by next run time and stops starting new orders 50 seconds after launch; each order has a 45-second query budget and a 25-second upstream request timeout. The database persists next run time, failure count, error code, and a 2-minute lease; concurrent Cron ticks allow only one instance to claim an order, and interrupted runs retry once the lease expires. Failures back off at 5/10/20/40/60 minutes and reset on success; a single failure does not block other orders, and error logs never store secrets or raw responses.

Cancelled, fully stocked, packed, and shipped orders stop procurement polling. Partially stocked, after-sales, and exception orders continue polling; manual refreshes reschedule checks, and manual edits to links/arrival quantities wake stopped orders. Orders without a confirmed remote order ID never guess identity and still require manual reconciliation. Polling is triggered by Workers Cron after deployment and applying migration 0018; local dev does not automatically trigger production Cron.

Migration `0018_workable_natasha_romanoff.sql` adds polling schedule columns and a due-time index to `procurement_remote`; historical queryable orders enter initial polling by default without modifying amounts or payment statuses.

## Customer manual purchase orders

Manual customer item submission and admin review/submission workflows are integrated for JD, Pinduoduo, and Dewu and are separately marked as manual orders. See [Customer manual purchase orders](manual-purchase.md) for the workflow, payment boundaries, and recovery rules.

## Customer order filtering, counts, and cancellation

- `GET /api/purchase-orders`: retains pagination and adds `q` (max 120 chars; literal substring match on order number, internal ID, product name, and variant) and `status` business progress filtering.
- Business progress stages: `awaiting_payment`, `pending`, `buying`, `transit`, `partial`, `stocked`, `packed`, `shipped`, `exception`, `after`, and `cancelled`. `awaiting_receipt` filters both `transit` and `partial` together. Reuses the same SQL projection as Admin without mutating underlying payment or fulfillment states.
- List and detail responses add `stage` and `canCancel`, while the original `status` field remains local `draft`/`cancelled`. The `status` query parameter filters against the returned `stage`.
- List returns `counts`; counts can also be fetched separately via `GET /api/purchase-orders/counts?q=...`. Counts only include orders belonging to the authenticated customer matching the search query, ignoring stage filter and pagination, returning 0 for empty buckets. `all` is the total, and `awaiting_receipt=transit+partial` should not be double-counted.
- `POST /api/purchase-orders/:id/cancel` accepts `{ "confirm": true, "reason": "Cancellation reason" }` (`reason` 1–500 chars). Allowed only for unpaid orders that have not been submitted for procurement, have no active package links, and have no ongoing after-sales, including unsubmitted manual orders.
- An atomic D1 batch cancels the order, voids unpaid bills, and records the reason, with a unique change marker preventing duplicate logs; database conditional guards make it mutually exclusive with payment and procurement submission. Repeated cancel requests idempotently return the original order. Unauthorized resources return 404, and disallowed states return 409.
- This endpoint neither cancels procurement on HioBuy nor issues refunds. Paid or already-pushed orders must contact operations; `canCancel` is only a point-in-time hint and is re-verified server-side on execution.
- This change only extends customer APIs and documentation, without modifying the customer frontend or requiring database migrations.

## Product search filtering and sorting

Verified against HioBuy official `/v1/products/search` OpenAPI 1.0.8 on 2026-11-12 and synced to public `POST /api/products/search` and admin product search. Both reuse `productSearchInput` validation and forward validated parameters verbatim through the server.

| Field | Meaning & constraints |
| --- | --- |
| `sort` | `PRICE_ASC`, `PRICE_DESC`, `SALE_QTY_ASC`, `SALE_QTY_DESC`; omitted for default relevance sort |
| `sort_field` / `sort_order` | `price`, `sales`, `credit` paired with `asc`/`desc`; also accepts full sort tokens and official aliases `bid`, `sale`, `monthSold`, `rePurchaseRate`. Full tokens carry their own direction; `credit` is 1688-only and ignored by Taobao |
| `price_start` / `price_end` | CNY yuan, decimals allowed, non-negative, min cannot exceed max; no fen or customer-currency conversion |
| `ship_within_hours` | `0`, `24`, `48`; `0` means same-day dispatch; 1688-only, ignored by Taobao |
| `experience_score_level` | 1688 experience score 1–4 |
| `product_attrs` | Comma-separated 1688 tags, e.g. `isOnePsale,isOnePsaleFreePost,new7,new30,1688Selection,isQqyx` |
| `filter` | Comma-separated 1688 native filter keys, merged with semantic filters by HioBuy |
| `category_ids` | Comma-separated 1688 category IDs; not this site's product category UUIDs |
| `category_id` / `category_id_list` | Deprecated upstream compatibility parameters; prefer `category_ids` |
| `product_collection_id` | 1688 business product pool ID |
| `sale_filters` | Array of 1688 sales range items; each item has `sale_type` in `sales7`/`sales14`/`sales30`/`totalSales` and optional string `sale_start`/`sale_end` |
| `keyword_translate` | Boolean toggle for 1688 keyword translation |
| `user_id` | Optional Weidian search user ID; defaults to the upstream authorized account `openid` when omitted |

Existing `keyword`, `channel`, `page`, `page_size`, and `language` remain compatible. New optional parameters have no implicit local defaults; prefer using either `sort` or `sort_field + sort_order`. Actual per-platform behavior depends on HioBuy support, and 1688-specific features are not promised for Weidian or Taobao. Locally, filter strings are capped at 2000 characters, product collection IDs at 200 characters, and `sale_filters` at 20 items.

```json
{
  "channel": "1688",
  "keyword": "T-shirt",
  "sort_field": "sales",
  "sort_order": "desc",
  "price_start": 10.5,
  "price_end": 80,
  "ship_within_hours": 24,
  "experience_score_level": 3,
  "product_attrs": "isOnePsale,new30",
  "sale_filters": [{ "sale_type": "sales30", "sale_start": "100" }],
  "keyword_translate": false
}
```

`response_format: standard` remains enforced, and clients cannot request `raw`/`upstream` formats; returned DTOs continue stripping procurement costs and internal seller data. Filter price bounds are not customer payable prices, and payment still uses server-side quotes.

## Platform cart grouped by shop (CNY display prices)

`GET /api/cart` requires login and returns all standard and manual cart items for the current customer without pagination; legacy `page`/`pageSize` parameters are ignored. The response uses `data.groups[].items` and no longer returns top-level `items`/`page`/`pageSize`. `groups` contains both standard shop groups and manual item shop groups; legacy `GET /api/cart/manual-items` has been removed and everything is read through `GET /api/cart`. The customer frontend is not modified here; standalone clients must integrate with the new schema.

```json
{
  "data": {
    "currency": "CNY",
    "displayOnly": true,
    "groups": [{
      "key": "[\"1688\",\"shop\",\"seller-1\"]",
      "channel": "1688",
      "shop": { "id": "seller-1", "name": "Sample Shop", "url": null },
      "items": [{
        "id": "cart-item-uuid", "channel": "1688", "productId": "product-1", "skuId": "sku-1",
        "quantity": 2, "version": 1,
        "product": { "id": "product-1", "channel": "1688", "title": {"original":"Sample Product"}, "sourceUrl": null, "images": [], "variants": [], "pricing": "preview_required" },
        "shop": { "id": "seller-1", "name": "Sample Shop", "url": null },
        "currency": "CNY", "displayOnly": true,
        "unitPriceCents": 1362, "subtotalCents": 2724, "priceComplete": true,
        "snapshotAt": 1794500000000, "createdAt": 1794500000000, "updatedAt": 1794500000000
      }],
      "totalQuantity": 2, "subtotalCents": 2724, "priceComplete": true
    }],
    "total": 1, "totalQuantity": 2, "subtotalCents": 2724, "priceComplete": true
  },
  "requestId": "req_example"
}
```

- Grouping keys are based on platform and HioBuy standard detail `seller.id`; `seller.name` and `seller.shop_url` are display-only and return `null` when missing. Items are never merged by shop name, and unknown shops form individual groups per item. Cart grouping does not replace same-seller validation during preview, nor is `shop.id` guaranteed to work with all shop search parameters.
- `unitPriceCents` takes the selected SKU's `price.original_currency=CNY` and `original_amount` (CNY yuan), converts to integer fen, and applies existing product percentage markup and fixed per-item markup. It uses current pricing settings without FX conversion. This is merchandise selling price only, excluding service fees, domestic shipping, and international freight, and does not assume promotional or tiered discounts apply.
- Item subtotal = display unit price * quantity. Shop and cart subtotals sum their respective item subtotals. `total` is the count of SKU entries, and `totalQuantity` is the sum of quantities. An empty cart returns empty `groups` and 0 totals.
- When SKU price is missing, non-CNY, invalid, or valid product pricing is unconfigured, unit price/subtotal are `null` and `priceComplete=false`; if any item lacks a price, its shop and cart subtotals are also `null`—missing prices are never treated as 0 and product minimum prices never substitute for SKU unit prices.
- Product info, images, stock, and base price come from the snapshot taken on add/update; `snapshotAt` is the capture timestamp (Unix ms) and not a live price guarantee. Cart add and update responses also include `shop` and the display price fields above. Internal cost stays inside the cart snapshot and is never exposed along with markup rules or raw upstream data.
- Legacy cart snapshots attempt lazy backfill on first read, deduplicated by product with at most 4 concurrent requests. Each user is capped at 20 product attempts/minute (Worker-isolate scoped); unbackfilled items are still returned and retried on subsequent reads; when upstream or integration config is unavailable, original product data is preserved with empty shop and `null` amounts. Writebacks guard on customer ownership, version, and original snapshot so concurrent quantity/snapshot edits are not overwritten.
- `POST /api/cart/preview` accepts `{items:[{id,type,version}]}` up to 50 items across platforms, shops, and manual entries; each split order is re-validated and quoted, and display amounts are never used for checkout or payment verification. Its response format has moved to unified preview; see "Unified cart preview and checkout (0032)" below.
- Data extends the existing `cart_items.product` JSON snapshot without requiring a new database migration.

### Cart badge count

`GET /api/cart/count`: requires login, takes no parameters. Counts both standard and manual cart items for the current user, excluding submitted and removed records.

```json
{"data":{"total":2,"totalQuantity":5},"requestId":"req_example"}
```

`total` is the count of SKU entries (distinct SKUs of the same product count separately), and `totalQuantity` is the sum of item quantities. An empty cart returns 0 for both. Both values come from a single database aggregate query without reading product snapshots, calling HioBuy, backfilling legacy data, or depending on pricing settings, making it suitable for client badges. Clients can re-query after adding, removing, or editing cart items.

## Standard purchase order remarks, attachments, and coupon codes

The order-level remark and attachment examples in this section are retained only for legacy caller compatibility. New integrations should use the `items` request structure under "Standard purchase order checkout: SKU-level remarks and attachments" below; the coupon flow continues to apply.

This section applies to standard procurement on 1688, Taobao, and Weidian. Manual orders keep their existing remark and product image protocol and do not yet support coupon codes. The customer frontend is outside the scope of this change.

1. Upload images via `POST /api/uploads/images`; keep the returned `id`, up to 5 images. Unexpired temporary images are supported.
2. `POST /api/purchase-orders/preview` or `POST /api/cart/preview` may include `couponCode`. The server verifies enabled status, validity window, settlement currency, minimum spend, and remaining redemptions. Preview does not consume a redemption.
3. `POST /api/purchase-orders` example:

```json
{
  "id": "order-checkout-UUID",
  "quoteId": "preview-quote-UUID",
  "remark": "Please verify size; see attached image for style",
  "attachmentUploadIds": ["image-id-returned-by-upload-api"],
  "couponCode": "WELCOME10"
}
```

`remark` is capped at 1000 characters and defaults to empty when omitted; up to 5 unique attachments are allowed, each still subject to the upload API's PNG/JPEG, 3 MiB, and dimension limits, with external URLs disallowed. The server verifies uploader ownership, expiration, and actual file format before copying into isolated private order images; expiration or deletion of the original temporary upload does not delete the order copy. Recoverable checkout failures clean up copied images from that attempt; since R2 and D1 do not share cross-service transactions, abrupt process termination can leave unreferenced orphan copies without public access paths, which subsequent storage sweeps can clean up.

Checkout retries must preserve the original `id` and full request payload; mismatched payloads return 409, and retrying an already-succeeded order never duplicates image copies, coupon reservations, or charges. Historical orders without these fields remain readable.

### Coupon calculation and lifecycle

- Uses existing admin coupon settings, trimming whitespace and uppercasing codes; one coupon per order, no stacking. Coupon codes are local to this site and are not sent to HioBuy.
- Threshold and discount base equal `goods + service fee + domestic shipping` in the customer's settlement currency (excluding future international freight). Fixed discounts are in minor units of the settlement currency; percentage discounts specify the reduction rate (e.g. `10` means 10% off), rounded to the nearest minor unit. Discounts cannot reduce the payable amount below zero.
- Preview returns `couponCode`, `discountCents`, and post-discount `totalCents`; CNY `referencePrice` adds a reference `discountCents` for display only without changing the customer settlement currency.
- Order creation can inherit the quote's coupon code or supply `couponCode` when the quote had none. A different code cannot replace one already on the preview, and any change in coupon version or discount amount requires a fresh preview.
- Order creation writes the order, bill, and a `reserved` redemption record in a single atomic D1 batch; the database re-checks coupon version, validity window, and redemption limit so only one order wins the last remaining slot under concurrency. A successful preview does not guarantee final redemption.
- Payment charges only the post-discount bill amount and atomically transitions the redemption to `redeemed`; duplicate requests never double-charge or double-redeem. Canceling an unpaid order or having operations void the bill atomically transitions the redemption to `released`, freeing the slot. Created orders preserve a discount snapshot so later coupon edits or deactivation do not alter existing bills.
- Unpaid order reservations do not expire automatically; the order must be cancelled or the bill voided. There are currently no per-customer claim/use limits. If post-discount customer payment falls below HioBuy cost, existing procurement cost coverage checks still apply and will not auto-approve loss-making procurement.

### Response and access

Customer order list and detail add `remark`, `attachments`, and `coupon`. `attachments` contains `id`, `filename`, `contentType`, `size`, `createdAt`, and `url`; `coupon` contains code, currency, discount amount, and `reserved`/`redeemed`/`released` status (`null` if unused). The bill's existing `discountCents` remains the authoritative discount amount.

- Customer attachment download: `GET /api/purchase-orders/:id/attachments/:attachmentId`, verifying order ownership.
- Admin attachment download: `GET /api/admin/procurement/:id/attachments/:attachmentId`, reusing `procurement.read`; admin detail API also returns remark, attachment URLs, and coupon details.
- Attachments return `private, no-store` and `nosniff`, without exposing R2 keys. Remarks and attachments are for internal site operations and are not automatically forwarded to HioBuy.

Migration `0024_odd_power_man.sql` adds `purchase_order_details`, `purchase_order_attachments`, and `purchase_coupon_redemptions` without modifying existing orders or amounts. Apply the migration before deployment.

## Product detail and tiered display pricing

`POST /api/products/detail` and `POST /api/products/parse` add the following fields to `data.product`; the corresponding admin detail/parse endpoints support them as well. Requests are unchanged and the customer frontend is not modified.

```json
{
  "price": { "currency": "CNY", "displayOnly": true, "unitPriceCents": 1150, "promotionPriceCents": 1040 },
  "minOrderQuantity": 2,
  "orderQuantityMultiple": 2,
  "priceTiers": [
    { "minQuantity": 2, "unitPriceCents": 1150, "promotionPriceCents": null },
    { "minQuantity": 10, "unitPriceCents": 1040, "promotionPriceCents": null }
  ],
  "variants": [
    { "skuId": "sku-1", "stock": 100, "image": null, "attributes": [],
      "price": { "currency": "CNY", "displayOnly": true, "unitPriceCents": 1150, "promotionPriceCents": null } }
  ],
  "pricing": "preview_required"
}
```

All prices are in **CNY fen**. They are read from HioBuy standard detail `price.original_amount`, SKU `price.original_amount`, and product `price_tiers[].price` (in CNY yuan), applying the same product percentage markup + fixed per-item markup rules shared with cart and order pricing. Promotional reference prices come from `promotion_amount` and `promotion_price` respectively, with markup applied as well. Service fees, domestic/international shipping, and coupons are excluded from these product display prices.

- `price` is the upstream product-level reference price and cannot replace the selected SKU's unit price; if an SKU lacks a valid price, the product minimum price is not used as a fallback.
- `priceTiers` are product-level tiers sorted by `minQuantity` ascending. Returns an empty array if there are no tiers; tiers with invalid quantities or non-CNY currencies are omitted, and valid tiers with malformed prices return `null` amounts. Maximum quantities are not inferred, nor are tiers guaranteed to accumulate across SKUs or apply to every SKU.
- `minOrderQuantity` is the upstream minimum order quantity, returning `null` if no valid value exists.
- `orderQuantityMultiple` sits alongside `minOrderQuantity` and maps upstream `order_quantity_multiple` (batch step multiple). Only safe positive integers are accepted; missing or invalid values return `null` without defaulting to 1. Returned by both detail and link parse; this only adds response fields while leaving checkout and preview validation unchanged.
- When price is missing, non-CNY, invalid, or valid product pricing rules are unconfigured, amounts return `null` without exposing raw procurement costs or guessing retail prices. Exchange rates do not participate in computing these CNY display amounts.
- Display prices and promotional eligibility are not locked; actual settlement still goes through `POST /api/purchase-orders/preview` (or cart preview) to re-verify stock, MOQ, tier eligibility, discounts, and payable amounts.
- Search, shop search, and image search list responses retain their existing protocol; this change extends only detail and link parse with no database migration.

## Product description, rich detail, shop, and videos

Customer `POST /api/products/detail`, `POST /api/products/parse`, and the corresponding admin detail/parse endpoints return the following on `data.product`:

```json
{
  "description": {"original":"<p>Product description (original)</p>", "translated":"<p>Product description</p>", "language":"en"},
  "shop":{"id":"seller-id", "name":"Shop Name", "url":null},
  "videos":{"main":"https://cdn.example.com/main.mp4", "detail":null}
}
```

- `description.original`/`translated` return the HioBuy description verbatim (which may include HTML), with no HTML sanitization, text extraction, entity decoding, or truncation; `language` preserves the upstream description language. Missing fields return `null`, without auto-translating or copying the original into the translation.
- The API does not render HTML; callers decide how to present it.
- Detail images remain inside the `description` HTML without altering the existing `images` main-image array.
- `shop.id`/`name`/`url` map from upstream `seller.id`/`name`/`shop_url` and expose only these three display fields; missing shop info returns `null` fields without guessing shop URLs or leaking other merchant account metadata.
- `videos.main`/`detail` map from the identically named fields on the upstream product video object, returning URL-validated links or `null` when missing or unsupported; the server does not download, proxy, or autoplay videos.
- These fields are returned only on detail/parse responses; compact snapshots in search lists, favorites, and browsing history remain unchanged. Pricing, tiered pricing, and preview/checkout logic are unchanged; the customer frontend is not modified and no database migration is required.

### Product-level attributes

`data.product.attributes` on product detail and link parse (and the corresponding admin endpoints) returns product-level display attributes using upstream field names:

```json
{
  "attributes": [
    {"attribute_id":"123", "name":"Material", "value":"Cotton", "original_name":"Material (original)", "original_value":"Cotton (original)"}
  ]
}
```

- `name`/`value` are upstream display names and values whose translation depends on the requested `language` and actual upstream output; `original_name`/`original_value` preserve the source strings.
- `attribute_id` is the upstream attribute ID normalized to a string (`null` if omitted); any other missing or non-string fields return `null`. No additional internal upstream fields are passed through.
- Returns `[]` when no attributes exist. These are descriptive product specifications and are not used for SKU selection; SKU options still come from `variants[].attributes` and checkout still uses `skuId`.
- Search lists, favorites, and browsing history snapshots do not add product-level attributes; no database migration or customer frontend changes are involved.

## Standard purchase order checkout: SKU-level remarks and attachments

After quoting, `POST /api/purchase-orders` submits per-SKU remarks and attachments via `items`:

```json
{
  "id": "order-checkout-UUID",
  "quoteId": "preview-quote-UUID",
  "couponCode": "WELCOME",
  "items": [
    {
      "productId": "product-ID (preview lines[].id)",
      "skuId": "SKU-ID (preview lines[].spec_id)",
      "remark": "Please confirm color per attached image",
      "attachmentUploadIds": ["uploadId-returned-by-user-image-upload-api"]
    }
  ]
}
```

- `items` is optional with up to 20 entries; each matches the current quote strictly by `productId + skuId`, disallowing out-of-quote items or duplicate SKUs. Omitted SKUs default to `remark: ""` and `attachments: []`. Quantities and prices still come from the server quote and cannot be edited here.
- Each SKU remark is limited to 1000 characters, each SKU up to 5 images, and each order up to 20 images total (including legacy order-level attachments). Images remain restricted to valid PNG/JPEG files uploaded by the current user, up to 3 MiB each. Valid temporary images are copied into private order attachments that persist even after the original upload expires.
- Create, customer list/detail, and admin detail return `items[].remark` and `items[].attachments`; attachment metadata and authenticated download paths are unchanged. Clients can read only their own order images, and admin reuses `procurement.read`. Admin detail renders them beneath the corresponding line item without changing the customer frontend.
- Idempotent retries must preserve the same `id`, `quoteId`, `items` content and ordering, and all other parameters; retrying an already-created order with modified SKU remarks or attachments returns 409. The order, item remarks, attachment index, and bill are written in one D1 batch, cleaning up copied R2 objects on failure.
- Root-level `remark` / `attachmentUploadIds` remain solely for legacy caller compatibility, and root-level response `remark` / `attachments` contain only legacy order-level data. Historical records do not guess SKU attribution or duplicate attachments across SKUs; new integrations should use `items`.
- Coupon codes remain order-level; quoting, customer payment, and HioBuy push logic are unchanged, and remarks/attachments remain internal to site operations without automatic forwarding to HioBuy. This change targets the standard purchase order checkout endpoint; manual purchase order endpoints keep their existing protocol.
- Apply migration `0025_opposite_raider.sql` before deployment: adds `purchase_item_details` and a nullable `item_id` foreign key on `purchase_order_attachments`. Existing data is preserved, with `item_id=null` indicating legacy order-level attachments.

## Immediate awaiting-payment on checkout and manual order balance top-up

- Standard checkout continues atomically creating an `issued` bill; admin-created orders also automatically issue a bill from operator-confirmed CNY cost and system pricing, rejecting creation if pricing config is missing so no unbilled new drafts are left behind.
- New manual orders issue an estimated prepayment bill based on customer-declared cost, requiring payment before operations submit procurement; once real prices are confirmed, the initial pricing and exchange-rate snapshot is preserved, shortfalls require a balance top-up, and overpayments are held for manual handling. See [Manual purchase orders](manual-purchase.md).
- Business progress stages no longer output `draft`; unpaid orders that have not entered procurement uniformly report `stage=awaiting_payment`; internal `status=draft/cancelled` remains unchanged and must not be used as the display state. Historical unbilled orders do not fabricate charges and can be handled in the expandable bill section of admin detail; orders without a bill cannot be paid.
- Customer/admin bills add `paidCents` (cumulative paid), `dueCents` (remaining payable), `overpaidCents` (overpayment pending handling), `estimated` (estimated prepayment flag), and `version`. All amounts are in minor units of the bill currency.
- `POST /api/purchase-orders/:id/pay` keeps `{ "confirm": true }` for initial payment. Balance top-ups must send `{ "confirm": true, "billVersion": 3, "amountCents": 320 }` matching the current bill `version` and `dueCents`, never the full bill total. Stale versions, mismatched amounts, or missing explicit top-up confirmation return 409; repeated succeeded requests do not double-charge.
- Balance top-ups accumulate into the same bill's paid amount, with initial payment and top-up each writing separate wallet ledger entries, protected against double-charging by database transactions and version checks. Bills that have received partial payments cannot be normally voided so received funds are never lost.
- Apply migration 0026 before deployment, preserving historical paid bill records. The customer frontend is not modified; standalone clients should read the new fields and clearly indicate estimated prepayment, balance top-up, and overpayment states.

## Procurement bill Stripe payment

Clients integrate via API only; the customer frontend is not modified here. Standard orders, manual estimated prepayment orders, and post-confirmation manual balance top-ups all support card payment; the server reads the bill settlement currency and `totalCents - paidCents`, never re-pricing from CNY display amounts and never topping up or debiting the customer wallet.

1. Fetch order detail and read `version`, `dueCents`, and `currency` from the active bill; zero-amount bills continue using existing `/pay` confirmation.
2. Call `POST /api/purchase-orders/:id/stripe`:
   ```json
   { "id": "client-generated-persisted-UUID", "confirm": true, "billVersion": 1, "amountCents": 250 }
   ```
   `amountCents` must equal the current `dueCents`. Returns `paymentId`/`orderId`/`sessionId`/`url`/`status`/`amountCents`/`currency`. `id` serves as a persistent idempotency key; after network failures, retry with the original parameters and original `id`. If a page refresh or duplicate tap generates a new `id`, the server recovers the existing payment when the same bill, customer, order, version, currency, and unpaid amount match, returning the original `paymentId` and Checkout URL instead of creating a second payment. Clients must store and use the returned `paymentId` for polling or cancellation rather than assuming it equals the submitted `id`. If the original payment has not yet received a `sessionId`, recovery still uses the original Stripe idempotency key and frozen redirect URLs; concurrent requests are guarded by database unique constraints. Both create and status APIs are restricted to the order's owning customer.
3. Open `url` in the system browser and poll `GET /api/purchase-orders/:id/stripe/:paymentId` and order detail; after an app restart, call `GET /api/purchase-orders/:id/stripe` to recover the latest payment attempt (returns `null` if none exists). Success and cancel return URLs are fixed to this site's order page (`APP_URL` preferred) and never accept arbitrary redirect targets. Redirecting to the success URL is not proof of settlement.
4. `pending` means awaiting payment/confirmation, `paid` means settled, `expired` means the Checkout session closed or creation was explicitly rejected so a new payment can be started, and `review` means manual reconciliation is required and no further payment may be initiated.
   When the create endpoint encounters a record in review, it returns HTTP 409, `PAYMENT_REVIEW`, and a prompt to contact support, with `error.details` containing the original `paymentId` and `status: "review"`; the status endpoint continues returning `status: "review"`. When the creation outcome is unknown, it returns HTTP 503 and `PAYMENT_PENDING`, where `error.details.paymentId` is the original payment ID to keep recovering. Recovering an existing Checkout link does not actively query Stripe; paid and expired statuses still update via verified webhooks or server-side checks on the cancel endpoint.
5. Before switching back to wallet payment, call `POST /api/purchase-orders/:id/stripe/:paymentId/cancel` with `{ "confirm": true }`. The server unlocks the bill only after confirming the Stripe session has expired; if payment already completed, it reconciles first, and if still processing it returns 409. Browser back navigation, closing the window, or network timeouts do not unlock the bill. When creation outcome is unknown and there is no `sessionId`, retry with the original `id` first to recover the session. Creations still unknown after 23 hours are not automatically recreated and require manual reconciliation to avoid duplicate creation after Stripe idempotency keys expire.

During payment, the database locks the bill, disallowing wallet payment, order cancellation, and bill voiding. Webhooks verify actual `amount_total`/`currency`, order/bill/customer identity, and bill version, updating received funds, payment record, and coupon redemption in one atomic D1 batch; duplicate webhooks and concurrent requests never double-credit. Payment does not automatically create a HioBuy procurement order or pay HioBuy.

### Stripe configuration and deployment

Reuses the enable toggle, Secret Key, and Webhook Secret from Admin payment settings. Apply `0027_freezing_toad.sql` before deployment, adding `purchase_stripe_payments` to persist payment attempts without altering historical bills. Checkout permits card payments only (`allowed_payment_method_types: ["card"]` in the current Stripe SDK).

Reuses `/api/payments/stripe/webhook`; at minimum subscribe to these Stripe events:

- `checkout.session.completed`, `checkout.session.async_payment_succeeded`
- `checkout.session.expired`, `checkout.session.async_payment_failed`
- `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`

Invalid signatures never settle; unpaid `completed`/`failed` events do not unlock sessions that remain payable. Unlocking happens only on expiration events or explicit cancellation. Payment records are written to `payments` with `purpose=purchase`, linked to the order and bill via the payment attempt's `id`.

Automatic procurement refunds are not provided in this phase: the generic payment refund button is disabled for procurement payments. Stripe refund or dispute webhooks mark the payment `held`/`review`, retain the original receipt record, block further procurement and new payments, and wait for order-level manual reconciliation without implicitly debiting the customer wallet or recalculating historical bills. Closed/withdrawn disputes also require manual verification before releasing holds rather than auto-resuming procurement.

Reference: [Stripe Checkout post-payment events](https://docs.stripe.com/payments/existing-customers?platform=web&ui=stripe-hosted).

## Order detail display fields

`GET /api/purchase-orders/:id` adds the following read-only fields. The customer frontend remains unchanged, standalone clients integrate directly, and no database migration is required.

- `items[].currency`/`unitPriceCents`/`subtotalCents`: frozen merchandise selling prices from the active valid bill in minor units of the settlement currency. Unit price is rounded from line total divided by quantity, with `subtotalCents` authoritative when rounding differs; excludes service fees, shipping, and order-level coupon allocation. `referencePrice.currency=CNY` provides CNY unit price and subtotal from the same snapshot without recalculating via current exchange rates. Returns `null` if the snapshot is missing or fails to match, never falling back to internal procurement cost.
- `bills[].paymentMethod`: `wallet`, `stripe`, `mixed`, or `null`. `paymentMethods` lists the actual collection methods used; `paymentHistory` contains `id`, `method`, `amountCents`, `currency`, `status`, and `paidAt` (Unix ms). Initial wallet payment followed by a Stripe top-up preserves both entries. Pending Stripe sessions are not listed as collected; collected records marked `held`/`review` retain their status, and bill `paidCents` remains authoritative for settled amounts. Historical bills without verifiable ledger records do not guess payment methods.
- `logistics.domesticParcels`: domestic `trackingNumber`, `carrier`, warehouse `packageId`/`publicId`, `status`, linked `items` (`itemId`, `quantity`, `receivedQuantity`), and `warehouseEvents`. Even before warehouse binding, tracking numbers present in the procurement snapshot are returned with `null` warehouse fields. `warehouseEvents` represent warehouse milestones; domestic courier tracking is provided separately via `events`/`statusLabel`/`trackingStatus` from the HioBuy procurement logistics endpoint.
- `logistics.internationalShipments`: includes only international shipments belonging to the same customer linked via the order's packages. Returns `shipmentId`/`publicId`, `packageIds`, `status`, `trackingNumber`, `carrier`, `events` (`at`/`title`/`location`), and `trackingStatus`. Detail reuses existing international shipment tracking queries; missing tracking or transient query errors return `unavailable` with empty `events` without fabricating milestones or blocking other detail fields. Order lists return only local tracking numbers and `not_loaded` to avoid per-order external calls.

All fields are generated server-side after order ownership authorization. Payment methods reflect customer payments only and never substitute HioBuy procurement payment methods. Raw bill rules, procurement costs, Stripe payment credentials, and other customers' packages or shipments are never returned.

## Domestic parcel courier tracking

"Check Domestic Logistics" in the Admin "Procurement Orders" list queries carrier, status, and tracking events for each parcel of an order by calling `GET /api/admin/procurement/:id/logistics` (`procurement.read` required). "Check International Logistics" in the Admin "Shipments" list calls `GET /api/admin/shipments/:id/tracking` (`shipments.read` required) to view carrier tracking after dispatch.

Verified against HioBuy official OpenAPI 1.0.11 (2026-11-17): `POST https://api.hiobuy.com/v1/orders/logistics/trace` supports `channel=1688/taobao/weidian/manual`. Uses persisted `procurement_remote.remote_id` as `order_id` with `response_format=standard`; Weidian additionally requires `express_no`. Warehouse `packageId`, site order number, or courier tracking numbers are never passed in place of the upstream procurement order ID.

Customer endpoint: `GET /api/purchase-orders/:id/logistics?trackingNumber=domestic-tracking-number`. The parameter is optional; when provided, it must match an active package link or saved procurement snapshot on that order, returning 404 for unknown tracking numbers. Order ownership is verified before any upstream call, and HioBuy keys always stay on the server. For Weidian without a `trackingNumber` parameter, the server queries existing tracking numbers on the order with up to 3 concurrent requests; when no tracking numbers exist, it returns `not_ready` without issuing arbitrary tracking queries.

Returns `{channel,trackingStatus,packages:[{trackingNumber,carrier,statusLabel,events,trackingStatus}]}`, wrapped in `{data,requestId}`.

- `available`: tracking events exist.
- `empty`: query succeeded with no events.
- `not_ready`: no queryable remote order yet, or Weidian has no tracking number yet.
- `unavailable`: missing configuration, upstream permission/network error, or unexpected response structure; internal upstream error details are not leaked. Partial failures across multiple parcels retain succeeded `packages`.
- List responses do not query live tracking and return `trackingStatus: "not_loaded"`.

Standard responses must match the requested `tracking.channel`/`order_id`. Only `tracking.packages[].tracking_number`/`status_label`/`carrier.name`/`steps` are extracted, without forwarding other response fields. `events` preserves the raw node objects from `steps`: official OpenAPI only specifies unified `packages` and trace `steps` without fixing internal step fields, so they cannot be assumed identical to international tracking's `at`/`title`/`location`. Unknown or invalid structures never fabricate tracking events.

Order detail `logistics.domesticParcels[]` also adds `events`/`statusLabel`/`trackingStatus`, matched strictly by exact tracking number so one parcel's tracking is never assigned to another. `warehouseEvents` retains its distinct semantics. Newly discovered tracking numbers not yet checked into the warehouse can still be displayed with `packageId`/`publicId` set to `null`, without writing warehouse records or changing receipt status.

Read-only live test: Existing test order `DG2768` returned HTTP 200 with matching standard identity fields, one parcel, and empty `steps`; thus live endpoint connectivity and the empty-trace branch are verified, while the non-empty trace branch is verified via mock contract tests with no real non-empty step sample yet. No procurement order was created, paid, or written to warehouse records. No database migration is required, and the customer frontend is unchanged.

Official docs: [HioBuy OpenAPI](https://api.hiobuy.com/openapi.json).

## Single-table unified cart (migration 0029)

Both standard SKUs and manual item forms are stored in `cart_items`, distinguished by `type=standard/manual`. Manual entries still store the full `form` JSON along with their initial request, version, submission state, and `order_id`. The primary key is `(id,type)` so migration will not overwrite rows if IDs collided across the two legacy tables. All reads and writes check both customer ownership and type, so standard edit/delete endpoints cannot mutate manual entries; unified preview and checkout support mixing both types.

`GET /api/cart` returns both types in one unpaginated response:

- `groups`: unified array of shop groups (`manualItems` is no longer returned). Each group has `key`/`channel`/`shop`/`items`/`totalQuantity`/`subtotalCents`/`priceComplete`. Standard groups have `type=standard` and continue aggregating by platform and real `shop.id`. Manual groups have `type=manual`, `shop.name` from `sellerName`, and `shop.id=null`; each manual form is its own group and is not merged by matching shop name.
- Manual group `items` retain the full entry `{type:"manual",id,form,version,state,createdAt,updatedAt,quantity,unitPriceCents:null,subtotalCents:null,priceComplete:false}`; `quantity` is the total unit count across the form, and only `draft`/`submitting` entries are listed. `form.items` holds the individual product lines. Clients iterate uniformly over `groups` while continuing to use the original entry `id` and `version` for edits and submissions. Groups are ordered by latest modification time.
- `standardTotal`/`manualTotal`: count of standard SKU entries / count of manual forms. `total` is their sum, not the count of individual manual line items.
- `totalQuantity`: standard quantities plus total item quantities across all active manual forms. `GET /api/cart/count` returns `total`/`totalQuantity` using the same definition without reading product snapshots or calling external APIs.
- `standardSubtotalCents`: CNY display subtotal of standard items; whenever manual items exist, cart-level `subtotalCents=null` and `priceComplete=false`. Customer-declared manual prices are not system selling prices, and actual payable amounts are determined by bills generated at checkout.

The legacy manual `GET` list endpoint has been removed; manual create, edit, delete, and single-entry checkout endpoints remain available and operate on the same table. Both order types can be mixed in unified preview/checkout, while payment still uses existing wallet or Stripe endpoints per generated sub-order. The customer frontend is unchanged.

Migration `0029_burly_quicksilver.sql` rebuilds `cart_items`, copies all records from both legacy tables, and drops `manual_cart_items`, including submitted/removed history to preserve checkout retry idempotency. Old server versions are incompatible after migration; schedule a maintenance window and backup before running the migration together with the new release, and do not roll back only the old code. Local environments run the migration automatically; remote execution requires separate deployment authorization.

The legacy built-in client `ManualCartPage` still references the removed `GET /api/cart/manual-items`; per current policy the legacy client frontend is no longer maintained, and standalone clients should read `groups` from `GET /api/cart`.

## Unified cart preview and checkout (0032)

`POST /api/cart/preview` now returns a unified preview and no longer returns a `quoteId` directly usable for single-order checkout. Legacy clients must switch their checkout step to `POST /api/cart/checkout`; direct product checkout endpoints `/api/purchase-orders/preview` and `/api/purchase-orders` remain available.

Preview request:

```json
{
  "items": [
    { "id": "standard-item-UUID", "type": "standard", "version": 1 },
    { "id": "manual-entry-UUID", "type": "manual", "version": 2 }
  ]
}
```

- Accepts 1 to 50 items per request. Standard items count per SKU and manual items count per complete form; each manual form still allows up to 20 product lines. Omitting `type` defaults to `standard` for compatibility, but manual items must pass `manual`, and identity is keyed by `id+type`.
- The server re-queries shop identity for standard items and groups them by platform and real `shop.id`; up to 50 SKUs from the same platform and shop are quoted together instead of splitting into 20-item sub-orders. When shop ID is absent, only SKUs sharing the same `productId` are merged so distinct unknown shops are never conflated.
- Manual forms lack reliable shop IDs, so each form produces its own sub-order without merging by `sellerName`; domestic shipping on the form is counted once, and order/item remarks are preserved.
- Product detail lookups and per-group quotes run with at most 4 concurrent tasks. If any group fails item selection, inventory, pricing, or coupon validation, no checkable unified preview is returned. Upstream error `details` may include `groupKey` and selected items to aid diagnosis; no orders are created and the cart is not locked prior to checkout.
- Response `data` includes `id`, `expiresAt`, `orderCount`, `groups`, settlement `currency`, and `goodsCents`/`serviceCents`/`shippingCents`/`discountCents`/`totalCents`; `referencePrice` is a CNY display reference and does not introduce a new settlement currency. Each `groups` entry includes `key`/`type`/`platform`/`shop`/`items`/`estimated`/`quote`, where `quote` holds the sub-order fee breakdown. All amounts are integer minor units excluding international freight.
- Standard sub-orders are priced from the latest HioBuy preview, system markup/service fees, and exchange rate; manual sub-orders are priced from declared goods prices, domestic shipping, and system pricing with `estimated=true`. Manual estimates are saved in the snapshot so checkout does not re-price under newer settings; post-warehouse-confirmation balance top-ups still follow the existing flow.
- Optional `couponCode` validates minimum spend and computes discounts separately for each standard sub-order, requiring one available redemption slot per standard sub-order. Passing a coupon on a manual-only selection returns an error, and in a mixed cart only standard sub-orders use the coupon; if any standard sub-order fails eligibility or remaining slots are insufficient, the entire preview/checkout fails. Preview does not reserve slots; checkout reserves them atomically.

Unified checkout request:

```json
{
  "id": "client-generated-UUID-for-this-checkout",
  "previewId": "preview-response-data-id",
  "confirm": true
}
```

Returns `{data:{id,previewId,currency,totalCents,orders:[{id,key,type,platform}]},requestId}`. Each `orders[].id` is an independent purchase order ID used for detail queries, wallet payment, or creating a Stripe Checkout session; there is no combined charge and no automatic HioBuy order creation or payment. Standard SKU remarks/attachments remain supported by the single-order checkout endpoint and no remark override parameters are added to unified cart checkout; manual items retain their saved form data.

Quotes remain valid for at most 8 minutes, and checkout must match cart versions and `draft` state. A single D1 batch writes all sub-orders, items, awaiting-payment bills, coupon reservations, checkout outcome, and cart cleanup; any failure rolls back everything. Selected standard items are deleted, selected manual items are marked `submitted`, and unselected items remain untouched; checkout amounts are determined solely by server-side snapshots. Order number sequences may have gaps after failures, without creating duplicate orders.

After a disconnect or timeout, retry `POST` with the original `id+previewId` or query `GET /api/cart/checkouts/:id`. Succeeded checkouts return the original order list even after the preview has expired; the same `id` cannot switch `previewId`, and one `previewId` cannot be resubmitted under a different `id`. Among different previews with overlapping selections, only one checkout can succeed. Querying an unsuccessful checkout returns 404 and should not trigger blind retries with a new `id`.

Common errors: `VALIDATION_ERROR` (empty selection, over 50 items, duplicate `id+type`), `NOT_FOUND` (missing item or no access), `CART_CHANGED` (item version/state changed), `CART_PREVIEW_EXPIRED` (quote expired), `CART_CHECKOUT_CONFLICT` (checkout key or preview already used), `COUPON_UNAVAILABLE` (coupon invalid or out of redemptions).

Migration `0032_calm_whirlwind.sql` adds `cart_previews`, `cart_preview_groups`, and `cart_checkouts`. Internal snapshots for each sub-order are stored separately to avoid large manual forms exceeding single-row size limits; clients receive only filtered selling-price DTOs without procurement costs, markup rules, or internal requests. The migration does not modify historical orders or existing bills.
