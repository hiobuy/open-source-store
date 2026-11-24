CREATE TABLE `procurement_aftersales` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`item_id` text NOT NULL,
	`link_id` text,
	`kind` text NOT NULL,
	`quantity` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`reason` text NOT NULL,
	`resolution` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `procurement_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `procurement_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`link_id`) REFERENCES `procurement_item_packages`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "procurement_aftersale_quantity" CHECK("procurement_aftersales"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `procurement_aftersales_order` ON `procurement_aftersales` (`order_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `procurement_aftersales_item_status` ON `procurement_aftersales` (`item_id`,`status`);--> statement-breakpoint
CREATE INDEX `procurement_aftersales_link` ON `procurement_aftersales` (`link_id`);--> statement-breakpoint
CREATE TABLE `procurement_item_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`item_id` text NOT NULL,
	`package_id` text NOT NULL,
	`allocated_quantity` integer NOT NULL,
	`received_quantity` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `procurement_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `procurement_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "procurement_link_quantity" CHECK("procurement_item_packages"."allocated_quantity" > 0 AND "procurement_item_packages"."received_quantity" >= 0 AND "procurement_item_packages"."received_quantity" <= "procurement_item_packages"."allocated_quantity")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `procurement_link_active` ON `procurement_item_packages` (`item_id`,`package_id`) WHERE "procurement_item_packages"."active" = 1;--> statement-breakpoint
CREATE INDEX `procurement_links_order` ON `procurement_item_packages` (`order_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `procurement_links_package` ON `procurement_item_packages` (`package_id`);--> statement-breakpoint
CREATE TABLE `procurement_tracking_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`item_id` text NOT NULL,
	`link_id` text,
	`case_id` text,
	`action` text NOT NULL,
	`note` text NOT NULL,
	`before_quantity` integer,
	`after_quantity` integer,
	`from_status` text,
	`to_status` text,
	`request_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `procurement_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `procurement_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`link_id`) REFERENCES `procurement_item_packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `procurement_aftersales`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `procurement_tracking_order` ON `procurement_tracking_events` (`order_id`,`created_at`,`id`);