# Developer Guide

Reference documentation for deploying and extending HioBuy Store. The **Admin -> Developer Guide** page renders these files directly without making any calls to HioBuy APIs.

Status badges shown at the top of each document: **Implemented**, **Partially Implemented**, **Planned**.

## Getting Started

- [Project Overview](getting-started/index.md)
- [Deploy and Environment](getting-started/deploy.md)
- [HioBuy Developer Account](getting-started/developer-account.md)
- [API Key and Warehouse Authorization](getting-started/api-key.md)
- [WH-DEV Testing Environment](getting-started/wh-dev.md)
- [Production Go-Live Checklist](getting-started/production.md)
- [Demo Admin Mode](getting-started/demo-admin.md)

## System Architecture

- [System Architecture](architecture/system.md)
- [Responsibility Boundaries](architecture/responsibilities.md)
- [Data Model](architecture/data-model.md)
- [API Client](architecture/api-client.md)
- [Client API / App Integration](architecture/client-api.md)
- [Sync Tasks and Logs](architecture/sync.md)
- [Customer Wallet and HioBuy Wallet](architecture/wallets.md)

## Business Workflows

- [Purchase Drafts, Product Pricing, and Marketing Settings](workflows/operations.md)
- [HioBuy Product and Procurement API](workflows/purchase-api.md)
- [Customer Manual Purchase Orders](workflows/manual-purchase.md)
- [Shop Subscriptions and Browsing History](workflows/shopping-activity.md)
- [Announcements Publishing and Reading](workflows/announcements.md)
- [Client Image Uploads](workflows/client-images.md)
- [Customer Address Management](workflows/customer-address-management.md)
- [Package Pre-Alert and Inbound Notice](workflows/inbound-notice.md)
- [Warehouse Receiving](workflows/receiving.md)
- [Package Status Sync](workflows/package-sync.md)
- [Shipment Creation](workflows/shipment-create.md)
- [Freight Quotes and Markup](workflows/quote.md)
- [Customer Payment](workflows/customer-payment.md)
- [HioBuy Freight Payment](workflows/hiobuy-pay.md)
- [Shipping and Tracking](workflows/shipping-tracking.md)
- [Cancellation and Interception](workflows/cancel-intercept.md)
- [Exceptions and Refunds](workflows/exceptions-refunds.md)

## Status Reference

- [Package Lifecycle](statuses/packages.md)
- [Shipment Lifecycle](statuses/shipments.md)
- [Payment, Interception, and Sync](statuses/payment-and-sync.md)

## Customization and Extension

- [Branding and Logo](customization/branding.md)
- [Freight Pricing](customization/pricing.md)
- [Payment Channels](customization/payments.md)
- [Email Templates](customization/email.md)
- [Advanced Settings](customization/advanced-settings.md)
- [Customer Portal](customization/customer-portal.md)
- [Admin UI](customization/admin-ui.md)
- [Localization](customization/localization.md)
- [Building New Features](customization/new-features.md)

## Troubleshooting

- [INVALID_API_KEY](troubleshooting/invalid-api-key.md)
- [INSUFFICIENT_SCOPE](troubleshooting/insufficient-scope.md)
- [Warehouse Authorization Issues](troubleshooting/warehouse-authorization.md)
- [Inbound Pre-Alert Sync Failures](troubleshooting/inbound-sync.md)
- [Shipment Sync Failures](troubleshooting/shipment-sync.md)
- [Insufficient HioBuy Wallet Balance](troubleshooting/wallet-balance.md)
- [Payment Status Mismatch](troubleshooting/payment-mismatch.md)
- [Duplicate Webhooks and Retries](troubleshooting/duplicate-webhook.md)
- [Quotes Unavailable](troubleshooting/quote-unavailable.md)
