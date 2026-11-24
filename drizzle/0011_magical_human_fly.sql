CREATE TABLE `product_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`names` text NOT NULL,
	`icon` text,
	`channel` text NOT NULL,
	`keyword` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `product_categories_enabled_sort` ON `product_categories` (`enabled`,`sort_order`,`id`);--> statement-breakpoint
CREATE INDEX `product_categories_channel_sort` ON `product_categories` (`channel`,`enabled`,`sort_order`,`id`);