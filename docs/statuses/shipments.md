# Shipment Lifecycle

> Status: Implemented

Each shipment carries two status fields:

| Column | What It Describes |
| --- | --- |
| `shipments.status` | Customer-side progress inside this application |
| `shipments.upstream_status` | HioBuy lifecycle status when `hiobuy_shipment_id` is present |

The logistics orders list uses `shipmentViewStatus` to group display queues, while the existing `fulfillment` field still uses `adminShipmentStatus` to display upstream/local labels. These are presentation-layer rules only—they never mutate persisted lifecycle columns and are never used for payment authorization.

## Admin Logistics Workbench

The list page includes five summary cards, status counts, keyword/date/country/sync-status filters, and a paginated detail table. Counts update dynamically according to active non-status filters. Keyword search matches shipment numbers, HioBuy IDs, international tracking numbers, customer information, and linked domestic tracking numbers. Export explicitly applies only to the current page or the selected rows on the current page.

| Queue | Meaning |
| --- | --- |
| `pending` | Packing/processing, including local-only shipments |
| `customer_due` | Before dispatch/delivery, local status is `TO_PAY` or an unpaid bill exists |
| `wait_payment` | Customer has paid locally, HioBuy is `WAIT_PAYMENT`, and HioBuy has not yet been paid |
| `wait_ship` | Locally ready to ship with no remote lifecycle, upstream is `WAIT_SHIP`, or HioBuy payment is confirmed |
| `shipped` / `signed` | Locally or upstream confirmed as dispatched / delivered |
| `exception` | Creation or status sync failed/needs review, HioBuy partial payment, interception failed, or intercepted |
| `cancelled` | Cancelled locally or upstream; cancellation takes highest precedence |

List and detail endpoints also return `viewStatus`, `syncFailed`, and `times` (`packedAt`, `hiobuyPaidAt`, `shippedAt`). Timestamp fields are derived solely from persisted successful sync attempt records and represent the first time each milestone was observed; they remain `null` when unrecorded. The customer payment timestamp comes from the earnings receipt snapshot and never falls back to the row's last-updated timestamp.

The detail drawer has three tabs: Overview, Linked Packages, and Activity Log. `services` projects existing value-added service applications from linked warehouse packages and explicitly attributes them as package-level services rather than fabricated shipment-level completions. Packing photos use saved media URLs. Outer carton volume prefers fully measured carton records and falls back to final dimensions when carton breakdown data is unavailable. Chargeable weight is explicitly labeled as a **reference** value computed from existing actual and volumetric weights rather than a new authoritative HioBuy quote.

Customer freight keeps the bill's original currency, HioBuy cost remains in CNY, and profit reads existing historical snapshots. Unless the staff member holds `earnings.read`, API responses omit cost, markup, exchange rate, and adjustment fields; missing costs are never treated as zero.

Payment, sync, adjustment, document, and cancellation actions continue through existing operational workflows; the drawer links to the full detail page and the existing HioBuy Pay confirmation flow. These UI changes require no database migrations or customer frontend changes. Because no corresponding admin write endpoints exist, prototype actions for creating shipments or appending packages are not implemented here and no mock buttons are exposed.

## HioBuy Lifecycle

| Status Code | Admin Display Label | Linked Customer Display Label |
| --- | --- | --- |
| `PENDING` | Processing | Processing |
| `WAIT_PAYMENT` | Awaiting Payment | To Pay; or Payment Received if the customer has already paid |
| `WAIT_SHIP` | Ready to Ship | Ready to Ship |
| `SHIPPED` | Shipped | In Transit |
| `SIGNED` | Delivered | Completed |
| `CANCELLED` | Cancelled | Cancelled |

`WAIT_PAYMENT` does not mean "the customer has not paid"; `WAIT_SHIP` is the fulfillment-side ready-to-ship status.

`SIGNED` is the delivered status code for a shipment, whereas the package status code for the same event is `DELIVERED`. `mapHiobuyShipmentStatus` maps `SIGNED` to local `DELIVERED` and never writes `SIGNED` to `packages.package_status`.

Both `SIGNED` and `CANCELLED` are terminal states. If a status pull attempts to regress a terminal status, the task enters **Needs review** and preserves the previously stored upstream status.

## Customer-Only Status Values

Used when no HioBuy ID has been assigned yet:

| Status Code | Display Label |
| --- | --- |
| `CONSOLIDATING` | Consolidating |
| `WAITING_FOR_WEIGHT` | Waiting for Final Weight |
| `TO_PAY` | To Pay |
| `READY_TO_SHIP` | Ready to Ship |
| `SHIPPED` | Shipped |
| `IN_TRANSIT` | In Transit |
| `DELIVERED` | Delivered |
| `CANCELLED` | Cancelled |

After HioBuy Pay succeeds, the local status stays `READY_TO_SHIP` and the upstream status becomes `WAIT_SHIP`. Once dispatched from the warehouse, the local status transitions to `IN_TRANSIT` and the upstream status becomes `SHIPPED`.

## Fulfillment Payment Status

Stored in `shipments.hiobuy_payment_status`; separate from the shipment lifecycle:

| Status Code | Admin Display Label |
| --- | --- |
| `UNPAID` | HioBuy unpaid |
| `PARTIAL` | HioBuy partial |
| `PAID` | HioBuy paid |

Customer-side payment state is expressed independently as `Customer due`, `Customer paid`, or `Customer not billed` (via `customerPaymentLabel`).

## Related Code

- `src/domain/status.ts` (`HIOBUY_SHIPMENT_LIFECYCLE`, `adminShipmentStatus`, `customerShipmentDisplay`)
- `decideShipmentPull` and `applyShipmentRemote` in `server/fulfillment-sync.ts`
