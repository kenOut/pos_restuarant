// The two-way sync engine, for one database (a head office database or one
// branch's). Changes are recorded by triggers (see ./tables.ts); this module
// reads them out, applies the other side's, and decides who wins.
//
// Who wins: every change carries a clock value that only moves forward on
// each computer, and each side moves its clock past any value it receives. The
// change with the higher value wins (ties go to the higher node id), so both
// sides end up with the same rows whichever order the changes arrive in, and a
// computer whose clock is wrong can't make old changes overwrite new ones.
import { randomBytes, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { SyncedTable } from "./tables";

type Client = Database.Database;
export type Row = Record<string, string | number | null>;
/** base: the version of the row this change was made from (0 for a new row). */
export type Change = { tbl: string; id: string; op: "u" | "d"; hlc: number; origin: string; base?: number; row: Row | null };
export type Conflict = { kind: string; orderId: string | null; detail: string };

export type Hooks = {
  /** Values for this side's own columns when a row arrives for the first time (e.g. a file location). */
  defaults?: (tbl: string, row: Row) => Row;
  /**
   * Last look before a winning change is written. Return "skip" to keep this
   * side's row; with resend, this side's row is sent back so the other side
   * takes it too (e.g. a paid order stays paid).
   */
  beforeWrite?: (tbl: string, incoming: Row, existing: Row | undefined) => { action: "write" } | { action: "skip"; resend?: boolean; conflict?: Conflict };
  /** A unique rule refused the row (e.g. a table that already has an order open): a fixed row to write, or null to keep it out. */
  onUnique?: (tbl: string, incoming: Row) => { row: Row; conflict?: Conflict } | null;
};

/** How long the change log keeps what a clash overwrote. */
export const CHANGELOG_DAYS = 180;

// ---------- Bookkeeping

export function meta(db: Client, key: string): string | null {
  return (db.prepare("SELECT value FROM sync_meta WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}
export function setMeta(db: Client, key: string, value: string): void {
  db.prepare("INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, value);
}
export const nodeId = (db: Client) => meta(db, "node")!;
export const epoch = (db: Client) => meta(db, "epoch")!;
/** After a restore: a new epoch tells the other side to send everything again. */
export function newEpoch(db: Client): string {
  const value = randomBytes(8).toString("hex");
  setMeta(db, "epoch", value);
  return value;
}

/** Moves this database's clock to at least `hlc` and returns a value past both. */
function tick(db: Client, atLeast = 0): number {
  const next = Math.max(Number(meta(db, "clock") ?? 0) + 1, Date.now(), atLeast);
  setMeta(db, "clock", String(next));
  return next;
}

// ---------- Columns (only real, shared columns are ever read or written)

const columnCache = new WeakMap<Client, Map<string, string[]>>();
function columns(db: Client, t: SyncedTable): string[] {
  let byTable = columnCache.get(db);
  if (!byTable) columnCache.set(db, (byTable = new Map()));
  if (!byTable.has(t.table)) {
    const all = (db.prepare(`PRAGMA table_info("${t.table}")`).all() as { name: string }[]).map((c) => c.name);
    byTable.set(t.table, all.filter((c) => !(t.local ?? []).includes(c)));
  }
  return byTable.get(t.table)!;
}
const tableMap = (tables: SyncedTable[]) => new Map(tables.map((t) => [t.table, t]));
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

function readRow(db: Client, t: SyncedTable, id: string): Row | null {
  const cols = columns(db, t);
  return (db.prepare(`SELECT ${cols.map(quote).join(", ")} FROM ${quote(t.table)} WHERE id = ?`).get(id) as Row | undefined) ?? null;
}

// ---------- Reading out this side's changes

/** This side's changes after `afterSeq`, oldest first, each with the row as it is now. */
export function collectChanges(db: Client, tables: SyncedTable[], afterSeq: number, limit = 500): { changes: Change[]; lastSeq: number; more: boolean } {
  const known = tableMap(tables);
  const entries = db.prepare("SELECT seq, tbl, row_id FROM sync_outbox WHERE seq > ? ORDER BY seq LIMIT ?").all(afterSeq, limit + 1) as { seq: number; tbl: string; row_id: string }[];
  const page = entries.slice(0, limit);
  const changes = page.flatMap((e) => {
    const t = known.get(e.tbl);
    if (!t) return [];
    const stamp = db.prepare("SELECT hlc, origin, base_hlc FROM sync_rows WHERE tbl = ? AND row_id = ?").get(e.tbl, e.row_id) as { hlc: number; origin: string; base_hlc: number } | undefined;
    const row = readRow(db, t, e.row_id);
    return [{ tbl: e.tbl, id: e.row_id, op: row ? "u" : "d", hlc: stamp?.hlc ?? 0, origin: stamp?.origin ?? nodeId(db), base: stamp?.base_hlc ?? 0, row } as Change];
  });
  return { changes, lastSeq: page.at(-1)?.seq ?? afterSeq, more: entries.length > limit };
}

export type FullCursor = { table: number; after: number };

/**
 * Every row, table by table (parents first), for a first copy or "sync
 * everything again". Rows from before sync existed count as oldest (clock 0).
 */
export function collectAll(db: Client, tables: SyncedTable[], cursor: FullCursor = { table: 0, after: 0 }, limit = 500): { changes: Change[]; next: FullCursor | null } {
  const changes: Change[] = [];
  let { table, after } = cursor;
  while (table < tables.length && changes.length < limit) {
    const t = tables[table];
    const cols = columns(db, t);
    const want = limit - changes.length;
    const rows = db
      .prepare(`SELECT t.rowid AS "__rowid", ${cols.map((c) => `t.${quote(c)}`).join(", ")}, s.hlc AS "__hlc", s.origin AS "__origin", s.base_hlc AS "__base" FROM ${quote(t.table)} t LEFT JOIN sync_rows s ON s.tbl = ? AND s.row_id = t.id WHERE t.rowid > ? ORDER BY t.rowid LIMIT ?`)
      .all(t.table, after, want) as (Row & { __rowid: number; __hlc: number | null; __origin: string | null; __base: number | null })[];
    for (const { __rowid, __hlc, __origin, __base, ...row } of rows) {
      changes.push({ tbl: t.table, id: String(row.id), op: "u", hlc: __hlc ?? 0, origin: __origin ?? nodeId(db), base: __base ?? 0, row });
      after = __rowid;
    }
    // A short page means this table is done.
    if (rows.length < want) {
      table++;
      after = 0;
    }
  }
  return { changes, next: table < tables.length ? { table, after } : null };
}

/** Changes not yet confirmed by the other side. */
export function pendingCount(db: Client, afterSeq: number): number {
  return (db.prepare("SELECT count(*) AS n FROM sync_outbox WHERE seq > ?").get(afterSeq) as { n: number }).n;
}

/** Drops outbox entries the other side has confirmed. */
export function pruneOutbox(db: Client, uptoSeq: number): void {
  db.prepare("DELETE FROM sync_outbox WHERE seq <= ?").run(uptoSeq);
}

/** Records a row as changed on this side now, so it's sent (and wins) again. */
export function resend(db: Client, tbl: string, id: string): void {
  const hlc = tick(db);
  db.prepare("INSERT INTO sync_outbox (tbl, row_id, op, hlc) VALUES (?, ?, 'u', ?)").run(tbl, id, hlc);
  db.prepare("INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES (?, ?, ?, ?, 0) ON CONFLICT (tbl, row_id) DO UPDATE SET base_hlc = sync_rows.hlc, hlc = excluded.hlc, origin = excluded.origin").run(tbl, id, hlc, nodeId(db));
}

/** Notes a clash: both sides changed the same row without seeing the other's change. */
function logClash(db: Client, tbl: string, id: string, kept: "this side" | "other side", keptRow: Row | null, lostRow: Row | null): void {
  if (JSON.stringify(keptRow) === JSON.stringify(lostRow)) return; // the same change both ways: nothing lost
  db.prepare("INSERT INTO sync_changelog (id, tbl, row_id, kept, kept_row, lost_row) VALUES (?, ?, ?, ?, ?, ?)").run(
    randomUUID(),
    tbl,
    id,
    kept,
    keptRow ? JSON.stringify(keptRow) : null,
    lostRow ? JSON.stringify(lostRow) : null
  );
}

// ---------- Applying the other side's changes

const isPlain = (v: unknown): v is string | number | null => v === null || typeof v === "string" || (typeof v === "number" && Number.isFinite(v));

/**
 * Applies changes from the other side in one transaction. Changes to unknown
 * tables or columns are ignored; only plain values are written. Recording is
 * paused while applying, so nothing bounces back.
 */
export function applyChanges(db: Client, tables: SyncedTable[], changes: Change[], hooks: Hooks = {}): { applied: number; skipped: number; conflicts: Conflict[]; touched: Change[] } {
  const known = tableMap(tables);
  const conflicts: Conflict[] = [];
  const touched: Change[] = [];
  let applied = 0;
  let skipped = 0;

  // Rows can arrive before the rows they refer to; references are complete once both sides have caught up.
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      setMeta(db, "applying", "1");
      try {
        let highest = 0;
        const resends: [string, string][] = [];
        for (const change of changes) {
          const t = known.get(change?.tbl);
          if (!t || typeof change.id !== "string" || !Number.isFinite(change.hlc) || typeof change.origin !== "string") continue;
          highest = Math.max(highest, change.hlc);
          const stamp = db.prepare("SELECT hlc, origin FROM sync_rows WHERE tbl = ? AND row_id = ?").get(t.table, change.id) as { hlc: number; origin: string } | undefined;
          const wins = !stamp || change.hlc > stamp.hlc || (change.hlc === stamp.hlc && change.origin > stamp.origin);
          // A clash: the other side changed this row without having seen this side's latest version of it.
          const clash = !!stamp && stamp.origin !== change.origin && stamp.hlc !== (Number(change.base) || 0) && stamp.hlc !== change.hlc;
          const shared = (row: Row | null) => (row ? Object.fromEntries(columns(db, t).filter((c) => c in row).map((c) => [c, row[c]])) : null);
          if (!wins) {
            if (clash) logClash(db, t.table, change.id, "this side", readRow(db, t, change.id), change.op === "d" ? null : shared(change.row));
            skipped++;
            continue;
          }
          if (clash) logClash(db, t.table, change.id, "other side", change.op === "d" ? null : shared(change.row), readRow(db, t, change.id));

          if (change.op === "d") {
            db.prepare(`DELETE FROM ${quote(t.table)} WHERE id = ?`).run(change.id);
          } else {
            const cols = columns(db, t);
            let incoming: Row = Object.fromEntries(cols.filter((c) => change.row && c in change.row && isPlain(change.row[c])).map((c) => [c, change.row![c]]));
            incoming.id = change.id;
            const existing = readRow(db, t, change.id) ?? undefined;
            const verdict = hooks.beforeWrite?.(t.table, incoming, existing) ?? { action: "write" };
            if (verdict.action === "skip") {
              if (verdict.conflict) conflicts.push(verdict.conflict);
              if (verdict.resend) resends.push([t.table, change.id]);
              skipped++;
              continue;
            }
            if (!existing && hooks.defaults) incoming = { ...hooks.defaults(t.table, incoming), ...incoming };
            const written = write(db, t, incoming);
            if (written === "invalid") {
              skipped++;
              continue;
            }
            if (written === "unique") {
              const fixed = hooks.onUnique?.(t.table, incoming);
              if (!fixed || write(db, t, fixed.row) !== "ok") {
                skipped++;
                continue;
              }
              if (fixed.conflict) conflicts.push(fixed.conflict);
            }
          }
          db.prepare("INSERT INTO sync_rows (tbl, row_id, hlc, origin, base_hlc) VALUES (?, ?, ?, ?, ?) ON CONFLICT (tbl, row_id) DO UPDATE SET hlc = excluded.hlc, origin = excluded.origin, base_hlc = excluded.base_hlc").run(t.table, change.id, change.hlc, change.origin, Number(change.base) || 0);
          touched.push(change);
          applied++;
        }
        tick(db, highest);
        db.prepare("DELETE FROM sync_changelog WHERE created_at < ?").run(Date.now() - CHANGELOG_DAYS * 86_400_000);
        setMeta(db, "applying", "0");
        // This side's version wins after all: record it as a new change, so it goes back.
        for (const [tbl, id] of resends) resend(db, tbl, id);
      } finally {
        setMeta(db, "applying", "0");
      }
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
  return { applied, skipped, conflicts, touched };
}

/**
 * Inserts or updates one row. "unique": a unique rule refused it (the caller
 * may fix the row); "invalid": the database refused it otherwise (e.g. a
 * required value missing), so it's left out rather than stopping the sync.
 */
function write(db: Client, t: SyncedTable, row: Row): "ok" | "unique" | "invalid" {
  const exists = db.prepare(`SELECT 1 FROM ${quote(t.table)} WHERE id = ?`).get(row.id);
  const cols = Object.keys(row).filter((c) => !exists || (c !== "id" && !(t.local ?? []).includes(c)));
  if (exists && cols.length === 0) return "ok";
  const sql = exists
    ? `UPDATE ${quote(t.table)} SET ${cols.map((c) => `${quote(c)} = ?`).join(", ")} WHERE id = ?`
    : `INSERT INTO ${quote(t.table)} (${cols.map(quote).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
  const save = db.prepare(sql);
  try {
    // A savepoint, so a refused row is undone on its own and the rest of the batch carries on.
    db.transaction(() => (exists ? save.run(...cols.map((c) => row[c]), row.id) : save.run(...cols.map((c) => row[c]))))();
    return "ok";
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code === "SQLITE_CONSTRAINT_UNIQUE") return "unique";
    if (code.startsWith("SQLITE_CONSTRAINT") || code === "SQLITE_MISMATCH") return "invalid";
    throw error;
  }
}
