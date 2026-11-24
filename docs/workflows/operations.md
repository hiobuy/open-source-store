# Procurement Drafts, Product Pricing, and Marketing Configuration

External product and procurement orders are now integrated, customer bills support wallet payments, and standard procurement supports coupon reservation/redemption/release, customer notes, and private photo attachments; see [HioBuy Product and Procurement API](purchase-api.md). Descriptions below regarding early stages without external API integration or enabled payments apply only to the original manual draft phase.


## Scope and Boundaries

This site persists merchant-side procurement drafts and marketing configurations. It does not call HioBuy, Stripe, or email services; there are no customer charges, inventory updates, coupon redemptions, or referral attributions. Procurement status currently only includes `draft` and `cancelled`. The preview version's paid, purchasing, arrived, and after-sales samples are not migrated into production data; external statuses and customer settlement are left for subsequent phases.

Product pricing and procurement bill snapshots, as well as product-package linking, arrival verification, and after-sales records, have been completed in sequence. Staff-assisted pre-alerting/consolidation/order creation, full-dataset filtered exports, and marketing redemption analytics remain future phases and are not substituted with notes or demo data.

## Product-Package Linking, Arrival, and After-Sales (Phase 2)

Entry point: **Procurement Orders -> Detail -> Package Linking, Arrival & After-Sales**. Select an order item, search the customer's existing packages by package number, tracking number, or item name, and enter the item quantity allocated to that package along with verification basis. The same item may be split across multiple packages, and the same package may link to multiple items; only one active link is allowed per item-package pair, and total linked quantity for an item cannot exceed its ordered quantity. Candidate packages are filtered by customer and paginated at the database level, and customer ownership and item-order membership are re-verified on submission.

**Record / Correct Arrival** records the cumulative received quantity (not the incremental delta), ranging from 0 to the link's allocated quantity. The system displays ordered, linked, received, and pending quantities per item, along with unreceived / partially received / fully received statuses. Duplicate requests do not double-record. Lowering the quantity requires a verification reason, and the old value, new value, operator, and timestamp are preserved in immutable event records. Before unlinking, any mistakenly recorded arrival count must be corrected to 0 and all linked after-sales cases must be closed; unlinking preserves history and allows re-establishing a correct link.

This is a merchant manual verification ledger, not a warehouse receiving operation. Even recording full arrival does not change a pre-alerted package from `PENDING` to `RECEIVED`, nor does it modify package locks, consolidation eligibility, inventory, shipments, bills, or wallets. Package detail links reuse the existing admin page. A package's own `quantity` is not treated as the capacity for a single procurement item and is not used to derive item splits.

**New After-Sales Case** must be linked to an order item; it can be created from a package-link row to attach that package, or created as an item-level case without a package. Types include shortage/missing item, damaged, wrong item, return request, and other; it records quantity, reason, handling notes, and resolution. A single case's quantity cannot exceed the ordered quantity or the specified package's allocated quantity, and the sum of open cases is subject to both caps to prevent over-recording. When different issues affect the same batch of goods, append notes to the existing case; once closed, new issues can open a new record.

After-sales lifecycle: `open` -> `in_progress` -> `resolved` or `cancelled`; `open` can also transition directly to closed. Appending same-status notes is allowed in `open` / `in_progress`; `in_progress` cannot revert to `open`, and closed cases cannot be modified again. The closing note serves as the resolution, and historical events are retained permanently. Recording a return request or marking as resolved does not execute refunds, returns, package interception, or warehouse operations; blocking consolidation still uses the existing package exception workflow.

A procurement draft cannot be cancelled while active package links or open after-sales cases exist. This constraint extends only the procurement cancellation entry point; existing package, shipment, and payment endpoints remain unchanged. Cancelled orders and their history remain readable.

All Phase 2 writes require `procurement.write`; customer support has read-only access, and the demo admin console does not expose this feature. Order-version CAS serializes linked quantities, arrival quantities, and after-sales quantities under the same order; link/after-sales changes, immutable events, and audit logs commit in a single D1 batch. `id` is a command UUID idempotency key bound to the operator, order, and normalized input digest; the same key with different content or a stale version returns 409, and failed batches roll back atomically. Retrying the same request after a concurrent success retrieves the successful result.

Migration `drizzle/0007_sloppy_wrecker.sql` only adds three new tables and indexes without altering existing table data:

| Table | Purpose |
| --- | --- |
| `procurement_item_packages` | Item-to-package links, allocated quantity, cumulative received quantity, active flag |
| `procurement_aftersales` | Item / optional linked package, issue kind, quantity, reason, status, and resolution |
| `procurement_tracking_events` | Immutable history for linking, arrival corrections, and after-sales handling plus idempotency digest |

After migration, there are 75 application tables (excluding internal D1 tables). Links use real internal IDs and foreign keys rather than deriving from `PKG-` display numbers; historical foreign keys prevent directly deleting referenced records.

Endpoints are all under `/api/admin/procurement/:id`:

| Method & Suffix | Input and Output |
| --- | --- |
| `GET /package-options` | `q`, `page`, `pageSize`; returns only that customer's packages with database pagination |
| `GET /tracking` | `group=links/cases/events`, optional `itemId`, `page`, `pageSize` (1–100); returns `items`, `total`, `page`, `pageSize` |
| `POST /tracking` | Common command fields `id`, `orderVersion`, `note`; `action` determines remaining fields |

Commands: `link` requires `itemId`/`packageId`/`quantity`; `arrival` requires `linkId`/`receivedQuantity` (cumulative value); `unlink` requires `linkId`; `case_create` requires `itemId`/`linkId` (nullable)/`kind`/`quantity`; `case_update` requires `caseId`/`status`. `note` must be 2–1000 characters. List history omits idempotency request digests; order details add `receiving.items` quantity summaries and `receiving.openCases`.

Tests cover cross-customer/cross-order link rejection, concurrent capacity conflicts, partial arrivals, correcting to zero, duplicate requests, history preservation, after-sales status and quantity constraints, batch failure rollback, pagination, and permissions, while verifying that original package statuses remain unchanged.

## Product Pricing and Bills

Configure product markup percentage, per-item fixed markup, service fee percentage, per-item fixed service fee, and exchange rate in **Settings -> Product Pricing**. The exchange rate is defined as "how many CNY equal 1 unit of customer settlement currency" and must be entered explicitly without a guessed default; the settlement currency comes from site settings. Product pricing is independent of existing freight pricing. When settling in CNY, the exchange rate is fixed at 1.

In **Procurement Orders -> Detail -> Generate Bill**, confirm each item's CNY procurement unit cost, preview server-calculated totals, and then confirm issuance. Legacy draft unit prices are draft data only and are not automatically treated as procurement costs. Item selling price = procurement cost + percentage markup + per-item fixed markup; service fee = item selling price × service fee percentage + per-item fixed service fee. Percentage calculations are rounded per item to CNY fen before multiplying by quantity; each line's item total and service fee are separately converted at the exchange rate and rounded to the customer currency's minor unit before summing, while domestic shipping is converted without markup. Amounts use integers and `BigInt` intermediates, exchange rates are scaled by 10000, and percentages use basis points (bps).

Bills store immutable snapshots of item names, specifications, quantities, confirmed costs, pricing rules/versions, exchange rate, selling prices, service fees, and domestic shipping. Changing pricing does not affect older bills. Standard detail views return only customer amounts and pricing version, hiding procurement costs, markup rules, and exchange rates. Bill status is separate from draft status: currently `issued` and `void` are supported, with `paid` reserved for later settlement; there was no mark-paid action, wallet deduction, or payment entry point in this phase. Issuing a bill does not submit procurement.

An order can have at most one non-void bill, enforced by a partial unique index in the database. Issuance requires the order version, pricing version, and current settlement currency to still match; order version update, bill creation, and audit log commit atomically in one D1 batch. Retrying with the same UUID, input, and operator returns the original bill without issuing a duplicate. Voiding is allowed only for unpaid bills, requires a version and reason, and records history and audit logs; changing amounts requires voiding and re-issuing. Orders with a non-void bill cannot be cancelled.

Reading product pricing requires `settings.read` and modifying it requires `settings.write`; bill preview, issuance, and voiding require `procurement.write`, while customer support has read-only access. Only existing owners can modify pricing, and managers can issue bills using configured rules. This feature remains disabled in the demo admin console.

## Database Tables

New migration: `drizzle/0005_procurement_marketing.sql`. It only creates the following five tables and indexes, with no data deletion or modification of existing columns. Apply locally with `npm run db:migrate`; remote migrations must be run separately as a release step.

| Table | Responsibility |
| --- | --- |
| `procurement_orders` | Customer link, independent internal ID / display number, platform, draft status, CNY items/shipping/total, version, request digest, and creator |
| `procurement_items` | Item name, specification, quantity, CNY unit price, and sort order, linked to order |
| `procurement_notes` | Internal/resolution notes, author, timestamp, linked to order |
| `marketing_coupons` | Unique code, name, dates, enabled flag, discount type/integer value, currency snapshot, minimum spend, usage limit, and version |
| `marketing_campaigns` | Unique code, name, dates, enabled flag, channel, and version |

Orders link to real `user` records and only allow selecting active customers. Deleting customers with linked orders is restricted by foreign keys. Items and notes reference the order. Date strings use ISO `YYYY-MM-DD`; validity checks use UTC dates, and the end date is inclusive. There is no redemption table or fabricated usage count; the usage limit is configuration-only in this phase.

Migration `drizzle/0006_faithful_carmella_unuscione.sql` creates `product_pricing` (current product pricing and version) and `procurement_bills` (immutable amount snapshots, status, idempotent input, and void reason), and adds nullable `mutation_id` to `procurement_orders`. No data is deleted and historical drafts are not backfilled into bills; after migration, there are 72 business tables (excluding internal D1 tables).

## Admin API

All endpoints use existing authentication, staff permissions, and the `{ data, requestId }` / `{ error, requestId }` protocol.

| Method & Path | Purpose |
| --- | --- |
| `GET /api/admin/procurement` | Database pagination/search; supports `page`, `pageSize` (1–100), `q`, `status`, `platform`, `from`, `to` |
| `GET /api/admin/procurement/customers?q=...` | Search by name, email, or member code; returns up to 30 active customers |
| `GET /api/admin/procurement/:id` | Order, item lines, notes, safe bill details, and audit timeline |
| `POST /api/admin/procurement` | Create draft; `id` is client UUID idempotency key; inputs are `customerId`, `platform`, `shippingCents`, `items` |
| `POST /api/admin/procurement/:id/notes` | Save note; `id`, `text`, `kind` (`internal`/`resolution`) |
| `POST /api/admin/procurement/:id/cancel` | Cancel draft, requires `version`; retains data for audit |
| `GET /api/admin/settings/product-pricing` | Returns `policy` (`null` if unconfigured) and current customer settlement `currency` |
| `PUT /api/admin/settings/product-pricing` | Save product markup/service fee/exchange rate and version; initial `version=0` |
| `POST /api/admin/procurement/:id/bill-preview` | `orderVersion`, `policyVersion`, `costs[{itemId,costCnyCents}]`; server-side calculation without writing a bill |
| `POST /api/admin/procurement/:id/bills` | Same inputs as preview plus UUID `id`; atomically issues and returns safe bill list |
| `POST /api/admin/procurement/:id/bills/:billId/void` | `version`, `reason`; voids an unpaid bill |
| `GET /api/admin/marketing` | Database pagination/search; `group=coupons/campaigns`, `q`, `status`, `page`, `pageSize` |
| `POST /api/admin/marketing` | Create config; client UUID idempotency key; defaults to disabled on creation |
| `PUT /api/admin/marketing/:id` | Edit config, requires `version`; `code` is immutable |
| `PUT /api/admin/marketing/:group/:id/enabled` | Set `enabled`, requires `version`; does not trigger redemptions or other business actions |

Marketing edit inputs are `id`, `group`, `name`, `code`, `from`, `to`, `kind`, `amount`, `minimum`, `limit`, and `channel`, plus `version` when editing. `amount`/`minimum` are form values with up to two decimal places, converted to integers on the server (`percent` multiplies `amount` by 100 to store bps; `fixed` multiplies `amount`/`minimum` by 100 to store minor units). New coupon currency is read from server site settings, and editing does not change currency.

Lists return `items`, `total`, `page`, `pageSize`, and `counts`. Out-of-range page numbers return the last page; metric counts are unaffected by list filters. CSV exports only the currently loaded page or selected items on that page and never silently exports the full database.

## Permissions and Consistency

Added `procurement.read/write` and `marketing.read/write`: owners/managers can read and write, while support is read-only. All writes are enforced on the server; the demo API does not register these write routes, and existing demo write blocking remains active.

Creations and notes handle retries via UUID + unique constraints. Order creation reuses an existing result only when the digest and creator match; same ID with different content returns 409. Order header, line items, and audit log are written in one D1 batch, rolling back atomically on failure.

Marketing codes are normalized to uppercase and unique within their respective tables. Updates and enable/disable toggles use version-conditioned updates for concurrency control, returning 409 on conflict. Business updates and audit logs are placed in the same batch so audits are recorded only on successful updates. Failed save dialogs preserve form inputs; on version conflict, refresh and reopen the record. Draft line items cannot be edited after creation—cancel and recreate instead.

## Verification

`server/operations.test.ts` uses an isolated Miniflare D1 database, runs the complete migration chain, and verifies request validation, concurrent deduplication, failure rollback, note idempotency, cancellation versioning, coupon code conflicts, edit/toggle conflicts, pagination, and permissions. Tests never read or clear the development database. The Windows sandbox may require allowing localhost port communication; test temporary directories can point to `.wrangler/test-tmp`.

Product pricing adds `src/domain/product-pricing.test.ts` to test per-item pricing, rounding, invalid inputs, and overflow; D1 tests cover pricing concurrency, duplicate bill requests, active bill constraints, void concurrency, historical snapshots, failure rollback retries, currency changes, and permissions. Real payments or external fulfillment are not tested here.

### Procurement Order Status Navigation and Filtering

The admin orders page is grouped into "Order Management / After-Sales", with the primary status bar showing All Orders, Pending Customer Payment, Pending Action, Purchasing, Awaiting Receipt, Received, Consolidated, Shipped, and Exception Orders, backed by authoritative server counts. "Awaiting Receipt" uses `GET /api/admin/procurement?stage=awaiting_receipt`, merging `transit` (seller shipped) and `partial` (partially received) without altering actual order statuses. Orders move to Received once all items arrive. Exception Orders continues to include orders needing review and open after-sales cases; After-Sales can be filtered independently.

Additional filters preserve order date, minimum settlement amount, draft, partial arrival, and cancelled filters. Platform, customer payment status, and keyword search can be combined; status counts follow global scope and do not change with other filters. The search input supports `/` to focus (without hijacking shortcuts inside inputs or modals), and switching filters resets pagination and selections. This adjustment does not call remote sync or alter payment or procurement actions.
