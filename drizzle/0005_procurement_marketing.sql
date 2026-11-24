-- Adds merchant drafts and marketing configuration only. No existing data is changed.
CREATE TABLE `marketing_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`request_hash` text NOT NULL,
	`mutation_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`channel` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_campaigns_code_unique` ON `marketing_campaigns` (`code`);--> statement-breakpoint
CREATE INDEX `marketing_campaigns_created` ON `marketing_campaigns` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `marketing_campaigns_validity` ON `marketing_campaigns` (`enabled`,`starts_on`,`ends_on`);--> statement-breakpoint
CREATE TABLE `marketing_coupons` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`request_hash` text NOT NULL,
	`mutation_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`currency` text NOT NULL,
	`kind` text NOT NULL,
	`discount_value` integer NOT NULL,
	`minimum_cents` integer NOT NULL,
	`usage_limit` integer NOT NULL,
	CONSTRAINT "marketing_coupon_amount" CHECK("marketing_coupons"."discount_value" > 0 AND ("marketing_coupons"."kind" != 'percent' OR "marketing_coupons"."discount_value" <= 10000) AND "marketing_coupons"."minimum_cents" >= 0 AND "marketing_coupons"."usage_limit" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_coupons_code_unique` ON `marketing_coupons` (`code`);--> statement-breakpoint
CREATE INDEX `marketing_coupons_created` ON `marketing_coupons` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `marketing_coupons_validity` ON `marketing_coupons` (`enabled`,`starts_on`,`ends_on`);--> statement-breakpoint
CREATE TABLE `procurement_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`sku` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_cents` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `procurement_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "procurement_item_amount" CHECK("procurement_items"."quantity" > 0 AND "procurement_items"."unit_price_cents" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `procurement_items_position` ON `procurement_items` (`order_id`,`position`);--> statement-breakpoint
CREATE TABLE `procurement_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`text` text NOT NULL,
	`kind` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `procurement_orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `procurement_notes_order` ON `procurement_notes` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `procurement_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`customer_id` text NOT NULL,
	`platform` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`goods_cents` integer NOT NULL,
	`shipping_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`request_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "procurement_totals" CHECK("procurement_orders"."goods_cents" >= 0 AND "procurement_orders"."shipping_cents" >= 0 AND "procurement_orders"."total_cents" = "procurement_orders"."goods_cents" + "procurement_orders"."shipping_cents")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `procurement_orders_number_unique` ON `procurement_orders` (`number`);--> statement-breakpoint
CREATE INDEX `procurement_orders_created` ON `procurement_orders` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `procurement_orders_status_created` ON `procurement_orders` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `procurement_orders_customer` ON `procurement_orders` (`customer_id`);--> statement-breakpoint
