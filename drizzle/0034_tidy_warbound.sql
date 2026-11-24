CREATE TABLE `shipment_milestones` (
	`shipment_id` text PRIMARY KEY NOT NULL,
	`packed_at` integer,
	`hiobuy_paid_at` integer,
	`shipped_at` integer,
	FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON UPDATE no action ON DELETE cascade
);
