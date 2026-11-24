CREATE TABLE `exchange_rate_history` (
	`currency` text NOT NULL,
	`version` integer NOT NULL,
	`cny_per_unit_e4` integer NOT NULL,
	`enabled` integer NOT NULL,
	`source` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	PRIMARY KEY(`currency`, `version`)
);
--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`currency` text PRIMARY KEY NOT NULL,
	`cny_per_unit_e4` integer NOT NULL,
	`enabled` integer NOT NULL,
	`version` integer NOT NULL,
	`mutation_id` text NOT NULL,
	`source` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
INSERT INTO exchange_rates (currency,cny_per_unit_e4,enabled,version,mutation_id,source,updated_at,updated_by)
VALUES ('CNY',10000,1,1,'migration:CNY','identity',CAST(strftime('%s','now') AS INTEGER)*1000,'migration');
--> statement-breakpoint
INSERT INTO exchange_rates (currency,cny_per_unit_e4,enabled,version,mutation_id,source,updated_at,updated_by)
SELECT currency,cny_per_currency_e4,
CASE WHEN currency='USD' AND EXISTS(SELECT 1 FROM freight_policy WHERE id='default' AND cny_per_usd_e4<>product_pricing.cny_per_currency_e4) THEN 0 ELSE 1 END,
1,'migration:'||currency,
CASE WHEN currency='USD' AND EXISTS(SELECT 1 FROM freight_policy WHERE id='default' AND cny_per_usd_e4<>product_pricing.cny_per_currency_e4) THEN 'legacy_conflict' ELSE 'legacy_product' END,
updated_at,'migration'
FROM product_pricing WHERE id='current' AND currency<>'CNY' AND cny_per_currency_e4>0;
--> statement-breakpoint
INSERT OR IGNORE INTO exchange_rates (currency,cny_per_unit_e4,enabled,version,mutation_id,source,updated_at,updated_by)
SELECT 'USD',cny_per_usd_e4,1,1,'migration:USD','legacy_freight',updated_at,'migration'
FROM freight_policy WHERE id='default' AND cny_per_usd_e4>0;
--> statement-breakpoint
INSERT INTO exchange_rate_history (currency,version,cny_per_unit_e4,enabled,source,updated_at,updated_by)
SELECT currency,version,cny_per_unit_e4,enabled,source,updated_at,updated_by FROM exchange_rates;
