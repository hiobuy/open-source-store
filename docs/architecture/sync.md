# Sync Tasks & Logs

> Status: Implemented

Sync tasks track whether a given request to HioBuy completed; they do not replace `packages.package_status` or `shipments.status`.

## Task Actions

| `action` | Direction | Trigger |
| --- | --- | --- |
| `inbound_create` | App → HioBuy | Customer pre-alert, or admin submits an inbound pre-alert |
| `status_pull` | HioBuy → App | Package "Sync from HioBuy", "Sync selected", or "Sync now" |
| `shipment_create` | App → HioBuy | After customer submits package consolidation |
| `shipment_status_pull` | HioBuy → App | Shipment status pull |
| `shipment_pay` | App → HioBuy | Admin confirms HioBuy payment; never triggered by customer checkout |
| `shipment_cancel` | App → HioBuy | Local cancellation while remote is in `PENDING` or `WAIT_PAYMENT` |
| `shipment_intercept` | App → HioBuy | Admin initiates interception while remote is in `WAIT_SHIP` or `SHIPPED` |
| `shipment_refresh` | Local review | Amount or dispatch state conflict; does not charge |

Task status values include `pending`, `waiting`, `syncing`, `synced`, `failed`, `needs_review`, `skipped`, and `local_only`. `Synced` only means the request received a response—it does not mean received, paid, or shipped.

Each attempt is written as a row in `fulfillment_sync_attempts`, containing the local ID, remote ID, action, start and end timestamps, outcome, before/after states, error code, error message, and `upstream_request_id`. Before writing, `redactSensitive` strips Bearer tokens and common secret prefixes.

## Pull Rules That Must Be Preserved

- Never infer a remote ID from `PKG-` or `SHP-`.
- Preserve existing weight, dimensions, tracking numbers, and prior status on pull failures.
- Fields omitted from the remote payload must not be cleared locally.
- `SIGNED` and `CANCELLED` are terminal states; pulling an earlier status transitions the task to manual review (`needs_review`).
- Two concurrent pulls for the same record must not overwrite each other; the second transitions to manual review (`CONCURRENT_SYNC`).
- Status pulls must never modify `shipment_earnings` or customer wallets.

## Webhooks

> Status: Partially Implemented

`POST /api/webhooks/hiobuy` verifies `HioBuy-Signature` using the secret stored in `freight_policy`. The secret is saved in the Fulfillment Sync panel and is never returned to the browser.

Handled event types:

- `package.received`
- `package.exception`
- `shipment.ready_for_payment`
- `shipment.dispatched`
- `shipment.delivered`
- `shipment.exception`: Marks the shipment as needing review and sends an in-site notification to the customer.
- `balance.low`: Displays an alert in the Fulfillment Sync panel until dismissed and emails the business mailbox.

Every stored event keeps a one-line outcome summary, such as which record was updated or why no match was found. The sync panel displays the latest 25 deliveries under "Webhook deliveries", and events older than 30 days are automatically purged. Requests rejected for missing or invalid signatures are not inserted into the events table; only their timestamp is recorded in `freight_policy.webhook_rejected_at` so the panel can warn that the secret may be misconfigured.

Duplicate event IDs already present in `fulfillment_webhook_events` with a status other than `failed` immediately return 200 without reprocessing. Events in `failed`, or stuck in `processing` for over one minute, are reprocessed on the next delivery. Unsigned or unknown payloads return 401 or 400. Webhooks do not completely replace "Sync from HioBuy".

## Operator API Routes

| Action | Method & Path |
| --- | --- |
| Submit inbound pre-alert | `POST /api/admin/packages/sync` |
| Pull packages | `POST /api/admin/packages/pull` with body `{ "scope": "linked" }` or `{ "scope": "selected", "ids": ["..."] }` |
| Pull shipments | `POST /api/admin/shipments/pull` with the same body shape |
| Intercept shipment | `POST /api/admin/shipments/:id/intercept` with body `{ "reason": "CUSTOMER_REQUEST", "remark": "..." }` |
| Read sync logs | `GET /api/admin/packages/:id/sync` and `GET /api/admin/shipments/:id/sync` |

## Where to Make Changes

| Change | File(s) |
| --- | --- |
| Status labels, filter keys, customer & HioBuy payment status labels | `src/domain/status.ts` |
| Pure rules for pre-alert, pull, regression, and conflict detection | `src/domain/fulfillment-sync.ts` |
| Unit tests for the rules above | `src/domain/fulfillment-sync.test.ts`, `src/domain/domain.test.ts` |
| HioBuy calls, DB writes, and attempt logging | `server/fulfillment-sync.ts` |
| HioBuy HTTP client | `server/services/hiobuy/fulfillment.ts` |
| Admin routes | `server/admin.ts` |
| Admin list and detail pages | `src/admin/pages/AdminPackages.tsx`, `AdminPackageDetail.tsx`, `AdminShipments.tsx`, `AdminShipmentDetail.tsx` |
| Sync panel & webhook deliveries | `src/admin/pages/FulfillmentSync.tsx` |
| Table definitions | `server/db/schema/app.ts` and a new `drizzle/*.sql` migration |

For new rules, write pure functions and unit tests first before wiring them into the server. Pages should render the `label` returned by the API directly—do not duplicate mappings like `PENDING → Processing` in components. When adding a new upstream status code, update `src/domain/status.ts` and the corresponding `decide*Pull` function before modifying UI pages.

HioBuy fields follow the official [Packages](https://hiobuy.com/en/api-docs/fulfillment-packages), [Shipments](https://hiobuy.com/en/api-docs/fulfillment-shipments), and [Inbounds](https://hiobuy.com/en/api-docs/fulfillment-inbounds) API docs—do not invent response shapes on the client.
