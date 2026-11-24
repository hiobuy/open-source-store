# Customer Portal

> Status: Implemented

Customer pages belong to the storefront (the Next.js application served by the Web Worker). The former React Router customer portal under `/app/*` has been removed. Pages live in `src/app/(site)/(storefront)/member-center/...`, and the sidebar layout lives in `src/app/(site)/(storefront)/(with-sidebar)/`. See `docs/storefront.md` in the repository for development conventions.

| Route | Page |
| --- | --- |
| `/`, `/categories`, `/category/:slug`, `/search`, `/shop`, `/product/...` | Storefront home, categories, search (including image search), shop, and product detail (SSR) |
| `/cart`, `/checkout`, `/fill-and-buy`, `/payment`, `/payment/result` | Unified cart, checkout, manual fill-and-buy procurement, and payment result |
| `/forwarding`, `/freight-estimation`, `/estimation-details` | Parcel forwarding overview and freight estimation |
| `/member-center/warehouse`, `/member-center/warehouse/:id` | Package list, detail, and synced warehouse addresses |
| `/member-center/shipments`, `/member-center/shipments/new`, `/member-center/shipments/:id` | Shipment list, detail, and package consolidation |
| `/member-center/shipments/checkout/:id` | Freight payment |
| `/member-center/wallet`, `/member-center/wallet/top-up` | USD customer wallet and top-up |
| `/member-center/purchase-orders`, `/member-center/purchase-orders/:id` | Procurement order list and detail |
| `/member-center/favorites`, `/member-center/history`, `/member-center/inquiries`, `/messages` | Favorites & shop subscriptions, browsing history, inquiries, and in-site messages |
| `/member-center/profile` | Profile, address book, invoice profiles, and account security settings |
| `/login`, `/register`, `/forgot-password`, `/auth/reset-password`, `/auth/confirm-email` | Sign-in, registration, and account recovery |

`/` is always the storefront home page. Pages no longer read `PUBLIC_SITE_MODE`; see [Deploy & Environments](../getting-started/deploy.md). Notification `href` values (such as `/app/packages/:id`) are API data mapped to the routes above by `src/components/features/logistics/procurement-notifications.tsx`.

## Compatibility Notes

- Display status is computed by `customerShipmentDisplay` and `getPackageDisplayStatus`. When a shipment is linked remotely and the customer has already paid, `WAIT_PAYMENT` displays as Payment Received.
- Never display CNY costs, markups, or profit on these pages; the server already strips these fields—do not add them back on the client.
- Price fields submitted in request bodies are ignored by the server; maintain this invariant when adding new fields.
- Member codes as well as package and shipment numbers are generated server-side—do not add input fields for them on the frontend. Number formats are configured in "Settings → Advanced → Numbering".
- Google login, Turnstile, and email changes are customer-side flows and never grant staff permissions. See [Advanced Settings](advanced-settings.md).
- Visibility of the assistant button follows the config returned by `GET /api/security/public`. When customer AI is disabled, do not call `/agents/` from new customer pages; the server rejects the request.

## Related Code

- `src/app/(site)/(storefront)/member-center`
- `src/components/layout/`
- `src/components/features/logistics/procurement-notifications.tsx`
- `server/index.ts`
- `server/data.ts`
