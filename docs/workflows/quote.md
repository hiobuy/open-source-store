# Shipping Quotes and Markup

> Status: Implemented

## Purpose

Display USD selling prices based on HioBuy's CNY quotes plus the operator's markup and exchange rate, without creating a shipment or deducting from either wallet.

## Preconditions

- HioBuy is connected. Otherwise, the calculator returns `UPSTREAM_ERROR` and indicates that estimated quotes are unavailable.
- The destination country/region is enabled in `freight_areas`. Disabled countries/regions return `DESTINATION_CLOSED`.
- Markup percentage, optional fixed CNY amount, and CNY-to-USD exchange rate are configured in Settings -> Pricing.

## Workflow Steps

1. The public endpoint `POST /api/shipping/calculator`, customer endpoint `POST /api/shipping/quotes`, or admin endpoint `POST /api/admin/calculator` collects weight, dimensions, item attributes, and destination.
2. The server calls `POST /v1/fulfillment/shipping/quotes`.
3. `src/domain/freight.ts` converts CNY fen to USD cents according to the current policy.
4. Customer and public responses strip cost, markup, and profit fields; the admin calculator includes CNY cost and estimated profit.
5. Consolidation quotes are saved in `shipping_quotes` with an expiration time. Creating a shipment requires this ID and recalculates the quote.

The customer assistant's shipping estimates also execute via the `server/calculator.ts` path.

## HioBuy API

- `POST /v1/fulfillment/shipping/quotes`
- `GET /v1/fulfillment/shipping/channels`
- `GET /v1/fulfillment/shipping/channels/{code}`
- `GET /v1/fulfillment/shipments/item-attributes`

Item attributes sent by this application: `GENERAL`, `BATTERY`, `MAGNETIC`, `LIQUID`, `POWDER`, `SENSITIVE`.

## Local Data

Calculator-only calls do not insert shipment records. Consolidation quotes are written to `shipping_quotes`. No wallet records are modified. `shipment_earnings` is written later when freight is billed, not during quote estimation.

## HioBuy Status

Quoting does not change package or shipment statuses.

## Failure Handling

| Error Code | Cause |
| --- | --- |
| `UPSTREAM_ERROR` | Not connected, or HioBuy rejected the quote request |
| `DESTINATION_CLOSED` | Destination country/region toggle is disabled |
| `QUOTE_NOT_FOUND` | Unknown consolidation quote ID |
| `QUOTE_EXPIRED` | Quote TTL has elapsed |
| `QUOTE_MISMATCH` | Packages or shipping address have changed |
| `ROUTE_UNAVAILABLE` | The channel no longer returns a quote for this set of packages |
| `INVALID_API_KEY` | API key was rejected; quoting stops |

See [Quote Unavailable](../troubleshooting/quote-unavailable.md).

## Related Code

- `server/calculator.ts`
- `server/services/hiobuy/quotes.ts`
- `src/domain/freight.ts`, `src/domain/live-quote.ts`
- Frontend UI: `src/admin/shared/ShippingCalculator.tsx` (admin calculator) and storefront freight estimation page under `src/app/(site)/(storefront)/freight-estimation`
- Policy editor: "Settings -> Pricing" in `src/admin/pages/AdminSettings.tsx`
