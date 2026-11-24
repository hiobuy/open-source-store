CREATE TABLE `purchase_coupon_redemptions` (
	`order_id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`coupon_id` text NOT NULL,
	`code` text NOT NULL,
	`currency` text NOT NULL,
	`discount_cents` integer NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `procurement_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bill_id`) REFERENCES `procurement_bills`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`coupon_id`) REFERENCES `marketing_coupons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `purchase_coupon_usage` ON `purchase_coupon_redemptions` (`coupon_id`,`state`);--> statement-breakpoint
CREATE TABLE `purchase_order_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`source_upload_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `procurement_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_order_attachments_object_key_unique` ON `purchase_order_attachments` (`object_key`);--> statement-breakpoint
CREATE INDEX `purchase_attachments_order` ON `purchase_order_attachments` (`order_id`);--> statement-breakpoint
CREATE TABLE `purchase_order_details` (
	`order_id` text PRIMARY KEY NOT NULL,
	`remark` text DEFAULT '' NOT NULL,
	`request_hash` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `procurement_orders`(`id`) ON UPDATE no action ON DELETE no action
);
