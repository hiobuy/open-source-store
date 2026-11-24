# HioBuy Developer Account

> Status: Implemented

Forwarding does not create a HioBuy developer account on your behalf, nor does it store developer portal passwords. Operators must first prepare their application and API key in the HioBuy Developer Portal, then configure the production API key in this application.

Official documentation pages:

- [Fulfillment Overview](https://hiobuy.com/en/api-docs/fulfillment)
- [Warehouse Authorization](https://hiobuy.com/en/api-docs/fulfillment-setup)
- [WH-DEV Testing](https://hiobuy.com/en/api-docs/fulfillment-wh-dev-testing)
- [Sandbox Environment](https://hiobuy.com/en/api-docs/sandbox)
- [Error Codes](https://hiobuy.com/en/api-docs/errors)

## Portal Configuration Required by This App

1. The application must enable warehouse fulfillment mode instead of the default self-fulfillment mode; otherwise calls to `/v1/fulfillment/*` return `403 FULFILLMENT_MODE_NOT_SUPPORTED`.
2. Bind the warehouse developer code assigned to you by HioBuy. Each application only needs to be bound once; this code is not sent in API requests and is attached automatically by the gateway.
3. When connection verification fails, this app instructs the operator to set Fulfillment Mode to HioBuy Warehouse and Procurement Mode to Self Procurement. This message lives in `explainConnectionError` in `server/freight.ts`.
4. Fulfillment endpoints call `https://api.hiobuy.com` with `Authorization: Bearer`; the browser never contacts this domain directly.

## Never Mix Keys

| Key | Purpose | How It Is Used in This App |
| --- | --- | --- |
| `hio_test_*` | Sandbox mock data, unrelated to the assigned warehouse | Do not use with WH-DEV |
| `hio_live_*` + `WH-DEV` | Connects to the assigned test warehouse; not real fulfillment | [WH-DEV Testing Environment](wh-dev.md) |
| `hio_live_*` + production warehouse authorization | Real production fulfillment | [Production Go-Live Checklist](production.md) |

## Official APIs Not Called by This Repository

This app reads the warehouse value-added service catalog and checks whether the service request list is available; see [Service Catalog](../architecture/client-api.md#warehouse-value-added-service-catalog).

The following paths exist in the official HioBuy documentation, but `server/services/hiobuy/` does not yet provide client functions for them:

- `/v1/orders/*` purchase orders. Planned.
- `/v1/fulfillment/returns`. Planned.
- `/v1/fulfillment/unclaimed-packages`. Local unclaimed package records are stored in the `unclaimed_parcels` table. Partially Implemented.

## Related Code

- Connection validation and error copy: `server/freight.ts`
- Sole upstream HTTP client module: `server/services/hiobuy/fulfillment.ts`
