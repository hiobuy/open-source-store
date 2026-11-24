CREATE TABLE `cart_checkouts` (
	`id` text PRIMARY KEY NOT NULL,
	`preview_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`preview_id`) REFERENCES `cart_previews`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cart_checkouts_preview_id_unique` ON `cart_checkouts` (`preview_id`);--> statement-breakpoint
CREATE INDEX `cart_checkouts_customer` ON `cart_checkouts` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `cart_preview_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`preview_id` text NOT NULL,
	`position` integer NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`preview_id`) REFERENCES `cart_previews`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cart_preview_groups_position` ON `cart_preview_groups` (`preview_id`,`position`);--> statement-breakpoint
CREATE TABLE `cart_previews` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`selection` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cart_previews_customer` ON `cart_previews` (`customer_id`,`created_at`);