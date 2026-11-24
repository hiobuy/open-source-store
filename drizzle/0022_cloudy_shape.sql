CREATE TABLE `manual_cart_items` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`payload` text NOT NULL,
	`initial_payload` text NOT NULL,
	`order_id` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `manual_cart_items_order_id_unique` ON `manual_cart_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `manual_cart_customer_state` ON `manual_cart_items` (`customer_id`,`state`,`updated_at`,`id`);