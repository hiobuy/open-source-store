# Customer Wallet vs. HioBuy Wallet

> Status: Implemented

The system maintains two independent ledgers—they are not two display labels for the same balance.

## Customer Wallet (USD Cents)

Tables: `wallets`, `wallet_transactions`. `$16.39` is stored as `1639`.

Funds enter via:

- `POST /api/payments/stripe/webhook` when Stripe Checkout completes with `payment_status=paid`
- Admin approval of a bank transfer under "Payments → Pending top-ups" (uploading a proof screenshot does not credit the balance)
- Demo endpoint `POST /api/wallet/top-up` (available only when neither Stripe nor bank transfer is enabled)

Funds exit via customer shipment payments (`SHIPMENT_PAYMENT`), or admin refunds and manual adjustments (admin adjustments record a reason).

"Settings → Payments" stores Stripe and bank account settings. Secrets are encrypted with `BETTER_AUTH_SECRET`. Live keys cannot be saved in test mode, and vice versa.

## HioBuy Wallet (CNY Fen)

"Settings → HioBuy Wallet" calls `GET /v1/fulfillment/balance` and `GET /v1/fulfillment/transactions`. It is read-only, never writes to the customer wallet, and this application cannot top it up.

The sidebar balance uses the same read endpoint. A `409` response means HioBuy is not connected yet.

## Selling Price Calculation

```text
usdCents = (cnyFen * (1 + markupBps / 10000) + fixedCnyFen) * 10000 / rate
```

The exchange rate is stored as "CNY per 1 USD multiplied by 10000" (for example, `7.2000` is stored as `72000`). Percentage markup uses basis points (for example, `15%` is stored as `1500`). The formula lives in `src/domain/freight.ts`. The single policy in `freight_policy` applies to all channels—do not add a second per-channel markup system.

Profit equals the freight actually charged minus cost converted using the shipment's own exchange rate. The profit snapshot is written to `shipment_earnings` when freight is confirmed. Later settings changes never recalculate historical records. When cost or exchange rate is missing, profit is `null`, not `0`. Refunds and cost adjustments append to `shipment_earning_adjustments` at most once per idempotency key.

Freight calculator quotes use the current markup and exchange rate, never create shipments, never debit either wallet, and never record profit. Visitor and customer responses omit cost, markup, and profit fields; admins see them only on `/api/admin/calculator`.

## Two Independent Payments

1. The customer pays this application in USD. If the linked HioBuy shipment is still in `WAIT_PAYMENT`, the local shipment status transitions to `READY_TO_SHIP`.
2. An admin then pays HioBuy in CNY via `POST /v1/fulfillment/shipments/{id}/pay`. Until that call succeeds, `hiobuy_payment_status` remains `UNPAID`.

See also [Customer Payment](../workflows/customer-payment.md) and [HioBuy Pay](../workflows/hiobuy-pay.md).

## Related Code

- `src/domain/freight.ts`, `src/domain/earnings.ts`
- `server/earnings.ts`, `server/payments.ts`, `server/calculator.ts`
- `server/hiobuy-ledger.ts`, `server/services/hiobuy/wallet.ts`
