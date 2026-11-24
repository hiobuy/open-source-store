# Responsibilities

> Status: Implemented

The operator's site owns commercial and accounting records; HioBuy owns warehouse fulfillment.

## Owned by This Application

- Storefront, members, sessions, and member codes (`HX` plus an incrementing sequence starting at `HX10238`)
- Unified cart, procurement / manual procurement orders, coupons / marketing campaigns, and procurement bills
- Address book and shipping address snapshots copied onto shipments
- USD customer wallet, top-ups, procurement and shipment payments, and refunds
- Product/freight selling prices, markups, unified exchange rates, and profit snapshots
- Which destination countries/regions are enabled
- Customer-facing shipment progress (from `CONSOLIDATING` to `DELIVERED`)
- Site announcements, notifications, and email templates

External display numbers `PKG-`, `SHP-`, and procurement order numbers (default `SP` + date + sequence) all come from `number_sequences`, allocated via single-shot reservations. Table relationships always use internal primary keys.

## Owned by HioBuy

- Product search/details and upstream procurement fulfillment
- Physical warehouse addresses and warehouse value-added service catalog
- Inbound receiving, weighing, measuring, parcel condition inspection, and photography
- Packing, outbound cartons, and CNY freight charged by HioBuy
- Shipment lifecycle: `PENDING`, `WAIT_PAYMENT`, `WAIT_SHIP`, `SHIPPED`, `SIGNED`, `CANCELLED`
- CNY fulfillment wallet
- International carrier tracking scans

## Assumptions Neither Side Should Make

| Event | What It Does NOT Imply |
| --- | --- |
| Inbound pre-alert `synced` | The parcel has been received and shelved |
| Customer checkout `PAID` | HioBuy's `payment_status` is `PAID` |
| HioBuy is in `WAIT_PAYMENT` | The customer still owes USD freight |
| Sync status `Synced` | The business status has changed |

## Related Code

- Customer writes: `server/data.ts`
- Admin reads and operator commands: `server/admin.ts`
- Upstream API calls: `server/services/hiobuy/`
