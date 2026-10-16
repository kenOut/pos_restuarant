ALTER TABLE `restaurants` ADD `backup_time` text DEFAULT '23:30' NOT NULL;--> statement-breakpoint
ALTER TABLE `restaurants` ADD `backup_copy_dir` text;