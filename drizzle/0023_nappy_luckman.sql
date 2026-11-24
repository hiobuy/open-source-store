CREATE TABLE `browsing_history` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`channel` text NOT NULL,
	`product_id` text NOT NULL,
	`product` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_viewed_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `browsing_history_identity` ON `browsing_history` (`customer_id`,`channel`,`product_id`);--> statement-breakpoint
CREATE INDEX `browsing_history_recent` ON `browsing_history` (`customer_id`,`last_viewed_at`,`id`);--> statement-breakpoint
CREATE TABLE `shop_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`channel` text NOT NULL,
	`shop_id` text NOT NULL,
	`name` text,
	`url` text,
	`image_url` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shop_subscription_identity` ON `shop_subscriptions` (`customer_id`,`channel`,`shop_id`);--> statement-breakpoint
CREATE INDEX `shop_subscription_recent` ON `shop_subscriptions` (`customer_id`,`created_at`,`id`);