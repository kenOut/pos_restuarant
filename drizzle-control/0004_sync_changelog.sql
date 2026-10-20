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
DROP TRIGGER IF EXISTS `sync_organisation_ai`;
--> statement-breakpoint
CREATE TRIGGER `sync_organisation_ai` AFTER INSERT ON `organisation` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('organisation', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('organisation', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_organisation_au`;
--> statement-breakpoint
CREATE TRIGGER `sync_organisation_au` AFTER UPDATE ON `organisation` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('organisation', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('organisation', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_organisation_ad`;
--> statement-breakpoint
CREATE TRIGGER `sync_organisation_ad` AFTER DELETE ON `organisation` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('organisation', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('organisation', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_branches_ai`;
--> statement-breakpoint
CREATE TRIGGER `sync_branches_ai` AFTER INSERT ON `branches` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('branches', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('branches', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_branches_au`;
--> statement-breakpoint
CREATE TRIGGER `sync_branches_au` AFTER UPDATE ON `branches` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('branches', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('branches', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_branches_ad`;
--> statement-breakpoint
CREATE TRIGGER `sync_branches_ad` AFTER DELETE ON `branches` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('branches', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('branches', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_hq_users_ai`;
--> statement-breakpoint
CREATE TRIGGER `sync_hq_users_ai` AFTER INSERT ON `hq_users` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('hq_users', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('hq_users', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_hq_users_au`;
--> statement-breakpoint
CREATE TRIGGER `sync_hq_users_au` AFTER UPDATE ON `hq_users` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('hq_users', NEW.id, 'u', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('hq_users', NEW.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `sync_hq_users_ad`;
--> statement-breakpoint
CREATE TRIGGER `sync_hq_users_ad` AFTER DELETE ON `hq_users` WHEN (SELECT value FROM sync_meta WHERE key = 'applying') = '0' BEGIN
	UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('hq_users', OLD.id, 'd', (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'));
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('hq_users', OLD.id, (SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock'), (SELECT value FROM sync_meta WHERE key = 'node'), 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;
