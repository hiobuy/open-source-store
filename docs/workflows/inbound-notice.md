# Package Pre-alert and Inbound Notice

> Status: Implemented

## Purpose

Notify HioBuy that a domestic parcel is on its way to the warehouse, while maintaining a customer-visible local package record before the warehouse physically receives it.

## Preconditions

- HioBuy is connected and not paused.
- The package has a domestic tracking number. Tracking numbers are unique in the `packages` table.
- Auto pre-alert follows the configuration in Settings. When auto-sync is disabled or the connection is paused, `enqueueInboundNotices` performs no action; admins can still submit selected packages manually.

## Workflow Steps

1. The customer submits up to 30 pre-alert records to `POST /api/packages/prealert`.
2. The server inserts the packages into the `packages` table with `PENDING` / `NORMAL` status, then calls `enqueueInboundNotices`.
3. A background task executes `inbound_create`, calling `POST /v1/fulfillment/inbounds/create` with an `Idempotency-Key`.
4. On success, the task stores the remote ID, while the package status remains `PENDING`.
5. Admin Console -> Packages can trigger the same action via `POST /api/admin/packages/sync`.

Packages that already have a remote ID are not created again.

## HioBuy API

`POST /v1/fulfillment/inbounds/create`

`DELETE /v1/fulfillment/inbounds/{id}`

Official reference: [Inbound Pre-alerts](https://hiobuy.com/en/api-docs/fulfillment-inbounds).

The local external reference is `pkg_` plus the internal package ID (`externalPackageRef`). Never send the display number `PKG-` as the remote ID.

## Local Data

- Inserts a record into `packages` with `package_status=PENDING`.
- On success, saves `hiobuy_inbound_notice_id`; when the response payload distinguishes a package ID, also saves `hiobuy_package_id`.
- Inserts or updates `fulfillment_sync_tasks` (`action=inbound_create`) along with a `fulfillment_sync_attempts` record.
- Claimed local packages enqueue `inbound_create` with `needs_review` status so operations staff can verify that the package is not already in the warehouse (`noteClaimedPackage`).

## HioBuy Status

An accepted pre-alert does not mean `RECEIVED`. The package stays pending receipt until a subsequent status pull or a `package.received` webhook applies a received snapshot. See [Warehouse Receiving](receiving.md).

## Failure Handling

| Outcome | Preserved State and Handling |
| --- | --- |
| Timeout or HTTP error | No remote ID is fabricated; the local package record remains unchanged |
| `401 INVALID_API_KEY` or `403` | Task is paused; retry after fixing the API key or warehouse mode |
| 2xx response body missing remote ID | Marked as Needs review; package is not marked as received |
| Duplicate conflict | Adopted only when both the external reference and tracking number match; otherwise marked as Needs review |

The success message in the admin response is: `"Inbound notice submitted. The package stays Pending until HioBuy reports it received."`

## Cancellation and Deletion

Packages still in `PENDING` status can be deleted by their owning customer (`DELETE /api/packages/:id`) or by staff with `packages.write` permission (`DELETE /api/admin/packages/:id`). Staff deletions are recorded in the audit log, and the customer also receives an in-app notification.

1. Packages already linked to a shipment or not in `PENDING` status are rejected from deletion.
2. If the `inbound_create` task is in `syncing` status, deletion is rejected with the message `"being sent to the warehouse"`. Otherwise, the task is set to `cancelling` to prevent scheduled jobs from submitting the pre-alert in the meantime.
3. If the package already has a HioBuy ID or the task has already made an attempt, `DELETE /v1/fulfillment/inbounds/{id}` is called. The ID is the HioBuy package ID; if no ID has been returned yet, the `pkg_` external reference is used.
4. Deletion proceeds if `cancelled` or `404` is returned. It is rejected on `INBOUND_ALREADY_RECEIVED`. On `INBOUND_NOT_EDITABLE`, deletion is allowed only if package details show `DISCARDED` or no longer exist. All other cases reject deletion and restore the task to its previous status.
5. The package along with its attributes, photos, exception records, value-added service requests, sync tasks, attempt logs, remote links, and notifications pointing to that package are deleted in the same batch.

## Related Code

- `enqueueInboundNotices`, `queueSelectedPackages` in `server/fulfillment-sync.ts`
- `interpretInboundResponse`, `splitInboundIds` in `src/domain/fulfillment-sync.ts`
- `createInboundNotice`, `cancelInboundNotice` in `server/services/hiobuy/fulfillment.ts`
- Cancellation and deletion: `deletePendingPackage` in `server/data.ts`, `withdrawInboundNotice` in `server/fulfillment-sync.ts`, `interpretInboundCancel` in `src/domain/fulfillment-sync.ts`
- Customer pre-alerts: `server/data.ts`, storefront `src/app/(site)/(storefront)/(with-sidebar)/member-center/warehouse`
