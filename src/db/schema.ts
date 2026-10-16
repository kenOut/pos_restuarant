import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { TaxConfig } from "@/lib/tax-config";
import { MOMO_NETWORKS, ORDER_STATUSES, ORDER_TYPES, PAYMENT_METHODS, STAFF_ROLES, STATIONS, TICKET_STATUSES } from "./enums";

export * from "./enums";


/** Timestamps are stored as Unix milliseconds. */
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);

export const restaurants = sqliteTable("restaurants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** File name of the uploaded logo in data/uploads, or null for the default mark. */
  logoFile: text("logo_file"),
  receiptFooter: text("receipt_footer").notNull().default("Thank you for dining with us."),
  /** Discounts from cashiers and servers need an owner or manager's PIN. */
  discountNeedsApproval: integer("discount_needs_approval", { mode: "boolean" }).notNull().default(true),
  /** Null means Ghana's 2026 defaults (see DEFAULT_TAX_CONFIG). */
  taxConfig: text("tax_config", { mode: "json" }).$type<TaxConfig>(),
  /** Nightly backup time on the main computer's clock, "HH:MM". */
  backupTime: text("backup_time").notNull().default("23:30"),
  /** Optional second folder (e.g. a USB drive) that every backup is also copied to. */
  backupCopyDir: text("backup_copy_dir"),
  createdAt: createdAt(),
});

export const staff = sqliteTable(
  "staff",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id),
    name: text("name").notNull(),
    initials: text("initials").notNull(),
    role: text("role", { enum: STAFF_ROLES }).notNull(),
    /** Shown under the name on the sign-in screen, e.g. "Grill cook". Falls back to the role. */
    jobTitle: text("job_title"),
    /** Argon2id hash of the 4-digit PIN. The PIN itself is never stored. */
    pinHash: text("pin_hash").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    failedPinAttempts: integer("failed_pin_attempts").notNull().default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("staff_restaurant_idx").on(t.restaurantId)]
);

export const sessions = sqliteTable(
  "sessions",
  {
    /** SHA-256 of the session token; the token itself only lives in the browser cookie. */
    tokenHash: text("token_hash").primaryKey(),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_staff_idx").on(t.staffId)]
);


export const menuItems = sqliteTable(
  "menu_items",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id),
    name: text("name").notNull(),
    category: text("category").notNull(),
    station: text("station", { enum: STATIONS }).notNull(),
    /** Price in pesewas (GH₵ 1 = 100). */
    price: integer("price").notNull(),
    /** False when sold out: shown greyed and can't be added. */
    available: integer("available", { mode: "boolean" }).notNull().default(true),
    /** Taken off the menu but kept, because past orders refer to it. */
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("menu_items_restaurant_idx").on(t.restaurantId)]
);

/** Menu categories in the order they appear on the till. Items refer to them by name. */
export const menuCategories = sqliteTable(
  "menu_categories",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("menu_categories_name_idx").on(t.restaurantId, t.name)]
);



export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id),
    /** Order number shown on tickets and receipts, counting up per restaurant. */
    number: integer("number").notNull(),
    type: text("type", { enum: ORDER_TYPES }).notNull(),
    status: text("status", { enum: ORDER_STATUSES }).notNull(),
    tableLabel: text("table_label"),
    customerName: text("customer_name"),
    /** Staff member who opened the order. */
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id),
    /** Goes up on every save, so two tills can't overwrite each other's changes. */
    version: integer("version").notNull().default(1),
    /** Taken off before tax, in pesewas. Needs a manager unless a manager applied it. */
    discount: integer("discount").notNull().default(0),
    discountReason: text("discount_reason"),
    discountApprovedBy: text("discount_approved_by").references(() => staff.id),
    /** Added after tax and not taxed, in pesewas. */
    tip: integer("tip").notNull().default(0),
    /** Frozen when the order is paid, so later price or tax changes never rewrite it. */
    subtotal: integer("subtotal"),
    taxes: text("taxes", { mode: "json" }).$type<{ id: string; label: string; amount: number; displayAs?: string | null }[]>(),
    /** Whether the frozen total had its taxes inside the menu prices. */
    taxInclusive: integer("tax_inclusive", { mode: "boolean" }).notNull().default(false),
    total: integer("total"),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("orders_number_idx").on(t.restaurantId, t.number),
    index("orders_status_idx").on(t.restaurantId, t.status),
  ]
);


/** One "Send to kitchen": the lines that went together. */
export const kitchenTickets = sqliteTable(
  "kitchen_tickets",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: text("status", { enum: TICKET_STATUSES }).notNull().default("new"),
    sentBy: text("sent_by")
      .notNull()
      .references(() => staff.id),
    createdAt: createdAt(),
    /** Start pressed. */
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    /** Bumped: food is ready to serve. */
    readyAt: integer("ready_at", { mode: "timestamp_ms" }),
    /** Taken out to the guest. */
    servedAt: integer("served_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("kitchen_tickets_order_idx").on(t.orderId), index("kitchen_tickets_status_idx").on(t.status)]
);

export const orderLines = sqliteTable(
  "order_lines",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    menuItemId: text("menu_item_id")
      .notNull()
      .references(() => menuItems.id),
    /** Name, price and station as they were when added, so menu edits never rewrite old orders. */
    name: text("name").notNull(),
    unitPrice: integer("unit_price").notNull(),
    station: text("station", { enum: STATIONS }).notNull(),
    quantity: integer("quantity").notNull(),
    note: text("note"),
    /** Null until sent to the kitchen; sent lines are locked. */
    ticketId: text("ticket_id").references(() => kitchenTickets.id),
    position: integer("position").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("order_lines_order_idx").on(t.orderId)]
);

/** Money recorded against an order. ENYO POS records payments; it doesn't process them. */
export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    method: text("method", { enum: PAYMENT_METHODS }).notNull(),
    /** Amount put towards the bill, in pesewas. */
    amount: integer("amount").notNull(),
    /** Cash only: what the guest handed over, and the change given. */
    tendered: integer("tendered"),
    change: integer("change"),
    network: text("network", { enum: MOMO_NETWORKS }),
    /** Mobile money number, voucher code or house account name. */
    account: text("account"),
    reference: text("reference"),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id),
    createdAt: createdAt(),
  },
  (t) => [index("payments_order_idx").on(t.orderId)]
);

export type Staff = typeof staff.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type MenuItemRow = typeof menuItems.$inferSelect;
export type MenuCategory = typeof menuCategories.$inferSelect;
export type Restaurant = typeof restaurants.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderLine = typeof orderLines.$inferSelect;
export type Payment = typeof payments.$inferSelect;
