# Package Lifecycle

> Status: Implemented

`packages.package_status` stores the HioBuy package lifecycle status. Display labels are defined in `LIFECYCLE_LABELS` in `src/domain/status.ts`; pages should render `label` directly rather than duplicating status-code mappings inside components.

## Main Flow Statuses

| Status Code | Admin Display Label | When This App Writes It |
| --- | --- | --- |
| `PENDING` | Pending | After a customer pre-alerts a package, and after inbound pre-alert sync succeeds |
| `RECEIVED` | Received | On manual/scheduled pull, or when receiving a `package.received` webhook |
| `CONSOLIDATED` | Consolidated | When a customer submits consolidation; also retained while the shipment is still in the warehouse stage (even if the package snapshot shows dispatched) |
| `SHIPPED` | Shipped | When the linked shipment's upstream status transitions to `SHIPPED` |
| `DELIVERED` | Delivered | When the linked shipment's upstream status transitions to `SIGNED` |

## Other Lifecycle Values

| Status Code | Admin Display Label | Notes |
| --- | --- | --- |
| `TRANSFERRING` | Transferring | Grouped under **More**; written only when returned by HioBuy |
| `DISCARDED` | Discarded | Same as above; this app does not call a discard endpoint |
| `UNCLAIMED` | Unclaimed | HioBuy lifecycle status value; local unclaimed packages are stored in a separate table |
| `ARCHIVED` | Archived | Grouped under **More** |

Admin filters retain all lifecycle values and add two aggregate views: `in_warehouse` covers `Received` or `Consolidated`; `attention` covers packages with condition `Exception` or lifecycle `Unclaimed`, counting each package at most once. These aggregate views never write or fabricate lifecycle statuses. The four summary cards at the top share the same filtered result set as the status tabs. `wait_ship` includes only packages in Received/Consolidated status that are uniquely linked to a non-cancelled shipment owned by the same customer whose local status is `READY_TO_SHIP` and upstream status is `WAIT_SHIP`; it is a display queue rather than a new package lifecycle. Goods type, exception condition, sync status, and date filters are consolidated under **More filters**.

## Warehouse Packages Workbench

The **Warehouse Packages** navigation item and list prioritize domestic tracking number, package status, linked purchase items, customer info, dimension/weight measurements, bin/free-storage period, and received/packed/shipped timestamps. Packed and shipped timestamps reuse the first confirmed shipment sync milestone observation time and apply only to a unique, non-cancelled shipment owned by the same customer; missing timestamps remain explicitly unrecorded. The procurement arrival badge requires an active purchase link. Missing measurements, warehouse names, customer countries, and customer unit prices are never backfilled from design mocks or inferred from purchase cost. Export downloads only the rows displayed on the current page.

Clicking a package opens a detail drawer with three tabs: Overview, Linked Orders, and Activity Log. The URL parameters `package` and `packageTab` preserve the current list filters and pagination; the full `/admin/packages/:id` page and its authorized actions remain accessible via **Open full details**. Clicking a linked order navigates to `/admin/procurement?order=<internal id>`.

Admin list and detail DTOs return `purchaseLinks` only to staff with the `procurement.read` permission, and `null` otherwise. This projection batch-queries active links for the current page, verifies that item/order IDs match the package/customer ownership, and exposes only product media and allocated/received quantities—never raw snapshots or purchase costs. For authorized staff, search also matches linked order numbers, product titles, and SKUs. Pre-alerting does not increment received quantities. Existing permissions for value-added services, sync, exception handling, and deletion remain unchanged. This capability introduces no new warehouse write endpoints or database migrations.

## Exception Condition

`condition_status` takes the value `NORMAL` or `EXCEPTION`, corresponding to HioBuy's `condition.status`, and does not replace the package lifecycle.

The following columns are also separate from the lifecycle:

| Column | Values |
| --- | --- |
| `exception_status` | `NONE`, `ACTION_REQUIRED`, `RESOLVED` |
| `vas_status` | `NONE`, `REQUESTED`, `PROCESSING`, `COMPLETED`, `CANCELLED` |
| `lock_status` | `AVAILABLE`, `LOCKED`, `BLOCKED` |
| `disposition` | `NONE`, `RETURN_REQUESTED`, `DISPOSAL_REQUESTED` |

## Information Not Stored in Package Status

Sync task status, customer payment status, and HioBuy `payment_status` are never stored in `package_status`. See [Payment, Interception, and Sync](payment-and-sync.md).

## Related Code

- `src/domain/status.ts`
- `decidePackagePull` in `src/domain/fulfillment-sync.ts`
- Column definition: `packages.package_status` in `server/db/schema/app.ts`
