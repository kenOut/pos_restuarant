ALTER TABLE `sync_rows` ADD `base_hlc` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE "sync_changelog" (
	"id" text PRIMARY KEY NOT NULL,
	"tbl" text NOT NULL,
	"row_id" text NOT NULL,
	"kept" text NOT NULL,
	"kept_row" text,
	"lost_row" text,
	"created_at" integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sync_changelog_created_idx" ON "sync_changelog" ("created_at");
--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD "resolved_by" text;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_restaurants_ai`;
--> statement-breakpoint
CREATE TRIGGER `sync_restaurants_ai` AFTER INSERT ON `restaurants` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('restaurants', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('restaurants', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_restaurants_au`;
--> statement-breakpoint
CREATE TRIGGER `sync_restaurants_au` AFTER UPDATE ON `restaurants` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('restaurants', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('restaurants', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_restaurants_ad`;
--> statement-breakpoint
CREATE TRIGGER `sync_restaurants_ad` AFTER DELETE ON `restaurants` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('restaurants', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('restaurants', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_staff_ai`;
--> statement-breakpoint
CREATE TRIGGER `sync_staff_ai` AFTER INSERT ON `staff` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('staff', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('staff', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_staff_au`;
--> statement-breakpoint
CREATE TRIGGER `sync_staff_au` AFTER UPDATE ON `staff` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('staff', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('staff', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_staff_ad`;
--> statement-breakpoint
CREATE TRIGGER `sync_staff_ad` AFTER DELETE ON `staff` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('staff', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('staff', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_menu_categories_ai`;
--> statement-breakpoint
CREATE TRIGGER `sync_menu_categories_ai` AFTER INSERT ON `menu_categories` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('menu_categories', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('menu_categories', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_menu_categories_au`;
--> statement-breakpoint
CREATE TRIGGER `sync_menu_categories_au` AFTER UPDATE ON `menu_categories` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('menu_categories', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('menu_categories', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_menu_categories_ad`;
--> statement-breakpoint
CREATE TRIGGER `sync_menu_categories_ad` AFTER DELETE ON `menu_categories` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('menu_categories', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('menu_categories', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_menu_items_ai`;
--> statement-breakpoint
CREATE TRIGGER `sync_menu_items_ai` AFTER INSERT ON `menu_items` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('menu_items', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('menu_items', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_menu_items_au`;
--> statement-breakpoint
CREATE TRIGGER `sync_menu_items_au` AFTER UPDATE ON `menu_items` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('menu_items', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('menu_items', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_menu_items_ad`;
--> statement-breakpoint
CREATE TRIGGER `sync_menu_items_ad` AFTER DELETE ON `menu_items` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('menu_items', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('menu_items', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_floor_areas_ai`;
--> statement-breakpoint
CREATE TRIGGER `sync_floor_areas_ai` AFTER INSERT ON `floor_areas` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('floor_areas', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('floor_areas', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_floor_areas_au`;
--> statement-breakpoint
CREATE TRIGGER `sync_floor_areas_au` AFTER UPDATE ON `floor_areas` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('floor_areas', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('floor_areas', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_floor_areas_ad`;
--> statement-breakpoint
CREATE TRIGGER `sync_floor_areas_ad` AFTER DELETE ON `floor_areas` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('floor_areas', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('floor_areas', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_dining_tables_ai`;
--> statement-breakpoint
CREATE TRIGGER `sync_dining_tables_ai` AFTER INSERT ON `dining_tables` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('dining_tables', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('dining_tables', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_dining_tables_au`;
--> statement-breakpoint
CREATE TRIGGER `sync_dining_tables_au` AFTER UPDATE ON `dining_tables` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('dining_tables', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('dining_tables', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_dining_tables_ad`;
--> statement-breakpoint
CREATE TRIGGER `sync_dining_tables_ad` AFTER DELETE ON `dining_tables` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('dining_tables', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('dining_tables', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_orders_ai`;
--> statement-breakpoint
CREATE TRIGGER `sync_orders_ai` AFTER INSERT ON `orders` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('orders', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('orders', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_orders_au`;
--> statement-breakpoint
CREATE TRIGGER `sync_orders_au` AFTER UPDATE ON `orders` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('orders', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('orders', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_orders_ad`;
--> statement-breakpoint
CREATE TRIGGER `sync_orders_ad` AFTER DELETE ON `orders` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('orders', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('orders', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_kitchen_tickets_ai`;
--> statement-breakpoint
CREATE TRIGGER `sync_kitchen_tickets_ai` AFTER INSERT ON `kitchen_tickets` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('kitchen_tickets', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('kitchen_tickets', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_kitchen_tickets_au`;
--> statement-breakpoint
CREATE TRIGGER `sync_kitchen_tickets_au` AFTER UPDATE ON `kitchen_tickets` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('kitchen_tickets', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('kitchen_tickets', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_kitchen_tickets_ad`;
--> statement-breakpoint
CREATE TRIGGER `sync_kitchen_tickets_ad` AFTER DELETE ON `kitchen_tickets` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('kitchen_tickets', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('kitchen_tickets', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_order_lines_ai`;
--> statement-breakpoint
CREATE TRIGGER `sync_order_lines_ai` AFTER INSERT ON `order_lines` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('order_lines', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('order_lines', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_order_lines_au`;
--> statement-breakpoint
CREATE TRIGGER `sync_order_lines_au` AFTER UPDATE ON `order_lines` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('order_lines', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('order_lines', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_order_lines_ad`;
--> statement-breakpoint
CREATE TRIGGER `sync_order_lines_ad` AFTER DELETE ON `order_lines` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('order_lines', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('order_lines', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_payments_ai`;
--> statement-breakpoint
CREATE TRIGGER `sync_payments_ai` AFTER INSERT ON `payments` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('payments', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('payments', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_payments_au`;
--> statement-breakpoint
CREATE TRIGGER `sync_payments_au` AFTER UPDATE ON `payments` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('payments', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('payments', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_payments_ad`;
--> statement-breakpoint
CREATE TRIGGER `sync_payments_ad` AFTER DELETE ON `payments` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('payments', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('payments', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
