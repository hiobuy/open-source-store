# Advanced Settings

> Status: Implemented

"Settings → Advanced" is owner-only (permission code `secrets.write`) and contains four sections: Numbering, Authentication, Security, and Features. Email templates remain in [Email Templates](email.md).

Environment variables override database-saved settings rows and lock the corresponding form fields. Misconfigured optional settings must never break admin sign-in. See [Deploy & Environments](../getting-started/deploy.md) for details.

See [Data Model](../architecture/data-model.md) for related table schemas.

## Numbering Rules

Display numbers for members, packages, and shipments follow the format `prefix + zero-padded sequence`. The prefix may be empty and allows `A–Z`, `0–9`, and `-`, up to 8 characters. Sequence length is 4–10 digits, and the starting value must fit within that length.

Default rules match numbers issued prior to this settings page: members `HX` / 5 digits / `10238`, packages `PKG-` / 5 digits / `10001`, shipments `SHP-` / 5 digits / `20001`. On initial load, the next sequence value advances past any existing numbers in the database.

Rules:

- Numbers are allocated server-side; clients cannot submit their own public ID.
- Allocation executes via `UPDATE number_sequences SET next_value = next_value + 1 ... RETURNING`; if the formatted number already exists, it automatically skips up to 8 times.
- Saving a starting value that could collide adjusts the next sequence to `max(requested, highest used + 1)`. When changing the prefix, only existing numbers under the new prefix are checked.
- Historical display numbers remain unchanged, and `user.id`, package/shipment primary keys, and HioBuy remote IDs remain unchanged. Never join tables on display numbers.

## Google Login

Customer-portal only. Google accounts bind via the Google subject ID on `account.provider_id = google`. Matching email addresses do not automatically merge with existing password accounts (`disableImplicitLinking`). Signing up with Google never creates a `staff_members` record.

The Redirect URI is `{origin}/api/auth/callback/google` and is displayed read-only in the UI. Sign-in uses the authorization code flow with PKCE. Better Auth verifies ID token signature, issuer, audience, and expiration, without setting a separate nonce flag.

Customers can link a Google account on the Account page via `linkSocial`; unlinking requires verifying the current password, and passwordless accounts cannot unlink. The Client Secret is encrypted with `BETTER_AUTH_SECRET` using AES-GCM and is never returned to the frontend.

"Check Configuration" sends a dummy authorization code to Google's token endpoint: `invalid_grant` or `invalid_request` indicates the client credentials were accepted; `invalid_client` indicates they were rejected.

When both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, they override the database-saved credentials.

## Turnstile

The server performs Siteverify validation on customer sign-in, sign-up, and (optionally) forgot-password flows. The widget token is passed via the `x-turnstile-token` header, and its hash is written to `turnstile_tokens` before calling Siteverify—a unique constraint violation indicates a replay attack.

In production (`ENVIRONMENT=production`), Cloudflare's documented test key prefixes `1x`, `2x`, and `3x` followed by `00000000000000000000` are rejected.

On `invalid-input-secret`, `missing-input-secret`, or `internal-error`, active owner email addresses are still allowed through so a bad secret cannot lock owners out of the admin console; however, missing or invalid tokens block everyone (including owners). Admin login does not use this widget, while login rate limiting remains active.

When both `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set, they override the database-saved keys.

## Customer AI Assistant

`customerAiEnabled` is enabled by default. `CUSTOMER_AI_ENABLED=true` or `false` overrides this toggle and locks the setting.

When disabled, the customer shell hides the assistant entry point and `/agents/` returns 403; "Admin → Assistant" and its history remain accessible.

Customer assistant copy is in English—do not add a second translation catalog. (The legacy in-app assistant panel was removed with the old customer portal, and the storefront currently has no assistant UI.) Customers can still ask questions in other languages. See [Localization](localization.md).

## Two-Factor Authentication (2FA) for HioBuy Payments

Controlled by the `Require 2FA for HioBuy payments` toggle. This feature uses the existing authenticator (TOTP and one-time recovery codes), not email verification codes.

When enabled:

- Owners and managers must enroll an authenticator under "Settings → Team" before calling `POST /api/admin/shipments/:id/hiobuy-pay`.
- The request body is `{ code }`, verified server-side; the frontend dialog alone is not a security boundary.
- Upon successful verification, a `pay_grants` row is created for that staff member and shipment, valid for 2 minutes, and consumed immediately before invoking the HioBuy payment call (single-use).
- Until that grant expires, the same code cannot authorize another payment.
- Five consecutive failures within 10 minutes block further attempts.
- Batch payment returns 403; shipments must be paid individually.
- While the toggle is enabled, owners and managers cannot call `/two-factor/disable`. Another owner can reset a member's 2FA via `POST /api/admin/team/:userId/reset-2fa` (permission `team.manage`), which deletes the factor record and writes a `staff.2fa.reset` audit log; self-reset is disallowed.

`DEMO_MODE=true` throws an error before any HioBuy payment executes, even if a `pay_grants` record exists. Scheduled fulfillment tasks never advance `shipment_pay` unless the reason is `admin_confirmed`. This toggle does not introduce automatic payments. See [HioBuy Pay](../workflows/hiobuy-pay.md) for the exact payment steps.

## Customer Email Change

A verified email address is updated only after the new email is confirmed:

1. The customer enters the new email on the Account page and re-verifies their current password; Google-only accounts receive a 6-digit code at their current email (valid for 10 minutes, up to 3 per hour).
2. The system sends a `verify_new_email` email to the new address. The token is a 32-byte random value stored as `sha256(secret:token)`, valid for 1 hour, single-use, and rate-limited to 5 per hour.
3. The link in the inbox opens `/auth/confirm-email` (storefront page), which submits `POST /api/account/email/confirm`. GET is intentionally avoided so email-client prefetching cannot prematurely consume the token.
4. Upon confirmation, the server updates `user.email`, revokes all sessions, sends an `email_changed` notice to the old email, and cleans up pending records.

Until confirmation completes, the old email remains active. Emails already belonging to another account are rejected. Security emails bypass notification preferences, just like welcome, email verification, and password reset emails.

## Related Code

- `server/platform.ts`, `server/advanced.ts`, `server/numbering.ts`, `server/pay-factor.ts`, `server/email-change.ts`
- `src/domain/numbering.ts`, `src/domain/security.ts`
- `src/admin/pages/AdminAdvanced.tsx`
- `server/auth.ts`

## Procurement Order Numbers

Numbering configuration under Advanced Settings includes `procurement`, supporting prefix, digit length, and starting value. Default is `SP` + `yymmdd` + 4-digit incrementing sequence, e.g., `SP2611110001`. The date always uses `Asia/Shanghai`, and the sequence increments continuously across days without resetting daily. The rule applies only to new orders; historical order numbers, internal UUIDs, and HioBuy order numbers remain unchanged.

Manual drafts and procurement API creation share the atomic increment allocator on `number_sequences`, backed by a unique index on the order number. Sequence rows initialize on demand with no new tables or columns; failed or concurrent idempotent requests may leave sequence gaps, which are not recycled. Saving prevents rewinding below already-used numbers; if allocations or rule changes occurred after the settings were loaded, the user is prompted to refresh and retry.

`PUT /api/admin/settings/advanced/numbering` adds `procurement: { prefix, length, start }`; queries return the active rule and a preview including the date. Standalone clients continue displaying `number` from the order API without generating numbers themselves. The admin list product column uses a compact order header (number / copy / platform / status / timestamp), real images, specs, customer selling price, procurement unit price, and right-aligned quantity.

## Admin Chinese Copy

The admin console uses an independent language switcher in the header. Simplified Chinese settings, action prompts, and legacy admin UI strings are centralized in `src/admin/locales/admin-ui-zh-Hans.ts` and registered in `zh-Hans.ts`; pages render them via the existing `useI18n` hook. Only UI copy and known system messages are translated—never translate customer names, product titles, notes, secrets, API fields, or status parameter values. Any new admin copy must be wired through the translation helper with matching dictionary entries, while save requests keep their original API field names.
