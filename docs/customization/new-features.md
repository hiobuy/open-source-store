# Developing New Features

> Status: Implemented

Implement changes in the layer already responsible for the corresponding rules. The developer guide page executes no fulfillment logic, and new business behavior must never be built inside the Markdown renderer.

## Where Changes Belong

| Change Type | Location |
| --- | --- |
| Selling price or profit rules | `src/domain/freight.ts` or `src/domain/earnings.ts` with unit tests; historical records remain in `shipment_earnings` |
| Quote fields | `server/calculator.ts`; keep upstream HTTP calls inside `server/services/hiobuy/` |
| New HioBuy endpoint | Verify the path in official docs first, add a function alongside `fulfillment.ts`, then expose by role via `server/admin.ts` or `server/index.ts` |
| Package or shipment status copy | `src/domain/status.ts` and the corresponding `decide*Pull`, before editing UI pages |
| Sync behavior | Write pure functions and unit tests in `src/domain/fulfillment-sync.ts` first, then wire into `server/fulfillment-sync.ts` |
| Database schema changes | Edit `server/db/schema` and run `npm run db:generate`; never edit previously applied migration files |
| Customer-facing pages | Storefront: `src/app/(site)` and `src/components` (see `docs/storefront.md` in the repository) |
| Admin console pages | `src/admin/pages`, register the route in `src/admin/App.tsx`, and add a link in `AdminShell.tsx` |
| Customer assistant tools | `server/assistant.ts`; never promote an individual user's chat into global site knowledge |

## Invariants for New Code

- Browsers may only call `/api/*`.
- Never derive a HioBuy ID from `PKG-` or `SHP-`.
- Never treat a successful inbound pre-alert as received, or a successful sync as paid or shipped.
- Never debit customer wallets during a HioBuy status pull.
- Customer-facing responses must never include cost, markup, or profit fields.
- Creation, payment, and top-up endpoints accept `Idempotency-Key` and return the same result when the same key is reused.
- Logs may include the request ID, but must never log passwords, session cookies, API keys, or payment secrets.

## Planned Upstream Capabilities

Unintegrated official HioBuy endpoints such as return-to-seller shipments (`/v1/fulfillment/returns`) remain planned; whenever docs and code diverge, treat the actual implementation as the source of truth.

## Related Code

- `server/index.ts`
- `server/admin.ts`
- `src/domain/`
- `server/services/hiobuy/`
