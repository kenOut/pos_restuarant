// The head office database (data/control.db): the business, its branches and
// the head office logins. Each branch's own data lives in that branch's database.
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);

/** The business (one row). */
export const organisation = sqliteTable("organisation", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const branches = sqliteTable(
  "branches",
  {
    /** Also the restaurant id inside the branch's own database. */
    id: text("id").primaryKey(),
    /** Address of the branch: osu → osu.yourdomain.com or /b/osu. */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** The branch database file, relative to the data folder. */
    dbPath: text("db_path").notNull(),
    /** Deactivated branches can't be opened; their data is kept. */
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("branches_slug_idx").on(t.slug)]
);

/** Head office accounts: owners and directors who look after every branch. */
export const hqUsers = sqliteTable(
  "hq_users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** Stored lower-case. */
    email: text("email").notNull(),
    /** Argon2id hash. */
    passwordHash: text("password_hash").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("hq_users_email_idx").on(t.email)]
);

export const hqSessions = sqliteTable(
  "hq_sessions",
  {
    /** SHA-256 of the session token; the token itself only lives in the browser cookie. */
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => hqUsers.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("hq_sessions_user_idx").on(t.userId)]
);

export type Branch = typeof branches.$inferSelect;
export type HqUser = typeof hqUsers.$inferSelect;

/**
 * On a restaurant's computer: its link to ENYO Online (one row). The key is
 * needed to call ENYO Online, so it's kept here, on this computer only.
 */
export const syncLink = sqliteTable("sync_link", {
  id: text("id").primaryKey(),
  /** e.g. https://posrestuarant.up.railway.app/c/mamaakos */
  url: text("url").notNull(),
  key: text("key").notNull(),
  connectedAt: integer("connected_at", { mode: "timestamp_ms" }).notNull(),
  lastContactAt: integer("last_contact_at", { mode: "timestamp_ms" }),
  lastError: text("last_error"),
});

/** On ENYO Online: the restaurant computer allowed to sync with this business. Only a hash of its key is kept. */
export const syncPeers = sqliteTable("sync_peers", {
  id: text("id").primaryKey(),
  keyHash: text("key_hash").notNull(),
  /** The restaurant computer's sync node, fixed on its first contact. */
  nodeId: text("node_id"),
  createdAt: createdAt(),
  lastContactAt: integer("last_contact_at", { mode: "timestamp_ms" }),
  /** Each branch's address on the restaurant's network, as its tills use it ({ branchId: url }), for switching back. */
  addresses: text("addresses", { mode: "json" }).$type<Record<string, string>>(),
});

export type SyncLink = typeof syncLink.$inferSelect;
export type SyncPeer = typeof syncPeers.$inferSelect;
