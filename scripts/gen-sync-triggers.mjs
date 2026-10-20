// Writes the sync bookkeeping and change-recording triggers for both databases
// (drizzle/0008_sync.sql, drizzle-control/0001_sync.sql, and the upgrades 0009 / 0004). Keep the lists in step with
// src/lib/sync/tables.ts; a unit test checks they match. New synced tables need a new
// migration with their triggers rather than editing these files once released.
import fs from "node:fs";
const BRANCH = ["restaurants", "staff", "menu_categories", "menu_items", "floor_areas", "dining_tables", "orders", "kitchen_tickets", "order_lines", "payments"];
const CONTROL = ["organisation", "branches", "hq_users"];

const header = `-- Two-way sync bookkeeping (see src/lib/sync/tables.ts).
-- sync_meta: this database's node id, its change clock, and whether a remote change is being applied.
-- sync_outbox: every local change, in order, to send to the other side.
-- sync_rows: for each synced row, the clock value and origin of its latest change (newest change wins).
CREATE TABLE \`sync_meta\` (
	\`key\` text PRIMARY KEY NOT NULL,
	\`value\` text NOT NULL
);
--> statement-breakpoint
INSERT INTO \`sync_meta\` (\`key\`, \`value\`) VALUES ('node', lower(hex(randomblob(16)))), ('epoch', lower(hex(randomblob(8)))), ('clock', '0'), ('applying', '0');
--> statement-breakpoint
CREATE TABLE \`sync_outbox\` (
	\`seq\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`tbl\` text NOT NULL,
	\`row_id\` text NOT NULL,
	\`op\` text NOT NULL,
	\`hlc\` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`sync_rows\` (
	\`tbl\` text NOT NULL,
	\`row_id\` text NOT NULL,
	\`hlc\` integer NOT NULL,
	\`origin\` text NOT NULL,
	PRIMARY KEY (\`tbl\`, \`row_id\`)
);`;

// The clock only moves forward: the later of "now" and one past the last value used.
const tick = `UPDATE sync_meta SET value = CAST(max(CAST(value AS INTEGER) + 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)) AS TEXT) WHERE key = 'clock';`;
const clock = `(SELECT CAST(value AS INTEGER) FROM sync_meta WHERE key = 'clock')`;
const node = `(SELECT value FROM sync_meta WHERE key = 'node')`;
const recording = `(SELECT value FROM sync_meta WHERE key = 'applying') = '0'`;

function triggers(t) {
  const out = [];
  for (const [event, ref, op, suffix] of [["INSERT", "NEW", "u", "ai"], ["UPDATE", "NEW", "u", "au"], ["DELETE", "OLD", "d", "ad"]]) {
    out.push(`CREATE TRIGGER \`sync_${t}_${suffix}\` AFTER ${event} ON \`${t}\` WHEN ${recording} BEGIN
	${tick}
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('${t}', ${ref}.id, '${op}', ${clock});
	INSERT INTO sync_rows (tbl, row_id, hlc, origin) VALUES ('${t}', ${ref}.id, ${clock}, ${node})
		ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin;
END;`);
  }
  return out;
}

// Branch databases also keep the conflicts sync found, for a manager to look at.
const conflicts = `CREATE TABLE "sync_conflicts" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"order_id" text,
	"detail" text NOT NULL,
	"created_at" integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	"resolved_at" integer
);`;

for (const [file, tables] of [["drizzle/0008_sync.sql", BRANCH], ["drizzle-control/0001_sync.sql", CONTROL]]) {
  const parts = [header, ...(tables === BRANCH ? [conflicts] : []), ...tables.flatMap(triggers)];
  fs.writeFileSync(file, parts.join("\n--> statement-breakpoint\n") + "\n");
}

// ---------- Upgrade 2 (drizzle/0009_sync_changelog.sql, drizzle-control/0004_sync_changelog.sql)
// Each row also remembers the version its latest change was made from (base_hlc), so a
// change made without seeing the other side's latest version (a real clash) can be told
// apart from a normal edit. sync_changelog keeps what such a clash overwrote or discarded.
const upgrade = `ALTER TABLE \`sync_rows\` ADD \`base_hlc\` integer DEFAULT 0 NOT NULL;
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
CREATE INDEX "sync_changelog_created_idx" ON "sync_changelog" ("created_at");`;

function triggersV2(t) {
  const out = [];
  for (const [event, ref, op, suffix] of [["INSERT", "NEW", "u", "ai"], ["UPDATE", "NEW", "u", "au"], ["DELETE", "OLD", "d", "ad"]]) {
    out.push(`DROP TRIGGER IF EXISTS \`sync_${t}_${suffix}\`;`);
    out.push(`CREATE TRIGGER \`sync_${t}_${suffix}\` AFTER ${event} ON \`${t}\` WHEN ${recording} BEGIN
	${tick}
	INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES ('${t}', ${ref}.id, '${op}', ${clock});
	INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES ('${t}', ${ref}.id, ${clock}, ${node}, 0)
		ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin;
END;`);
  }
  return out;
}

for (const [file, tables] of [["drizzle/0009_sync_changelog.sql", BRANCH], ["drizzle-control/0004_sync_changelog.sql", CONTROL]]) {
  const extra = tables === BRANCH ? [`ALTER TABLE "sync_conflicts" ADD "resolved_by" text;`] : [];
  fs.writeFileSync(file, [upgrade, ...extra, ...tables.flatMap(triggersV2)].join("\n--> statement-breakpoint\n") + "\n");
}
console.log("ok");
