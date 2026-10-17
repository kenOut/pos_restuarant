// The ENYO Online platform database (data/platform.db), used only in online
// mode: the client businesses on this server and the seller's own sign-ins.
// Each business's data lives in its own folder (data/businesses/<id>/), never here.
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);

export const businesses = sqliteTable(
  "businesses",
  {
    id: text("id").primaryKey(),
    /** Address of the business: mamaakos → /c/mamaakos (or mamaakos.yourdomain.com). */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** Suspended businesses can't be opened; their data is kept. */
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    /** SHA-256 of the one-time setup code, until the business is set up. */
    setupCodeHash: text("setup_code_hash"),
    setupCodeExpiresAt: integer("setup_code_expires_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("businesses_slug_idx").on(t.slug)]
);

/** The seller's accounts (you, not the clients). */
export const platformAdmins = sqliteTable(
  "platform_admins",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("platform_admins_email_idx").on(t.email)]
);

export const platformSessions = sqliteTable(
  "platform_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    adminId: text("admin_id")
      .notNull()
      .references(() => platformAdmins.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("platform_sessions_admin_idx").on(t.adminId)]
);

export type Business = typeof businesses.$inferSelect;
export type PlatformAdmin = typeof platformAdmins.$inferSelect;
