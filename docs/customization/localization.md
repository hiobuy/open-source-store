# Localization

The locale catalog lives in `src/domain/locale.ts` with English as the source copy, and message catalogs live in `src/admin/locales/` registered via `messages.ts`. Customer-facing locales currently support English, Simplified Chinese, Traditional Chinese, and Russian. Missing translations fall back to English.

Customer-facing locales are enabled in admin language settings; existing deployments must opt in to Simplified Chinese in settings—existing configurations are never overwritten automatically. Resolution priority is saved preference, browser language, then site default locale. Simplified vs. Traditional Chinese is distinguished by browser script or region.

The admin header provides an independent toggle between English and Simplified Chinese, persisted under `hiobuy-admin-locale` separately from the customer-side `hiobuy-locale`. Current Chinese coverage includes admin navigation, shared list components, procurement orders, and marketing management pages; legacy admin pages may still contain unextracted English copy. Sample data and user-entered business data are never auto-translated.

Components use `useI18n().t()` or `<Tr k="English source copy" />`. Dynamic sentences use placeholders; never translate status codes, filter values, database fields, or user input. Changing locale does not alter currency, amounts, pricing rules, permissions, or API contracts; procurement and marketing configurations save via admin APIs, while external purchasing, payment, and redemption are not wired up here.

Adding a new locale requires extending the catalog, registering the message bundle, and adding locale matching and placeholder tests; no new database tables are required.
