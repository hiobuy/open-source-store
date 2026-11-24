ALTER TABLE `procurement_bills` ADD `paid_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `procurement_bills` SET `paid_cents` = `total_cents` WHERE `status` = 'paid';
