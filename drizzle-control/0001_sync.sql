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
CREATE TRIGGER `sync_organisation_ai` AFTER INSERT ON `organisation` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('organisation', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('organisation', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_organisation_au` AFTER UPDATE ON `organisation` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('organisation', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('organisation', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_organisation_ad` AFTER DELETE ON `organisation` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('organisation', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('organisation', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_branches_ai` AFTER INSERT ON `branches` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('branches', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('branches', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_branches_au` AFTER UPDATE ON `branches` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('branches', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('branches', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_branches_ad` AFTER DELETE ON `branches` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('branches', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('branches', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_hq_users_ai` AFTER INSERT ON `hq_users` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('hq_users', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('hq_users', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_hq_users_au` AFTER UPDATE ON `hq_users` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('hq_users', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('hq_users', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
CREATE TRIGGER `sync_hq_users_ad` AFTER DELETE ON `hq_users` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('hq_users', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('hq_users', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'))
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;
