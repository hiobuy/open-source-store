# INSUFFICIENT_SCOPE

> Status: Partially Implemented

Official definition: HTTP 403, category `AUTH_ERROR`. The API key lacks the required scope to call this route. Source: [HioBuy Error Codes Documentation](https://hiobuy.com/en/api-docs/errors).

This repository does not have a dedicated branch for the `INSUFFICIENT_SCOPE` string. However, HTTP 403 still pauses fulfillment sync because `src/domain/fulfillment-sync.ts` classifies all HTTP 403 responses as `pause`. The settings page does not display a dedicated message for this error; operators see `UPSTREAM_ERROR` along with the upstream message.

## Common Meaning in This Application

The key itself is recognized as valid, but the app cannot call `/v1/fulfillment/*`. If the app is in self-fulfillment mode, a different error code is returned: `FULFILLMENT_MODE_NOT_SUPPORTED`. Insufficient scope errors also occur when the portal app has not been granted permissions for the fulfillment route being called.

`INSUFFICIENT_SCOPE` on product search endpoints is a portal channel issue. This forwarding application does not call product search endpoints.

## Troubleshooting Checklist

1. Confirm in the Developer Portal that the app is set to warehouse fulfillment mode rather than self-fulfillment mode.
2. Confirm the key belongs to that app and the matching environment. Sandbox keys cannot obtain fulfillment scopes for WH-DEV.
3. Retry manually after updating configuration in the portal. Paused tasks do not resume automatically. Test the connection under Settings → Integration, which calls both the warehouse address and shipping route endpoints.
4. Keep HioBuy's `request_id`. When present on a sync attempt, this application stores it as `upstream_request_id`.

Other related error codes that also return 403 and are not rewritten to `INSUFFICIENT_SCOPE`: `FORBIDDEN`, `FULFILLMENT_ACCESS_REQUIRED`, and `FULFILLMENT_ACCESS_SUSPENDED`. The latter two are marked as reserved in the official error list.

## Related Code

- `src/domain/fulfillment-sync.ts` (`httpStatus === 403`)
- `server/freight.ts`
- `server/services/hiobuy/quotes.ts`
- `server/services/hiobuy/wallet.ts`
