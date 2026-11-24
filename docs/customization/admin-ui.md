# Admin UI

> Status: Implemented

`/admin` is protected by the `RequireAdmin` guard in `src/admin/pages/AdminShell.tsx`. `ADMIN_EMAILS` is used only to promote the initial owner(s); afterward, access is managed via "Settings → Team". `owner`, `manager`, and `support` are fixed roles defined in `src/domain/staff.ts`.

| Route | Responsibility |
| --- | --- |
| `/admin` | Operations overview |
| `/admin/procurement` | Procurement orders, submitting and paying HioBuy procurement, domestic logistics tracking |
| `/admin/packages`, `/admin/packages/:id` | Package management, inbound pre-alert submission, status pulls, warehouse value-added services |
| `/admin/shipments`, `/admin/shipments/:id` | Shipment management, status pulls, HioBuy payment, interception |
| `/admin/users`, `/admin/customer-addresses` | Customer management, manual balance adjustments, and customer address book management |
| `/admin/announcements`, `/admin/marketing` | Multilingual announcement management, coupons, and marketing campaigns |
| `/admin/payments` | Customer payment records, multi-account bank transfer top-up review, refunds |
| `/admin/assistant` | Publish answers for questions the customer assistant could not answer |
| `/admin/calculator` | Same freight quotes as the storefront, plus cost and profit visibility |
| `/admin/settings` | Business profile, integrations, client CORS allowlist, destinations, freight & product pricing, unified exchange rates, product categories & search cache, HioBuy wallet, email, advanced settings, payments, invoicing, logistics tracking, team |
| `/admin/guide` | This developer guide page; renders Markdown only and does not call HioBuy |
| `/admin/login`, `/admin/invite` | Staff login and invited staff onboarding (invite-only; login page has no sign-up link) |

The sidebar wallet entry navigates to the Wallet tab in Settings (`/admin/settings?tab=wallet`).

## Compatibility Notes

- New admin routes must be placed under the `RequireAdmin` parent route in `src/admin/App.tsx` (using full `/admin/...` paths; React Router runs inside Next's catch-all page `src/app/admin/[[...path]]/page.tsx`) and registered in the `links` array of `AdminShell.tsx`. Low-frequency developer tools should live near Settings rather than cluttering daily operations menus.
- Every `/api/admin/*` handler passes through `permissionFor` checks. Owner-only settings use `secrets.write`; HioBuy payment uses `shipments.pay` (owner and manager only). New endpoints must be mounted under this router and mapped to matching permission rules in `src/domain/staff.ts`. See [Advanced Settings](advanced-settings.md) for numbering, Google login, Turnstile, and assistant toggles.
- List pages should use the status helpers in `src/domain/status.ts` so filter options and status badges share one authoritative mapping.
- Never place API keys, webhook secrets, or Stripe keys in component state that could be logged.

## Related Code

- `src/admin/pages/AdminShell.tsx`
- `src/admin/App.tsx`
- `server/admin.ts`
- Shared page headers and badges: `src/admin/pages/shared.tsx`

## Settings Navigation

The Settings page uses a grouped sidebar on large screens and a grouped selector on small screens. Search filters navigation items accessible to the current account by translated title, group name, and keywords without switching the active form or searching saved configuration values. Empty groups are automatically hidden. Existing permission controls, demo-mode visibility, unsaved-changes prompts, and `?tab=` links remain unchanged. Advanced Settings retains its original section structure.
