# Email Templates

> Status: Implemented

Email templates are a fixed list defined in `src/domain/email.ts`. "Settings → Email" edits subjects and bodies only and cannot add new template IDs via the form.

## Template ID List

`welcome`, `verification`, `verify_new_email`, `email_changed`, `password_reset`, `package_received`, `action_required`, `service_completed`, `payment_due`, `shipment_shipped`, `shipment_delivered`, `wallet_topup`, `bank_submitted`, `bank_approved`, `bank_rejected`, `shipping_paid`, `payment_failed`, `refund_completed`.

`verification`, `verify_new_email`, and `password_reset` must keep `{{actionUrl}}` or `{{verification_url}}`; saving a body without that link is rejected.

Placeholders use an allowlist, and unknown names (such as `{{password}}`) are left verbatim. Allowed names include `customer_name`, `business_name`, `verification_url`, `support_email`, `expiration_minutes`, `package_number`, `shipment_number`, `action_url`, plus legacy-compatible `name`, `platformName`, `detail`, and `actionUrl`. `name` receives the same value as `customer_name`; `actionUrl` and `verification_url` render the same http(s) link. When label text is provided after a colon (e.g., `{{verification_url:Verify email}}`), the HTML email displays that text on the button and prints the full URL in small text beneath it; without label text, the button defaults to "Confirm email" or "View details". Button labels are escaped and capped at 40 characters. Both `actionUrl` and `logoUrl` are validated by `safeHttpUrl`.

Business events map to the template IDs above through `BUSINESS_EMAIL_EVENTS`. Customer notification preferences can opt out of business emails; however, welcome, email verification, password reset, new-email verification, and old-email change notices are mandatory and cannot be disabled. The welcome email is sent once after the customer verifies their email address; accounts signed up via Google are already verified and receive the welcome email immediately. See [Advanced Settings](advanced-settings.md) for the email change flow.

## Delivery Mechanism

Cloudflare Workers cannot open Node's `net.Socket`. Standard SMTP delivery uses `cloudflare:sockets` (`starttls`, or implicit `tls` on port 465); when the SMTP host is `smtp.mx.cloudflare.net`, delivery switches to the Cloudflare Email Sending `EMAIL` binding (Workers cannot open direct TCP connections to Cloudflare-owned IPs). Never point it at private internal network addresses.

Environment variables override the SMTP password stored in the database. Saved passwords are encrypted with `BETTER_AUTH_SECRET` using AES-GCM; rotating that secret requires re-saving the SMTP password. Passwords are never returned to the browser.

When `ENVIRONMENT=production`, `email_outbox` is not written; in development it is populated so dev/test links can be inspected via `GET /api/dev/mailbox?email=...`.

All emails flow through the `email_messages` queue (statuses: `queued`, `sending`, `sent`, `failed`). Each request drains the queue via `waitUntil`. SMTP errors within 5 attempts return the record to `queued`; after 5 attempts it is marked `failed` and can be retried manually from the logs. Email delivery failures never roll back the business write that triggered them. Duplicate idempotency keys are never sent twice.

The log status label `Accepted` means the SMTP server accepted the message; it does not guarantee inbox delivery.

When `DEMO_MODE=true`, only account emails are sent: `email.verification`, `email.change`, `email.changed`, and `password.reset`. All other queued messages are marked failed with reason `"Demo mode only sends account emails."`.

## Compatibility Notes

- Keep existing placeholder names when editing copy; the renderer will not invent undefined variables.
- Adding a new email event requires adding a template ID to `EMAIL_TEMPLATES`, providing a default body, and wiring up the send call. Do not bypass the escaping pipeline to store unsanitized admin HTML.
- Business emails send asynchronously after the primary request finishes and must never block package or shipment writes.

## Related Code

- `src/domain/email.ts`
- `server/email/mailer.ts`
- `src/admin/pages/AdminEmail.tsx`
