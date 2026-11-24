# API Client

> Status: Implemented

All requests to HioBuy are constructed in `server/services/hiobuy/fulfillment.ts` (fulfillment writes and reads) as well as `locations.ts`, `channels.ts`, `quotes.ts`, and `wallet.ts`. `server/services/hiobuy/client.ts` is an unused placeholder file—do not introduce a second HTTP client.

The production API base URL is `https://api.hiobuy.com`. When the token is missing, it immediately reports `INVALID_API_KEY` without making a network request. Network failures return `timedOut: true` without clearing local state.

## Endpoints Called by This Application

| Purpose | Method & Path | Module |
| --- | --- | --- |
| Probe API key, sync warehouses | `GET /v1/fulfillment/locations` | `locations.ts` |
| Sync destination countries/regions | `GET /v1/fulfillment/shipping/channels` | `channels.ts` |
| Channel details | `GET /v1/fulfillment/shipping/channels/{code}` | `channels.ts` |
| Freight quotes | `POST /v1/fulfillment/shipping/quotes` | `quotes.ts` |
| Item attributes/types | `GET /v1/fulfillment/shipments/item-attributes` | `quotes.ts` |
| Fulfillment wallet balance | `GET /v1/fulfillment/balance` | `wallet.ts` |
| Fulfillment wallet transactions | `GET /v1/fulfillment/transactions` and `.../{id}` | `wallet.ts` |
| Inbound pre-alert | `POST /v1/fulfillment/inbounds/create` | `fulfillment.ts` |
| Package list & details | `GET /v1/fulfillment/packages` and `.../{id}` | `fulfillment.ts` |
| Create, pay, cancel, intercept shipment | `POST /v1/fulfillment/shipments/create`, `.../{id}/pay`, `.../cancel`, `.../intercept` | `fulfillment.ts` |
| Shipment list, details & tracking | `GET /v1/fulfillment/shipments`, `.../{id}`, `.../{id}/tracking` | `fulfillment.ts` |

Shipment creation, payment, and inbound pre-alert requests all send an `Idempotency-Key`. Reuse the same idempotency key only for retries of the same logical operation.

Monetary amounts returned by the fulfillment API are in CNY minor units (the official API returns `monetary_unit: "CNY_minor"`). This application converts them to USD cents exclusively in `src/domain/freight.ts`.

## Adding a New API Call

1. Verify the path and fields in the official documentation.
2. Add the corresponding call function alongside the modules listed above.
3. Call the function from `server/admin.ts` or `server/index.ts`.
4. If the endpoint affects sync behavior, map its errors in `src/domain/fulfillment-sync.ts`.
5. Never return cost, markup, or profit data to customers or visitors.

## Related Code

- `server/services/hiobuy/upstream.ts`: Reads `error.code` without mutating the request
- `server/services/hiobuy/fulfillment.ts`

Domestic procurement logistics: `POST /v1/orders/logistics/trace`, invoked via the `logisticsTrace` operation in `server/services/hiobuy/procurement.ts`. The client entry point is `GET /api/purchase-orders/:id/logistics`, with business logic and ownership validation in `server/purchase-logistics.ts`.
