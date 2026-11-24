# INVALID_API_KEY

> Status: Implemented

Official definition: HTTP 401, category `AUTH_ERROR`. The Bearer token is missing or invalid. `UNAUTHORIZED` is an alias for the same error. Source: [HioBuy Error Codes Documentation](https://hiobuy.com/en/api-docs/errors).

## How This Application Detects and Handles It

- When the token string is empty, `callHiobuy` returns this error code locally before making any network call.
- `upstreamFailure` treats HTTP 401 or a response body error code of `INVALID_API_KEY` as a failed call.
- The settings page maps it to: "This API key was rejected. Check it in the Developer Portal, or generate a new Production key."
- The sync pipeline classifies it as `pause`. Subsequent fulfillment tasks will not keep retrying a rejected key.
- The quote endpoint and fulfillment wallet convert it to `UPSTREAM_ERROR` with a message indicating the key was rejected, halting shipping estimates and wallet reads.

Timeouts are classified as `UPSTREAM_TIMEOUT`, not an invalid key. The saved key is preserved.

## Troubleshooting Checklist

1. Use a `hio_live_*` key from the portal for WH-DEV or production environments. `hio_test_*` does not work with WH-DEV.
2. If a key is saved under Settings → Integration, that key is used; `HIOBUY_API_TOKEN` is only a fallback.
3. Verify the key value is not truncated. Before calling HioBuy, the server immediately rejects any key shorter than 8 characters after trimming whitespace with `VALIDATION_ERROR`.
4. Check `upstream_request_id` on the sync attempt record. Never paste the key into logs; `redactSensitive` strips Bearer tokens from stored messages.

## Related Code

- `server/services/hiobuy/fulfillment.ts`
- `server/services/hiobuy/upstream.ts`
- `explainConnectionError` in `server/freight.ts`
- `classifyConflict` in `src/domain/fulfillment-sync.ts`
