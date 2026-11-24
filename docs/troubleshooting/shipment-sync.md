# Shipment Sync Failures

> Status: Implemented

Shipment-related tasks include `shipment_create`, `shipment_status_pull`, `shipment_pay`, `shipment_cancel`, and `shipment_intercept`. When a single attempt fails, the existing `upstream_status`, payment status, intercept status, and tracking number are preserved.

## Create Task Stuck in waiting

`shipmentCreateReady` refuses to call HioBuy until all of the following conditions are met: every package has a remote ID and remote status `RECEIVED`, a route code is set, and the shipping address includes name, phone, country, city, postal code, and address line 1. The task reason indicates the exact item to fix. The local consolidation record is preserved.

When the create endpoint returns `PACKAGE_ALREADY_CONSOLIDATED`, `PARCEL_NOT_FOUND`, or `SHIPMENT_CREATE_EXCEPTION`, the task enters manual review (Needs review). A 2xx response missing a remote ID is recorded as `MISSING_REMOTE_ID`.

## Status Pull Failures

| Symptom | Cause in Code |
| --- | --- |
| No query issued | Missing `hiobuy_shipment_id`. The system never queries by display number |
| `SHIPMENT_NOT_FOUND` or HTTP 404 | The linked remote ID does not exist upstream. Local state is preserved |
| `STATUS_CONFLICT` | ID mismatch, external reference mismatch, unknown status, or status regression from `SIGNED` / `CANCELLED` |
| `CONCURRENT_SYNC` | Another concurrent write occurred during the update. Local state is preserved |
| `NOT_IN_LIST` | The linked ID was absent from the full pull result |
| Rate limit hit | Remaining selected pull tasks in the batch stop executing. Local state is preserved |

Status pulls never create shipments and never pay for shipments.

## Payment and Cancellation

For payment-related errors, see [Insufficient HioBuy Wallet Balance](wallet-balance.md) and [Payment Status Mismatch](payment-mismatch.md).

If the HioBuy shipment status has already passed `WAIT_PAYMENT`, cancellation enters manual review instead of issuing a second cancel call. A rejected intercept request does not change `upstream_status`.

## Related Code

- `server/fulfillment-sync.ts`
- `decideShipmentPull` and `interpretShipmentCreate` in `src/domain/fulfillment-sync.ts`
- Log UI: `src/admin/pages/AdminShipmentDetail.tsx`
