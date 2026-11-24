CREATE TABLE `purchase_item_details` (
	`item_id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`remark` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `procurement_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `procurement_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `purchase_item_details_order` ON `purchase_item_details` (`order_id`);--> statement-breakpoint
ALTER TABLE `purchase_order_attachments` ADD `item_id` text REFERENCES procurement_items(id);