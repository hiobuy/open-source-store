ALTER TABLE `packages` ADD `declared_currency` text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `packages` ADD `fulfillment_items` text;