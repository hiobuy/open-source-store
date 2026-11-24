# Package Status Sync

> Status: Implemented

## Purpose

Keep local package lifecycle, item condition, weight, and dimensions aligned with HioBuy after a package is linked. Sync status on task records remains independent.

## Preconditions

The package already has a `hiobuy_package_id`. Unlinked records cannot be selected for status pulls.

## Workflow Steps

1. In Admin Console -> Packages -> "Sync from HioBuy", paginate through `GET /v1/fulfillment/packages` to pull all linked packages.
2. "Sync Selected" or clicking "Sync Now" on the package detail page calls `GET /v1/fulfillment/packages/{id}` with a concurrency cap.
3. Each record is classified as checked, updated, unchanged, failed, or needs review.
4. Sync attempt logs can be read via `GET /api/admin/packages/:id/sync`.

Customer consolidation also writes the local status as `CONSOLIDATED` before HioBuy packs the shipment. Cancelling that consolidation reverts still-consolidated packages back to `RECEIVED` and unlocks them.

## HioBuy API

`GET /v1/fulfillment/packages` and `GET /v1/fulfillment/packages/{package_id}`.

Task `action`: `status_pull`.

## Local Data

Updated only when `decidePackagePull` returns `updated`:

- `package_status` and `hiobuy_status`
- `condition_status`
- Weight and dimensions when present in the payload
- `hiobuy_synced_at`

`vas_status`, `lock_status`, and `disposition` are not overwritten by lifecycle pulls; they remain in their own separate columns.

## HioBuy Status

Lifecycle values: `PENDING`, `RECEIVED`, `CONSOLIDATED`, `SHIPPED`, `DELIVERED`, as well as `TRANSFERRING`, `DISCARDED`, `UNCLAIMED`, `ARCHIVED`.

When the local shipment is still in `CONSOLIDATING`, `WAITING_FOR_WEIGHT`, `TO_PAY`, or `READY_TO_SHIP`, `SHIPPED` in a remote package snapshot is applied as `CONSOLIDATED`. The package's `SHIPPED` status waits until the shipment is actually dispatched; the package's `DELIVERED` status follows the shipment's `SIGNED`.

## Failure Handling

Timeouts and HTTP errors preserve existing weight, dimensions, and status. Unrecognized statuses, ID mismatches, or status regressions all transition to "Needs review". A second pull arriving while a record is being updated also transitions to "Needs review".

## Related Code

- `pullPackageStatuses` and `applyShipmentRemote` package update logic in `server/fulfillment-sync.ts`
- `decidePackagePull` in `src/domain/fulfillment-sync.ts`
- Labels and filters: `src/domain/status.ts`


## Package Goods Details

Package detail sync also writes validated `items[].name/quantity/image_url` into the goods snapshot. Both client and admin package detail pages display item names, quantities, and images. Missing, empty, or invalid `items` will not clear previously saved item info. Existing manually entered item summaries and declared values are preserved; if the summary is empty, it is auto-populated from the snapshot, even when the warehouse lifecycle has not changed.

`total_value` is parsed as a major-unit amount paired with its explicit `currency` (for example, CNY 15 converts to 1500 CNY fen) rather than being treated as a USD amount. The API returns `declaredCurrency` and `goodsItems` alongside existing fields. Procurement unit costs are never exposed as item prices. Migration `0019_nice_tyrannus.sql` adds the goods JSON and declared currency columns; historical manual declarations default to USD. This does not alter bills, wallet balances, or exchange rates.

The admin package list displays the customer unit price and currency of linked procurement items sourced from their valid bill snapshots. Missing prices are never inferred from procurement cost or package declared value. The configured receiving warehouse represents only the site's currently synced receiving location and is not proof of a historical package's location; bin location (`bin`) comes directly from the package itself.

Detail pulls for selected packages read `timestamps.received_at`; list pulls may provide a top-level `received_at`. When the list omits received time, select the package and sync its details. Dimensions exist independently of weight. Storage duration is calculated in full days from confirmed receipt to dispatch (or to current time for packages still in storage). Missing measurement data and received timestamps display as unknown rather than zero or pending.

In this integration, the received timestamp returned by HioBuy (such as `2026-11-17T17:45:26.000Z`) represents Beijing time 17:45:26. The system normalizes this clock value once during ingestion; admin receiving views display it in `Asia/Shanghai` regardless of browser timezone. New pulls that detect a saved received timestamp matching the legacy UTC interpretation also auto-correct it; unrelated local received timestamps are preserved.
