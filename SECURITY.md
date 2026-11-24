# Security Policy

## Pre-Production Security Checklist

Before accepting real customers and payments on **HioBuy Store**:

- Generate a strong random `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and store it in Cloudflare Secrets (`wrangler secret put ... --env production -c wrangler.jsonc`).
- Keep `ENVIRONMENT=production` and leave `DEMO_MODE` unset/disabled on any real deployment.
- Assign staff the lowest role needed (`owner`, `manager`, `support`) and enable TOTP two-factor authentication for `HioBuy Pay`.
- Configure and test both HioBuy and Stripe webhook signing secrets before enabling live payments.
- Validate wallet top-ups, checkout, refunds, and dispute handling in Stripe test mode first.
- Configure Cloudflare WAF / rate-limiting rules in front of public quote and authentication endpoints (the built-in quote limiter is per Worker isolate).

## Handling Secrets

Never commit `.dev.vars`, `.env`, `.wrangler/`, `.cloudflare/`, `.vinext/`, `.next/`, `dist/`, `dist-api/`, local SQLite databases, or any API/payment key. They are excluded in `.gitignore`.

HioBuy API keys, SMTP passwords, Stripe keys, Google OAuth secrets, Turnstile secrets, and webhook signing secrets saved via the admin console are encrypted at rest in D1 with AES-GCM derived from `BETTER_AUTH_SECRET`. Rotating `BETTER_AUTH_SECRET` requires re-saving encrypted secrets.

## Reporting a Vulnerability

Please report security vulnerabilities privately to **support@hiobuy.com** rather than opening a public issue. Include reproduction steps, affected endpoints, and potential impact so we can respond promptly.
