CREATE TABLE `purchase_stripe_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`bill_id` text NOT NULL,
	`user_id` text NOT NULL,
	`bill_version` integer NOT NULL,
	`paid_before` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`session_id` text,
	`url` text,
	`origin` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `procurement_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bill_id`) REFERENCES `procurement_bills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_stripe_active_bill` ON `purchase_stripe_payments` (`bill_id`) WHERE "purchase_stripe_payments"."state" IN ('pending','review');--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_stripe_session` ON `purchase_stripe_payments` (`session_id`);--> statement-breakpoint
CREATE INDEX `purchase_stripe_order` ON `purchase_stripe_payments` (`order_id`);