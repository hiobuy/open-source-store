CREATE TABLE `product_search_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`result` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `product_search_cache_expiry` ON `product_search_cache` (`expires_at`);--> statement-breakpoint
CREATE TABLE `product_search_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`ttl_seconds` integer DEFAULT 300 NOT NULL,
	`generation` text DEFAULT 'initial' NOT NULL,
	`updated_at` integer NOT NULL
);
