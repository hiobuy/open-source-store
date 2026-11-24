CREATE TABLE `payment_settings_revisions` (
	`revision` integer PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stripe_webhook_registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint_id` text,
	`key_ciphertext` text,
	`secret_ciphertext` text,
	`url` text NOT NULL,
	`api_version` text NOT NULL,
	`mode` text NOT NULL,
	`created_at` integer NOT NULL,
	`retired_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `stripe_webhook_cleanup` ON `stripe_webhook_registrations` (`retired_at`) WHERE "stripe_webhook_registrations"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE `payment_settings` ADD `stripe_webhook_registration_id` text;--> statement-breakpoint
ALTER TABLE `payment_settings` ADD `revision` integer DEFAULT 0 NOT NULL;