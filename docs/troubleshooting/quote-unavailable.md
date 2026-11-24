# Quotes Unavailable

> Status: Implemented

Quotes cannot be provided when HioBuy is disconnected, the destination country is disabled, an upstream quote request fails, or a saved consolidation quote no longer matches. In none of these cases does any wallet balance change occur.

## Error Codes Returned by This Application

| Error Code | Trigger Condition |
| --- | --- |
| `UPSTREAM_ERROR` | HioBuy is not connected, the key was rejected, or the quote HTTP request failed. The shipping calculator displays: "HioBuy isn't connected, so shipping estimates aren't available." or the upstream message |
| `DESTINATION_CLOSED` | `freight_areas.enabled` is false for that country |
| `VALIDATION_ERROR` | Missing route, invalid country code, or only partial dimension fields provided |
| `NOT_FOUND` | No matching route details were returned for that destination |
| `QUOTE_NOT_FOUND` | The consolidation quote ID does not belong to the current customer |
| `QUOTE_EXPIRED` | `shipping_quotes.expires_at` has passed |
| `QUOTE_MISMATCH` | Packages or the shipping address changed after the quote was fetched |
| `ROUTE_UNAVAILABLE` | The route is no longer included in the freshly fetched quotes |

An `INVALID_API_KEY` encountered by the quote client is converted to `UPSTREAM_ERROR` with the message: "HioBuy rejected the API key, so quotes are unavailable." HTTP 403 `FULFILLMENT_MODE_NOT_SUPPORTED` or `WAREHOUSE_AUTH_INVALID` follows the same wrapping logic. Fix the connection and re-quote. See [INVALID_API_KEY](invalid-api-key.md) and [Warehouse Authorization](warehouse-authorization.md).

There is no local error code named `QUOTE_UNAVAILABLE`. Never invent that error code on the client; surface the error codes listed above instead.

## Troubleshooting Checklist

1. Confirm that Settings → Integration shows successful warehouse and route sync.
2. Confirm that the country is enabled under Settings → Destinations. Newly synced countries default to `enabled: true` on insert; countries with existing toggle settings preserve their current state.
3. Confirm the item attribute is one of: `GENERAL`, `BATTERY`, `MAGNETIC`, `LIQUID`, `POWDER`, `SENSITIVE`.
4. For consolidation, fetch routes again instead of replaying an expired quote ID.
5. Neither public nor customer API payloads include cost data. If the returned route list is empty with an `upstreamMessage`, HioBuy returned no sellable routes rather than rates being hidden locally.

## Related Code

- `server/calculator.ts`
- `server/services/hiobuy/quotes.ts`
- `createShipment` quote validation in `server/data.ts`
- `src/domain/live-quote.ts`
