# Data Model

> Status: Implemented

Table definitions live in `server/db/schema/app.ts`, and SQL migrations live in `drizzle/` (starting from a single baseline `0000_baseline.sql`). Customer-side monetary columns ending in `Fen` are denominated in USD cents; HioBuy cost columns are denominated in CNY fen. Weights are in grams and dimensions are in millimeters.

## Commercial & Accounting Records

| Table | Responsibility |
| --- | --- |
| `wallets`, `wallet_transactions` | USD customer balances and ledger entries |
| `payments`, `bank_transfers`, `payment_events`, `refund_records` | Customer payment method records and refund records |
| `checkouts`, `checkout_items`, `charges` | Shipment bills and fee line items |
| `shipment_earnings`, `shipment_earning_adjustments` | Frozen cost, markup, exchange rate, and profit snapshots captured at packing time, plus adjustment records |
| `freight_policy` | API keys, markups, exchange rates, and webhook secrets |
| `freight_areas` | Destination country and region list from channel sync, toggled individually; actual quotes still query HioBuy |
| `warehouse_locations` | Synced warehouse addresses |
| `idempotency_keys` | Idempotency replay records for creation, payment, and top-up requests |

## Fulfillment Records

| Table | Responsibility |
| --- | --- |
| `packages` | Local package records including `hiobuy_package_id`, `hiobuy_inbound_notice_id`, lifecycle status, and `condition_status` |
| `shipments` | Local shipment progress, `upstream_status`, `hiobuy_shipment_id`, `hiobuy_payment_status`, and `interception_status` |
| `shipment_packages`, `shipment_addresses`, `shipment_methods` | Consolidated packages, shipping address snapshots, and selected shipping channels |
| `package_photos` | R2 object storage keys or HioBuy `remote_url` values |
| `package_exceptions`, `vas_requests` | Local exception records and value-added service requests |
| `unclaimed_parcels`, `claims` | Local claim workflow; does not map to a HioBuy unclaimed-parcel API |
| `fulfillment_sync_tasks` | One sync task per entity and action; this status is distinct from business status |
| `fulfillment_sync_attempts` | Individual HTTP sync attempt logs (redacted) |
| `fulfillment_remote_links` | Mapping between local IDs and remote IDs |
| `fulfillment_webhook_events` | Received webhook event IDs and processing outcomes; duplicates are ignored, retained for 30 days |

`packages.package_status` stores the HioBuy package lifecycle status; `shipments.status` stores the customer-facing workflow status; `shipments.upstream_status` stores the HioBuy shipment lifecycle status. These columns must remain independent.

## Operator Settings

See [Advanced Settings](../customization/advanced-settings.md) for detailed behavior.

| Table | Responsibility |
| --- | --- |
| `platform_settings` | Google login, Turnstile, customer AI, and HioBuy payment 2FA configuration. Single row with ID `default` |
| `number_sequences` | Next member, package, and shipment display numbers |
| `email_change_requests`, `email_change_codes` | Pending email change confirmations; tokens and verification codes are stored hashed |
| `pay_grants` | Authenticator authorization grant for a single HioBuy payment |
| `turnstile_tokens` | Consumed widget tokens |

`user.member_code` as well as `packages.public_id` and `shipments.public_id` are external display numbers. Table joins always use internal primary keys and `hiobuy_*` IDs.

## Related Code

- `server/db/schema/app.ts`
- Status display labels: `src/domain/status.ts`
