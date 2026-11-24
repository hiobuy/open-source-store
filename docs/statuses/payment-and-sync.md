# Payment, Interception, and Sync

> Status: Implemented

The following four dimensions on a shipment must be represented separately and never collapsed into a single status badge.

## 1. Business Status

This is the package lifecycle or shipment lifecycle (`upstream_status` when linked to HioBuy, otherwise the local customer-side status).

See [Package Lifecycle](packages.md) and [Shipment Lifecycle](shipments.md).

## 2. Payment Status

| Question | Where to Check |
| --- | --- |
| Has the customer paid this app? | `charges.status`, billing record is `PAID`, and local status is no longer `TO_PAY` |
| Has HioBuy been paid? | `hiobuy_payment_status`: `UNPAID`, `PARTIAL`, `PAID` |
| Is a HioBuy payment awaiting admin confirmation? | `payments.hiobuy_status=pending`, and the `shipment_pay` task is in `waiting` status |

"Customer paid + HioBuy `UNPAID`" is a normal intermediate state. Status sync must never mark a paid customer back as unpaid, nor credit the customer wallet because HioBuy was paid.

## 3. Interception Status

Stored in `shipments.interception_status`; empty when no interception has been requested.

| Status Code | Display Label |
| --- | --- |
| `REQUESTED` | Intercept requested |
| `PROCESSING` | Intercepting |
| `INTERCEPTED` | Intercepted |
| `FAILED` | Intercept failed |

Calling the interception endpoint writes only `REQUESTED`; subsequent transitions are updated via pull sync. Throughout this process, the shipment lifecycle may remain `WAIT_SHIP` or `SHIPPED`.

## 4. Sync Status

Recorded in `fulfillment_sync_tasks`; not part of the package or shipment lifecycle.

| Task Status | Meaning |
| --- | --- |
| `local_only` | Not connected to HioBuy; no remote request sent |
| `pending` | Ready and queued to be sent |
| `waiting` | Held due to missing preconditions or awaiting admin confirmation |
| `syncing` | Request currently in flight |
| `synced` | This sync request succeeded; does not represent business status |
| `failed` | This request failed; existing business status remains unchanged |
| `needs_review` | Requires manual operator review; existing record not overwritten |
| `skipped` | Not sent (for example, cancelled before creation) |

Labels such as `Not linked`, `Pending`, `Syncing`, `Synced`, `Failed`, and `Needs review` shown on admin package and shipment views describe sync task status.

## Related Code

- `src/domain/status.ts`
- `hiobuy_payment_status` and `interception_status` columns in `server/db/schema/app.ts`
- Task table: `fulfillment_sync_tasks`
