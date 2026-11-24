# Project Overview

> Status: Implemented

HioBuy Store is a standalone cross-border shopping agent (procurement), membership, package, shipment, USD retail pricing, and customer wallet platform built for independent channel operators. Upstream product procurement as well as warehouse receiving, packing, outbound dispatch, and international shipping continue to be handled by the [HioBuy Fulfillment API](https://hiobuy.com/en/api-docs/fulfillment) and the HioBuy Product/Procurement API.

This guide explains how this repository uses those APIs to run procurement and parcel forwarding operations, rather than duplicating the HioBuy API reference documentation. Always treat the official documentation as the source of truth for field names and error codes, and the current repository implementation as the source of truth for local behavior.

## What the App Currently Supports

Customers can register accounts, browse and search products (including URL parsing and image search), submit purchase orders via the unified cart or manual order entry, view synced China warehouse addresses, pre-alert domestic packages, cancel pre-alerts still in `PENDING` status, claim local unclaimed packages, resolve exceptions, browse and request warehouse value-added services based on the warehouse's published catalog, consolidate packages, pay purchase bills and international freight in USD (via wallet or Stripe), track shipments, and estimate shipping retail prices.

Operators can use `/admin` to connect to HioBuy, enable destination countries, configure freight and product markups and unified exchange rates, manage purchase orders and marketing promotions, view packages and shipments, pull status updates, receive HioBuy webhooks, pay HioBuy after customer payment, inspect the fulfillment wallet, issue bills, manage staff roles, and configure email delivery and customer payment methods.

## Six Core Rules

1. A successful inbound pre-alert only means HioBuy accepted the pre-alert; the package remains `PENDING` and has not yet been received by the warehouse.
2. A successful customer payment deducts from this app's USD wallet or collects funds via Stripe; it does not deduct from the HioBuy fulfillment wallet.
3. HioBuy's `WAIT_PAYMENT` status means the warehouse is waiting for fulfillment freight payment; the customer may have already completed their USD payment.
4. HioBuy's `WAIT_SHIP` is the fulfillment status meaning "ready to ship / awaiting dispatch".
5. The delivered status for a package is `DELIVERED`, whereas for a shipment it is `SIGNED`. Never mix the two values.
6. Sync statuses (`Pending`, `Syncing`, `Synced`, `Failed`, `Needs review`) are not package or shipment lifecycle statuses.

## Status Badges

Every document starts with one of the following status badges:

| Badge | Meaning |
| --- | --- |
| Implemented | The capability is implemented in the current codebase with corresponding entry points |
| Partially Implemented | Part of the capability is implemented locally, while upstream calls or automation are still missing |
| Planned | Mentioned in the official API or early requirements, but no client is implemented in this repository yet |

## Continue Reading

- [Deploy and Environment](deploy.md)
- [HioBuy Developer Account](developer-account.md)
- [API Key and Warehouse Authorization](api-key.md)
- [WH-DEV Testing Environment](wh-dev.md)
- [Production Go-Live Checklist](production.md)

For a summary of money representation, markups, and the dual-ledger model, see [System Architecture](../architecture/system.md).
