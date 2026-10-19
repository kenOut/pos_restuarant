-- Two-way sync bookkeeping (see src/lib/sync/tables.ts).
-- sync_meta: this database's node id, its change clock, and whether a remote change is being applied.
-- sync_outbox: every local change, in order, to send to the other side.
-- sync_rows: for each synced row, the clock value and origin of its latest change (newest change wins).
CREATE TABLE `sync_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `sync_meta` (`key`, `value`) VALUES ('node', lower(hex(randomblob(16)))), ('epoch', lower(hex(randomblob(8)))), ('clock', '0'), ('applying', '0');
--> statement-breakpoint
CREATE TABLE `sync_outbox` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tbl` text NOT NULL,
	`row_id` text NOT NULL,
	`op` text NOT NULL,
	`hlc` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_rows` (
	`tbl` text NOT NULL,
	`row_id` text NOT NULL,
	`hlc` integer NOT NULL,
	`origin` text NOT NULL,
	PRIMARY KEY (`tbl`, `row_id`)
);
--> statement-breakpoint
CREATE TABLE "sync_conflicts" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"order_id" text,
	"detail" text NOT NULL,
	"created_at" integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	"resolved_at" integer
);
--> statement-breakpoint
CREATE TRIGGER `sync_restaurants_ai` AFTER INSERT ON `restaurants` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('restaurants', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('restaurants', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_restaurants_au` AFTER UPDATE ON `restaurants` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('restaurants', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('restaurants', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_restaurants_ad` AFTER DELETE ON `restaurants` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('restaurants', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('restaurants', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_staff_ai` AFTER INSERT ON `staff` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('staff', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('staff', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_staff_au` AFTER UPDATE ON `staff` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('staff', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('staff', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_staff_ad` AFTER DELETE ON `staff` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('staff', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('staff', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_menu_categories_ai` AFTER INSERT ON `menu_categories` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('menu_categories', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('menu_categories', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_menu_categories_au` AFTER UPDATE ON `menu_categories` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('menu_categories', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('menu_categories', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_menu_categories_ad` AFTER DELETE ON `menu_categories` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('menu_categories', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('menu_categories', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_menu_items_ai` AFTER INSERT ON `menu_items` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('menu_items', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('menu_items', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_menu_items_au` AFTER UPDATE ON `menu_items` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('menu_items', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('menu_items', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_menu_items_ad` AFTER DELETE ON `menu_items` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('menu_items', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('menu_items', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_floor_areas_ai` AFTER INSERT ON `floor_areas` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('floor_areas', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('floor_areas', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_floor_areas_au` AFTER UPDATE ON `floor_areas` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('floor_areas', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('floor_areas', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_floor_areas_ad` AFTER DELETE ON `floor_areas` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('floor_areas', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('floor_areas', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_dining_tables_ai` AFTER INSERT ON `dining_tables` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('dining_tables', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('dining_tables', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_dining_tables_au` AFTER UPDATE ON `dining_tables` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('dining_tables', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('dining_tables', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_dining_tables_ad` AFTER DELETE ON `dining_tables` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('dining_tables', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('dining_tables', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_orders_ai` AFTER INSERT ON `orders` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('orders', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('orders', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_orders_au` AFTER UPDATE ON `orders` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('orders', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('orders', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_orders_ad` AFTER DELETE ON `orders` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('orders', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('orders', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_kitchen_tickets_ai` AFTER INSERT ON `kitchen_tickets` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('kitchen_tickets', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('kitchen_tickets', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_kitchen_tickets_au` AFTER UPDATE ON `kitchen_tickets` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('kitchen_tickets', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('kitchen_tickets', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_kitchen_tickets_ad` AFTER DELETE ON `kitchen_tickets` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('kitchen_tickets', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('kitchen_tickets', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_order_lines_ai` AFTER INSERT ON `order_lines` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('order_lines', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('order_lines', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_order_lines_au` AFTER UPDATE ON `order_lines` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('order_lines', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('order_lines', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_order_lines_ad` AFTER DELETE ON `order_lines` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('order_lines', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('order_lines', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_payments_ai` AFTER INSERT ON `payments` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('payments', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('payments', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_payments_au` AFTER UPDATE ON `payments` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('payments', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('payments', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_payments_ad` AFTER DELETE ON `payments` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('payments', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('payments', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
