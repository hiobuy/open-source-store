# Customer Manual Purchase Orders

Based on `POST /v1/orders/manual` verified against the [official HioBuy OpenAPI](https://api.hiobuy.com/openapi.json) on 2026-11-12. Currently only JD (`jd`), Pinduoduo (`pinduoduo`), and Poizon (`poizon`) are enabled. This requires production procurement permissions, a valid warehouse binding, and warehouse manual procurement capability; Sandbox mock fallbacks are not used. The warehouse is responsible for verifying the same platform and the same actual seller, and will reject creation if verification fails.

## Customer Submission

The "New Manual Order" form on the shopping orders page captures the seller, product URL, title, specification, declared unit price, quantity, and domestic shipping fee, with optional image URL and notes. Each order must share one platform and one seller, with up to 20 line items and up to 999 units per line; unit price must be greater than zero. All amounts are in CNY—the frontend converts yuan to integer fen, and the API accepts integer fen. Product and image URLs only allow HTTPS links without credentials.

`POST /api/purchase-orders/manual` requires customer authentication, validates with the shared `manualPurchaseInput` schema, and returns `{ data: { id }, requestId }`. It saves a local request and generates a pre-collected bill (`estimated=true`) based on declared item prices, domestic shipping, and site pricing/exchange rates, with business status set to pending payment. It does not call procurement APIs or deduct funds automatically. Retrying with the same ID and payload returns the same order; modifying the content or reusing another customer's ID returns 409. Lists and details return `orderType: manual`, while regular historical orders default to `standard`. The admin console supports filtering by "Order Type".

## Review and Payment

1. The customer first confirms and pays the pre-collected bill; staff with `procurement.write` permission review the seller, declared prices, notes, and product URLs in the HioBuy section of the order detail page and click "Submit to HioBuy". This step creates a real procurement order, without paying or triggering purchasing.
2. Calls the manual procurement endpoint using the persisted `external_order_id`, `item_ref`, and `Idempotency-Key`. Validates identity, currency, item mapping, quantities, unit prices, line totals, shipping, and fee totals; saves the full response snapshot and `sub_order_id` mapping.
3. Confirms the final customer bill (`estimated=false`) using the warehouse-returned unit prices, shipping fee, and procurement service fee combined with the pricing and exchange-rate snapshot from the initial bill. Preserves the initial snapshot and cumulative paid `paidCents`; any balance owed goes into `dueCents`, while overpayments are recorded in `overpaidCents` for manual handling without automatic refunds. No extra HioBuy service fee is guessed. Order cost, item snapshots, bill, remote identity, and audit log are committed in a single D1 batch.
4. If a supplement payment is due, the customer submits `confirm`, the current `billVersion`, and `amountCents=dueCents` via the payment API, and the wallet only deducts the remaining amount; unconfirmed requests or stale version/amount values return 409. Stale initial payment requests cannot trigger a supplement payment; afterward, staff with finance permissions separately confirm HioBuy payment, reusing 2FA verification and historical paid-coverage checks.
5. Payment, detail lookup, and cancellation of manual orders reuse existing endpoints with `channel: manual`. Before paying, the warehouse amount is checked against the saved cost; the payment request omits `pay_amount`. Status sync and scheduled polling never double-charge the customer wallet or initiate procurement payments.

Upon local creation, costs are shown as declared estimates; after successful submission, warehouse-confirmed costs are shown. Manual orders generate their initial bill from declared prices and confirm the final amount from the warehouse response, so the manual bill creation entry point used for standard drafts is not exposed. Voiding a bill does not cancel the remote order; cancellation and refunds must still be reconciled and handled separately.

## Uncertain Outcomes and Recovery

On timeouts, rejected responses, missing amounts, or incomplete item mappings, the order is marked for review while keeping the already-paid pre-collected bill intact, generating no supplement bill, and blocking HioBuy payment. After verifying endpoint permissions, staff can retry the original submission after one minute; reuse the original request body, business reference, and idempotency key—do not create another order as a replacement retry. If the remote call succeeded but the local commit was interrupted, replaying the original request also recovers the full fee snapshot. Do not use standard orders' remote-ID-only linking to bypass manual order amount verification.

Orders with a confirmed remote ID enter the existing 5-minute polling loop. Package linking reuses the existing workflow, matching by saved item references or remote sub-order mappings; if item-quantity mapping cannot be determined, it enters manual review without guessing or marking as received.

Migration `0021_fantastic_wallflower.sql` adds `procurement_orders.order_type`, defaulting existing records to standard orders. Automated tests for this feature use an isolated D1 instance and mocked upstream; before going live, verify that the actual HioBuy account has manual procurement enabled—no real procurement or payment integration test was executed.


## Adding to Cart First

The order entry page lets customers choose "Add to Cart" instead of submitting immediately. The storefront cart page `/cart` provides the manual order cart (the legacy `/app/cart/manual` was removed with the old customer portal), where each group retains all items, images, specifications, quantities, declared prices, shipping fees, and notes for the same platform and seller; different groups are submitted separately without combining shipping fees or mixing selection with the catalog product cart.

- `GET /api/cart`: Unified endpoint reading store groups, with manual entries as `type=manual`; the old `GET /api/cart/manual-items` has been removed.
- `POST /api/cart/manual-items`: Saves a complete manual entry; creation parameters reuse the manual order form.
- `PUT /api/cart/manual-items/:id`: `{ version, form }` updates the complete form.
- `DELETE /api/cart/manual-items/:id`: `{ version }` removes the entry.
- `POST /api/cart/manual-items/:id/checkout`: `{ version }` submits this group as a manual order and returns the order `id`.

All endpoints require customer authentication and ownership verification; staging never accesses HioBuy. Version checks prevent overwriting concurrent edits. Once submission starts, the version and internal order ID are fixed, and edits or deletions are rejected; if interrupted, the original submission can be resumed, order creation follows idempotent handling, and the entry is hidden from the cart upon success. Submission results and deletion markers are retained to prevent late retries from restoring old items or creating duplicate orders. Migration `0022_cloudy_shape.sql` creates the staging table without modifying regular cart data.


## Auto-Billing and Payment Records (0026)

Migration `0026_greedy_mad_thinker.sql` adds `procurement_bills.paid_cents`, backfilling previously paid bills from historical `total_cents` without re-conversion. New orders start directly as pending payment; the underlying `status=draft` still represents an uncancelled local record, while business progress is read from `stage`. When confirming manual order costs, the initial payment currency and exchange rate are preserved, supplement payments are idempotent by bill version, and balance, cumulative paid amount, and ledger entries commit in the same batch transaction; supplement bills with actual payments received cannot be normally voided or cancelled by the customer. The initial quote snapshot is stored in the procurement quote's `initialBillingSnapshot`, and payment ledger entries preserve each actual payment.

Historical manual orders without bills still require operations staff to confirm amounts via the original review submission before billing; the new flow does not batch-generate debt from historical declared prices. Overpayments are currently only recorded for manual handling, with no automatic refund feature added.

The manual cart currently shares `cart_items` with regular SKUs using `type=manual`. The unified `GET /api/cart` `groups` include manual store groups, and badge counts include manual item quantities; manual write and submit endpoints remain intact with unchanged checkout semantics. See [Single-Table Unified Cart](purchase-api.md#single-table-unified-cart-migration-0029).

Unified mixed-selection checkout can also use `POST /api/cart/preview` + `POST /api/cart/checkout` for up to 50 cart entries per request. Manual entries become independent sub-orders without merging by store name, with preview estimates frozen into checkout bills; they are created in the same transaction as standard sub-orders, hiding the corresponding entries on success and rolling back everything on failure. The original single manual checkout endpoint is preserved, and the same entry cannot be submitted twice across both entry points. See [Unified Cart Preview and Checkout](purchase-api.md#unified-cart-preview-and-checkout-0032).
