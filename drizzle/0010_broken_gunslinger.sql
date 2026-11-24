CREATE TABLE `cart_items` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`channel` text NOT NULL,
	`product_id` text NOT NULL,
	`sku_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`product` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cart_item_identity` ON `cart_items` (`customer_id`,`channel`,`product_id`,`sku_id`);--> statement-breakpoint
CREATE INDEX `cart_customer_updated` ON `cart_items` (`customer_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE TABLE `product_favorites` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`channel` text NOT NULL,
	`product_id` text NOT NULL,
	`product` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `favorite_identity` ON `product_favorites` (`customer_id`,`channel`,`product_id`);--> statement-breakpoint
CREATE INDEX `favorites_customer_updated` ON `product_favorites` (`customer_id`,`updated_at`,`id`);