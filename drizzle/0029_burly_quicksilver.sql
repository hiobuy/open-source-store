CREATE TABLE `__new_cart_items` (
	`id` text NOT NULL,
	`type` text DEFAULT 'standard' NOT NULL,
	`customer_id` text NOT NULL,
	`channel` text DEFAULT '' NOT NULL,
	`product_id` text DEFAULT '' NOT NULL,
	`sku_id` text DEFAULT '' NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`product` text DEFAULT '{}' NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`initial_payload` text DEFAULT '{}' NOT NULL,
	`order_id` text,
	`state` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`id`, `type`),
	FOREIGN KEY (`customer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_cart_items` (id,customer_id,channel,product_id,sku_id,quantity,product,version,created_at,updated_at)
SELECT id,customer_id,channel,product_id,sku_id,quantity,product,version,created_at,updated_at FROM cart_items;
--> statement-breakpoint
INSERT INTO `__new_cart_items` (id,type,customer_id,channel,quantity,payload,initial_payload,order_id,state,version,created_at,updated_at)
SELECT id,'manual',customer_id,json_extract(payload,'$.sourcePlatform'),
COALESCE((SELECT SUM(json_extract(value,'$.quantity')) FROM json_each(payload,'$.items')),0),
payload,initial_payload,order_id,state,version,created_at,updated_at FROM manual_cart_items;
--> statement-breakpoint
DROP TABLE manual_cart_items;
--> statement-breakpoint
DROP TABLE `cart_items`;--> statement-breakpoint
ALTER TABLE `__new_cart_items` RENAME TO `cart_items`;--> statement-breakpoint
CREATE UNIQUE INDEX `cart_items_order_id_unique` ON `cart_items` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cart_item_identity` ON `cart_items` (`customer_id`,`channel`,`product_id`,`sku_id`) WHERE "cart_items"."type"='standard';--> statement-breakpoint
CREATE INDEX `cart_customer_updated` ON `cart_items` (`customer_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `cart_customer_type_state` ON `cart_items` (`customer_id`,`type`,`state`);