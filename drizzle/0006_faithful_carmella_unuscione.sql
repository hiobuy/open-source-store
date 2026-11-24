CREATE TABLE `procurement_bills` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`currency` text NOT NULL,
	`goods_cents` integer NOT NULL,
	`service_cents` integer NOT NULL,
	`shipping_cents` integer NOT NULL,
	`discount_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`snapshot` text NOT NULL,
	`request_hash` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`void_reason` text,
	`paid_at` integer,
	FOREIGN KEY (`order_id`) REFERENCES `procurement_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "procurement_bill_total" CHECK("procurement_bills"."total_cents" >= 0 AND "procurement_bills"."total_cents" = "procurement_bills"."goods_cents" + "procurement_bills"."service_cents" + "procurement_bills"."shipping_cents" - "procurement_bills"."discount_cents")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `procurement_bill_active` ON `procurement_bills` (`order_id`) WHERE "procurement_bills"."status" != 'void';--> statement-breakpoint
CREATE INDEX `procurement_bills_customer` ON `procurement_bills` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `product_pricing` (
	`id` text PRIMARY KEY NOT NULL,
	`currency` text NOT NULL,
	`markup_bps` integer NOT NULL,
	`fixed_cny_cents` integer NOT NULL,
	`service_bps` integer NOT NULL,
	`service_cny_cents` integer NOT NULL,
	`cny_per_currency_e4` integer NOT NULL,
	`version` integer NOT NULL,
	`mutation_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `procurement_orders` ADD `mutation_id` text;