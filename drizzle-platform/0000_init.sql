CREATE TABLE `businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`setup_code_hash` text,
	`setup_code_expires_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `businesses_slug_idx` ON `businesses` (`slug`);--> statement-breakpoint
CREATE TABLE `platform_admins` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_admins_email_idx` ON `platform_admins` (`email`);--> statement-breakpoint
CREATE TABLE `platform_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `platform_admins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `platform_sessions_admin_idx` ON `platform_sessions` (`admin_id`);