# WH-DEV Testing Environment

> Status: Implemented

WH-DEV is the test warehouse configuration assigned to your app by HioBuy. Testing uses a production API key (`hio_live_*`) paired with this warehouse code. It is neither the Sandbox environment nor a real outbound fulfillment environment.

For official steps, see the [WH-DEV Testing Guide](https://hiobuy.com/en/api-docs/fulfillment-wh-dev-testing). The section below covers only the end-to-end flows that run directly in this repository.

## Before You Start

- Your application in the developer portal has warehouse fulfillment enabled and is bound to the WH-DEV code. See [HioBuy Developer Account](developer-account.md).
- Your fulfillment wallet has a test balance. This app cannot top up the HioBuy wallet.
- `ADMIN_EMAILS` is configured in `.dev.vars`. If you need the dev mailbox, ensure `ENVIRONMENT` is not `production`.
- Target destination countries are enabled in **Settings -> Destinations**. Disabled countries cannot be quoted or shipped to.

Never paste `hio_test_*` into the Integration settings. Sandbox mock data does not match the WH-DEV test warehouse. See [Sandbox Environment](https://hiobuy.com/en/api-docs/sandbox).

## Walkthrough in This App

1. Open **Settings -> Integration**, save `hio_live_*`, and confirm that both warehouse addresses and shipping channels sync successfully.
2. As a customer, pre-alert domestic packages (up to 30 per request) via `POST /api/packages/prealert`.
3. When auto-pre-alert is enabled, the system creates an `inbound_create` sync task; you can also submit manually in **Admin -> Packages** via `POST /api/admin/packages/sync`.
4. After a successful pre-alert, the package remains `PENDING`. Use **Sync from HioBuy** to pull status updates until HioBuy returns `RECEIVED`.
5. Estimate freight for received packages and submit consolidation. The server recalculates the final retail price and never trusts browser-submitted prices.
6. Consolidation creates a queued `shipment_create` task. Every package must have a `hiobuy_package_id` and be received upstream; otherwise the task stays waiting.
7. Once the warehouse packs the parcel and returns the payable amount, the upstream shipment status becomes `WAIT_PAYMENT` and the local customer bill becomes due.
8. The customer pays via the USD wallet or Stripe; this settles only the customer-side bill.
9. An admin confirms **HioBuy Pay** on the shipment. Preconditions: upstream status must be `WAIT_PAYMENT`, the customer must have already paid, and the fulfillment wallet must hold enough balance to cover the CNY cost.
10. Sync the shipment again. `WAIT_SHIP` means ready to ship, `SHIPPED` means dispatched, and `SIGNED` means delivered. Tracking events come from `GET /v1/fulfillment/shipments/{id}/tracking`.

This app also supports the procurement/purchasing workflow: on the customer side, go to **Purchase Orders -> New Purchase -> Preview -> Generate Local Bill -> Wallet Payment**; in the admin console, go to **Purchase Orders -> Detail -> Submit to HioBuy -> Refresh Remote Status**. Configure product pricing before starting; see [Purchase API Workflow](../workflows/purchase-api.md). Customer payment and HioBuy purchase payment are separate; if the warehouse returns an amount that differs from the approved preview, the order enters `review_required` and blocks purchase payment rather than silently rewriting a paid customer bill.

## Where to View Failure Records

All tasks and attempt logs appear on the package or shipment detail page and are backed by the `fulfillment_sync_tasks` and `fulfillment_sync_attempts` tables. Sensitive secrets are redacted before persistence.

See [Inbound Pre-Alert Sync Failures](../troubleshooting/inbound-sync.md), [Shipment Sync Failures](../troubleshooting/shipment-sync.md), and [Insufficient HioBuy Wallet Balance](../troubleshooting/wallet-balance.md).
