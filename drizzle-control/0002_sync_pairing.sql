CREATE TABLE `sync_link` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`key` text NOT NULL,
	`connected_at` integer NOT NULL,
	`last_contact_at` integer,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `sync_peers` (
	`id` text PRIMARY KEY NOT NULL,
	`key_hash` text NOT NULL,
	`node_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`last_contact_at` integer
);
