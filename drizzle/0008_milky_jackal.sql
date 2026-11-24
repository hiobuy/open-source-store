CREATE TABLE `procurement_remote` (
	`order_id` text PRIMARY KEY NOT NULL,
	`quote_id` text NOT NULL,
	`channel` text NOT NULL,
	`remote_id` text,
	`state` text DEFAULT 'ready' NOT NULL,
	`remote_status` text,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`cost_cny_cents` integer NOT NULL,
	`last_result` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `procurement_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quote_id`) REFERENCES `purchase_quotes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `procurement_remote_quote_id_unique` ON `procurement_remote` (`quote_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `procurement_remote_identity` ON `procurement_remote` (`channel`,`remote_id`);--> statement-breakpoint
CREATE TABLE `purchase_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`action` text NOT NULL,
	`state` text NOT NULL,
	`request` text NOT NULL,
	`result` text,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `procurement_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_attempt_once` ON `purchase_attempts` (`order_id`,`action`);--> statement-breakpoint
CREATE TABLE `purchase_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`channel` text NOT NULL,
	`request` text NOT NULL,
	`preview` text NOT NULL,
	`pricing` text NOT NULL,
	`cost_cny_cents` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `purchase_quotes_customer` ON `purchase_quotes` (`customer_id`,`created_at`);