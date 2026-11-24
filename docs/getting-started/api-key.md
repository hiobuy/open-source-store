# API Key and Warehouse Authorization

> Status: Implemented

The API key stays strictly on the Worker server side, encrypted with AES-GCM using `BETTER_AUTH_SECRET` before persistence. Settings API responses return only the last 4 characters of the key; the React frontend never stores or assembles the full key. After rotating `BETTER_AUTH_SECRET`, you must re-save the key; until then, the app falls back to `HIOBUY_API_TOKEN`.

## Save Flow

When staff enter the admin console without a usable saved key or a configured `HIOBUY_API_TOKEN`, a dialog prompts the owner to open **Settings → Integration**. Other staff see a request to contact the owner. Dismissing the reminder hides it in that browser tab until the next sign-in.

1. Open `/admin/settings` and switch to the **Integration** tab.
2. Paste a production API key (`hio_live_*`). A key saved on this page takes precedence over the `HIOBUY_API_TOKEN` environment variable.
3. Before persisting the key, the server requests both the warehouse address list and the shipping channel destination list; verification fails if only one succeeds.
4. On success, the server writes to `warehouse_locations` and syncs the country list to `freight_areas` while preserving existing country enabled/disabled toggles.
5. The warehouse address shown to customers comes exclusively from this sync. Until sync succeeds, the warehouse address is empty; never ship packages to a placeholder address.

The environment variable serves only as a fallback source for deployment secrets. In local development, `.dev.vars`'s `HIOBUY_API_TOKEN` is used when no key has been saved via the settings page.

## How Authorization Failures Are Displayed

`server/freight.ts` maps the following upstream error codes:

| Upstream Error Code | App Message |
| --- | --- |
| `INVALID_API_KEY` | Key rejected. Check the developer portal or create a new production key |
| `FULFILLMENT_MODE_NOT_SUPPORTED` | Fulfillment mode is not set to HioBuy Warehouse Fulfillment |
| `WAREHOUSE_AUTH_INVALID` | Warehouse rejected developer authentication. Bind the warehouse developer code provided by HioBuy |
| `UPSTREAM_TIMEOUT` | Request timed out. The saved key is not marked invalid |

Other 401 and 403 responses do not have dedicated screens; instead, sync tasks are paused and the upstream error message is shown directly on the settings page. See [INSUFFICIENT_SCOPE](../troubleshooting/insufficient-scope.md) and [Warehouse Authorization](../troubleshooting/warehouse-authorization.md).

## Warehouse Developer Code

The warehouse developer code is bound in the developer portal; it is neither stored in this app's database nor included in request bodies. To switch warehouses, rebind it in the portal, then re-test the connection and re-sync the warehouse address in the admin console.

## Related Code

- `connectHioBuy`, `verifyHioBuyAccess`, `saveApiKey`, and `resolveHioBuyToken` in `server/freight.ts`
- Key encryption: `server/api-key-seal.ts`
- `server/services/hiobuy/locations.ts`
- `server/services/hiobuy/channels.ts`
- Settings page: `src/admin/pages/AdminSettings.tsx`
- Tables: `freight_policy.api_key`, `warehouse_locations`, `freight_areas`
