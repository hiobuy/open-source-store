# Warehouse Receiving

> Status: Implemented

## Purpose

Sync the warehouse's received status to local packages after HioBuy physically checks in and receives the parcel. This step is independent of inbound pre-alerts.

## Preconditions

- The package has a `hiobuy_package_id`, or a pre-alert ID that can be resolved by subsequent detail endpoints.
- "Sync from HioBuy" is triggered, or HioBuy pushes a `package.received` event.

Receiving is not manually entered and marked complete by operations staff via a weighing form. Photos and measurement data both come from the package detail payload.

## Workflow Steps

1. Pull `GET /v1/fulfillment/packages` or `GET /v1/fulfillment/packages/{id}`.
2. `decidePackagePull` compares the remote lifecycle against the local record.
3. When the remote status is `RECEIVED`, local `package_status` changes to `RECEIVED`, copying weight, dimensions, item condition, and `received_at`.
4. Opening a received package's details also saves `warehouse_files`, VAS result files, and exception files into `package_photos.remote_url`. List payloads do not include these files.
5. The `package.received` webhook also fetches this detail endpoint before writing, ensuring bare events never fabricate measurement data.

## HioBuy API

- `GET /v1/fulfillment/packages`
- `GET /v1/fulfillment/packages/{package_id}`
- Webhook type `package.received`

Official reference: [Packages API](https://hiobuy.com/en/api-docs/fulfillment-packages).

## Local Data

- `packages.package_status`, `condition_status`, `weight_grams`, dimensions, `received_at`, `hiobuy_status`, `hiobuy_synced_at`
- Writes to `package_photos` when details include files
- Generates customer notification `PACKAGE_RECEIVED` when the prior status was `PENDING`

Omitted dimension fields from remote do not clear existing local values; HTTP call failures likewise leave local data untouched.

## HioBuy Status

`RECEIVED` is a warehouse lifecycle value. `condition.status` is independent, taking values `NORMAL` or `EXCEPTION`. Exceptions do not replace lifecycle status.

Only packages with status `RECEIVED`, condition `NORMAL`, no unresolved exceptions, no in-progress value-added services, and an available lock status can be added to a shipment (see `packageEligibility` in `src/domain/status.ts`).

## Failure Handling

- No linked ID: The record is not queried. Local `PKG-` is never used as a remote ID.
- `404`: Marked as Needs review or missing, preserving local status.
- Remote status would regress a delivered or cancelled package: Marked as Needs review.
- Locally consolidated while the shipment has not yet left the warehouse: Remote `SHIPPED` is held as `CONSOLIDATED` until the shipment itself is dispatched. See [Package Status Sync](package-sync.md).

## Related Code

- `pullPackageStatuses` in `server/fulfillment-sync.ts`
- `decidePackagePull`, `readPackageMedia` in `src/domain/fulfillment-sync.ts`
- Admin list and details: `src/admin/pages/AdminPackages.tsx`, `AdminPackageDetail.tsx`
