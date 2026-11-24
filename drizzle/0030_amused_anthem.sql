ALTER TABLE `payment_settings` ADD `stripe_success_url` text;--> statement-breakpoint
ALTER TABLE `payment_settings` ADD `stripe_cancel_url` text;--> statement-breakpoint
ALTER TABLE `purchase_stripe_payments` ADD `success_url` text;--> statement-breakpoint
ALTER TABLE `purchase_stripe_payments` ADD `cancel_url` text;