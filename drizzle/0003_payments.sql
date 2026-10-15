CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`method` text NOT NULL,
	`amount` integer NOT NULL,
	`tendered` integer,
	`change` integer,
	`network` text,
	`account` text,
	`reference` text,
	`staff_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payments_order_idx` ON `payments` (`order_id`);--> statement-breakpoint
ALTER TABLE `orders` ADD `discount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `discount_reason` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `discount_approved_by` text REFERENCES staff(id);--> statement-breakpoint
ALTER TABLE `orders` ADD `tip` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `subtotal` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `taxes` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `total` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `paid_at` integer;