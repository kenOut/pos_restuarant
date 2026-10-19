// What two-way sync keeps in step between a restaurant's computer and ENYO
// Online. Every table here has a text "id" primary key, and database triggers
// (migrations drizzle/0008_sync.sql and drizzle-control/0001_sync.sql) record
// each change to it. Parents come before children, for a first full copy.
//
// Adding a table to a database? Add it here and to the triggers, or it won't sync.

export type SyncedTable = {
  table: string;
  /** Columns that belong to one side only and are never sent (e.g. folders on that computer). */
  local?: string[];
};

export const BRANCH_TABLES: SyncedTable[] = [
  // The backup copy folder is a folder on that computer; API websites go with that side's API keys.
  { table: "restaurants", local: ["backup_copy_dir", "api_allowed_origins"] },
  { table: "staff" },
  { table: "menu_categories" },
  { table: "menu_items" },
  { table: "floor_areas" },
  { table: "dining_tables" },
  { table: "orders" },
  { table: "kitchen_tickets" },
  { table: "order_lines" },
  { table: "payments" },
];

export const CONTROL_TABLES: SyncedTable[] = [
  { table: "organisation" },
  // Where a branch's database file lives differs on each computer.
  { table: "branches", local: ["db_path"] },
  { table: "hq_users" },
];

/** Not synced, on purpose: sign-ins (each side has its own), API keys, and the sync bookkeeping itself. */
export const NOT_SYNCED = ["sessions", "api_keys", "hq_sessions", "sync_meta", "sync_outbox", "sync_rows", "sync_link", "sync_peers"];
