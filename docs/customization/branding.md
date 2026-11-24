# Branding & Logo

> Status: Implemented

The product name and logo customers see in emails are configurable without rebuilding.

## Where to Edit

"Settings → Email" stores the following fields:

- Platform name (`email_settings.platform_name`, default `HIOBuy`)
- Logo URL (`logo_url`): must start with `https://`; the server rejects other schemes or formats.
- Sender name and app URL

`renderTemplate` in `src/domain/email.ts` embeds the logo in the HTML email wrapper; if the URL is empty, it falls back to displaying the platform name as plain text. This logo is not rendered inside the React app shell—the brand mark in the admin console and legacy shell is currently the letter H in `AdminShell` and `App.tsx`.

SMTP sender name fallback order: `SMTP_FROM_NAME` → saved sender name → platform name.

## Compatibility Notes

- Changing the platform name does not rename historical notification titles already stored in the `notifications` table.
- Rotating `BETTER_AUTH_SECRET` does not encrypt or affect the Logo URL, but it invalidates saved SMTP and Stripe secrets, which must be re-saved.
- Never place HioBuy API keys in the Logo URL or email footer.

## Related Code

- `src/domain/email.ts`
- `server/email/mailer.ts`
- `src/admin/pages/AdminEmail.tsx`
- Storefront shell: `src/components/layout/` and `src/config/site.ts` (storefront branding is fixed; see `docs/storefront.md` in the repository)
