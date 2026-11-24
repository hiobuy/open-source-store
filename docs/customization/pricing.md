# Freight Pricing

> Status: Implemented

All channels share a single markup and exchange-rate policy. "Settings → Pricing" writes to `freight_policy`. "Settings → Destinations" writes only to `freight_areas.enabled` and does not participate in pricing calculations.

## Where to Edit

| Goal | How to Change |
| --- | --- |
| Percentage markup, fixed CNY markup, or USD exchange rate | Edit in "Settings → Pricing"; to change the formula itself, edit `src/domain/freight.ts` |
| Control which countries/regions can be quoted | Edit in "Settings → Destinations" |
| Hide a specific channel | No local toggle. HioBuy returns the channels for each destination; the admin console no longer toggles individual channels |
| Historical profit | Never recalculate; read directly from `shipment_earnings` |

`sellingPolicy` in `server/freight.ts` reads only `freight_policy`; there is no per-channel markup configuration.

When changing the formula, you must add corresponding tests in `src/domain`. Visitor and customer freight calculator responses must still omit cost and profit fields; field filtering happens in `server/calculator.ts`, not in frontend components.

## Compatibility Notes

- Basis points and scaled exchange rates (`72000` represents `7.2000`) are stored as integers; never store floating-point CNY amounts in these columns.
- Quotes do not freeze the active policy onto a shipment; the snapshot is written only when freight is confirmed.
- When a country/region is disabled, both the freight calculator and `createShipment` must enforce that restriction.

## Related Code

- `src/domain/freight.ts`
- `src/domain/earnings.ts`
- `server/freight.ts`
- `server/calculator.ts`
- `src/admin/pages/AdminSettings.tsx`
