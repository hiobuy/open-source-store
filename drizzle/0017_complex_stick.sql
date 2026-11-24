ALTER TABLE `procurement_item_packages` ADD `receipt_source` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `package_hiobuy_identity` ON `packages` (`hiobuy_package_id`);