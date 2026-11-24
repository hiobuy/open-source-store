# Inbound Pre-Alert Sync Failures

> Status: Implemented

The corresponding task has `action` set to `inbound_create`. Failures are recorded on that task. Unless a subsequent receiving sync updates the status, the package record remains `PENDING`.

## How to Inspect Sync Attempts

Open the package in the admin console. The sync log endpoint is `GET /api/admin/packages/:id/sync`.

| Outcome | Meaning |
| --- | --- |
| `synced` | HioBuy accepted the pre-alert and returned a remote ID. The package is not yet received |
| `failed` | The request failed. No remote ID was saved for this attempt |
| `needs_review` | The response body was ambiguous, or an existing remote resource did not match the current tracking number |
| `skipped` | Already submitted, or does not meet the conditions for creating again |
| `waiting` | The connection is paused, or the record is not ready yet |

`explainPackageSyncIssue` maps stored error codes to the explanation messages displayed on the package page.

## Common Causes Matching the Code

- Empty token or `INVALID_API_KEY`. See [INVALID_API_KEY](invalid-api-key.md).
- `403`, including `FULFILLMENT_MODE_NOT_SUPPORTED` and `WAREHOUSE_AUTH_INVALID`. The task is paused.
- Timeout (`TIMEOUT` / `UPSTREAM_TIMEOUT`). Simply retry; the key is not marked invalid.
- HTTP 429. Retried with backoff. The code records `RATE_LIMITED` when the response payload includes that error code, or the HTTP status code otherwise.
- 2xx response missing a remote ID. Enters manual review (Needs review) with error code `MISSING_REMOTE_ID`. Never mark the package as received.
- Duplicate submission 409. Claimed and bound directly only when both `external_order_id` and the tracking number match; otherwise enters manual review. Official responses may include `error.details.existing_resource`.

Locally claimed packages are intentionally queued for manual review with the message: "This package was claimed locally. Confirm it is not already in the HioBuy warehouse before sending a notice."

## What Not to Do

When the outcome of the first request is unknown, never create a second pre-alert for the same package with a new idempotency key. `inboundIdempotencyKey` remains stable per package ID. If the outcome is unknown, check the sync task and the package status on HioBuy's side. Never manually change `package_status` to `RECEIVED` to force-complete a sync.

## Related Code

- `queueSelectedPackages` and `runInbound` in `server/fulfillment-sync.ts`
- `interpretInboundResponse` in `src/domain/fulfillment-sync.ts`
