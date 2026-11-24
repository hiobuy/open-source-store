ALTER TABLE `procurement_remote` ADD `sync_next_at` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `procurement_remote` ADD `sync_locked_until` integer;--> statement-breakpoint
ALTER TABLE `procurement_remote` ADD `sync_lock_token` text;--> statement-breakpoint
ALTER TABLE `procurement_remote` ADD `sync_failures` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `procurement_remote` ADD `sync_error_code` text;--> statement-breakpoint
CREATE INDEX `procurement_remote_sync_due` ON `procurement_remote` (`sync_next_at`,`sync_locked_until`);