# Warehouse Authorization

> Status: Implemented

Warehouse fulfillment requires binding a warehouse developer authorization code to the app. This code is not a column in this database and is not sent by `server/services/hiobuy`; it is attached automatically by the HioBuy gateway. For configuration instructions, see [Warehouse Authorization Setup](https://hiobuy.com/en/api-docs/fulfillment-setup).

## Error Codes

| Error Code | HTTP Status | Official Meaning | Application Behavior |
| --- | --- | --- | --- |
| `FULFILLMENT_MODE_NOT_SUPPORTED` | 403 | Calling `/v1/fulfillment/*` on a self-fulfillment app | Settings page shows a dedicated message; sync pauses |
| `WAREHOUSE_AUTH_INVALID` | 403 | The warehouse rejected developer authentication | Settings page shows a dedicated message to bind the authorization code provided by HioBuy; sync pauses |
| `WAREHOUSE_AUTH_REQUIRED` | 403 | Using warehouse fulfillment without completed warehouse authorization | No dedicated branch; 403 still pauses sync; settings page displays the raw upstream message |
| `WAREHOUSE_AUTH_EXPIRED` | 403 | Warehouse authorization has expired | Same as `WAREHOUSE_AUTH_REQUIRED`; no dedicated branch |
| `FULFILLMENT_ACCESS_REQUIRED` | 403 | Reserved error code; access not granted | No dedicated branch |
| `FULFILLMENT_ACCESS_SUSPENDED` | 403 | Reserved error code; access suspended | No dedicated branch |

Full official list: [HioBuy Error Codes Documentation](https://hiobuy.com/en/api-docs/errors).

## Troubleshooting Checklist

1. Go to Portal → Authorizations → Use HioBuy fulfillment.
2. Enter the warehouse authorization code once. The binding is at the app level, not the route level.
3. This application's connection error message recommends using both HioBuy Warehouse and Self Procurement. That wording in `explainConnectionError` is intentional.
4. WH-DEV requires the WH-DEV authorization code paired with a `hio_live_*` key; the production warehouse uses a separate authorization code. Mixing the two causes authorization failures even when the key itself appears valid.
5. After updating settings in the portal, run Test connection. Both the warehouse locations and shipping route destinations endpoints must succeed.

Receiving a 403 does not clear `warehouse_locations`. The existing warehouse address is preserved until the next successful sync replaces it. Never manually edit that database row to try to "fix" an authorization error.

## Related Code

- `server/freight.ts`
- `src/domain/fulfillment-sync.ts`
- `src/admin/pages/AdminSettings.tsx`
