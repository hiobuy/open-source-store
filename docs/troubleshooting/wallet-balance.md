# Insufficient HioBuy Wallet Balance

> Status: Implemented

Official error code: `INSUFFICIENT_BALANCE`, HTTP 402, returned by the shipment payment endpoint. Source: [HioBuy Error Codes Documentation](https://hiobuy.com/en/api-docs/errors) and the payment section of the fulfillment documentation. The sandbox fixture `sb_shp_pay_insufficient` returns the same error code. That fixture applies only to `hio_test_*`; never use it to test WH-DEV.

## Two Different Types of Insufficient Balance

| Code Path | Account Debited | Message Shown to User |
| --- | --- | --- |
| `payCheckout` in `server/data.ts` | Customer USD wallet | "Insufficient wallet balance." Does not call HioBuy |
| `interpretPayResponse` | HioBuy CNY wallet | "HioBuy fulfillment payment failed. The customer was not charged again." |
| Pre-call `hiobuyPayQuote` | HioBuy CNY wallet | "The HioBuy wallet does not cover this shipment." Does not send a payment request |

When staff manually adjust a customer wallet balance in the admin console, a manual debit that would take the balance below zero also uses the same `INSUFFICIENT_BALANCE` error code. That likewise refers to the customer USD wallet, not the HioBuy wallet.

## Troubleshooting Checklist

1. Confirm that the failure is on the HioBuy payment task (`action=shipment_pay`), not customer checkout payment.
2. Open Settings → HioBuy Wallet. This value comes from `GET /v1/fulfillment/balance` in CNY fen. Top-ups are not supported on this page.
3. Top up in the HioBuy portal, then confirm payment again from the shipment page. Never ask the customer to check out and pay again.
4. If the initial payment timed out, the next confirmation queries the remote shipment status first. Payment is sent again only if HioBuy's side is still not `PAID` and has not yet entered `WAIT_SHIP`, `SHIPPED`, or `SIGNED`.

`PARTIAL` does not indicate insufficient balance. Quote/payment checks block another payment until manual review resolves it.

## Related Code

- `interpretPayResponse` and `hiobuyPayReady` in `src/domain/fulfillment-sync.ts`
- `hiobuyPayQuote` and `payHiobuyShipment` in `server/fulfillment-sync.ts`
- `server/services/hiobuy/wallet.ts`
