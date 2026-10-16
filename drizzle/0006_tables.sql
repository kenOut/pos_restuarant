CREATE TABLE `dining_tables` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`area_id` text NOT NULL,
	`label` text NOT NULL,
	`seats` integer NOT NULL,
	`shape` text DEFAULT 'square' NOT NULL,
	`x` integer DEFAULT 0 NOT NULL,
	`y` integer DEFAULT 0 NOT NULL,
	`reserved_time` text,
	`reserved_name` text,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`area_id`) REFERENCES `floor_areas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dining_tables_label_idx` ON `dining_tables` (`restaurant_id`,`label`);--> statement-breakpoint
CREATE INDEX `dining_tables_area_idx` ON `dining_tables` (`area_id`);--> statement-breakpoint
CREATE TABLE `floor_areas` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `floor_areas_name_idx` ON `floor_areas` (`restaurant_id`,`name`);--> statement-breakpoint
ALTER TABLE `orders` ADD `table_id` text REFERENCES dining_tables(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `orders` ADD `guests` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `bill_printed_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_open_table_idx` ON `orders` (`table_id`) WHERE "status" in ('held', 'open') and "table_id" is not null;