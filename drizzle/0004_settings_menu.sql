CREATE TABLE `menu_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `menu_categories_name_idx` ON `menu_categories` (`restaurant_id`,`name`);--> statement-breakpoint
ALTER TABLE `menu_items` ADD `archived` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `tax_inclusive` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `restaurants` ADD `logo_file` text;--> statement-breakpoint
ALTER TABLE `restaurants` ADD `receipt_footer` text DEFAULT 'Thank you for dining with us.' NOT NULL;--> statement-breakpoint
ALTER TABLE `restaurants` ADD `discount_needs_approval` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `restaurants` ADD `tax_config` text;--> statement-breakpoint
-- Existing menus: create a category row for every category already used, in menu order.
INSERT INTO `menu_categories` (`id`, `restaurant_id`, `name`, `sort_order`)
SELECT lower(hex(randomblob(16))), `restaurant_id`, `category`, min(`sort_order`) FROM `menu_items` GROUP BY `restaurant_id`, `category`;
