CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`translations` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`mutation_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `announcements_public_order` ON `announcements` (`status`,`pinned`,`published_at`,`id`);