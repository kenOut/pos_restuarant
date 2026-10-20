// What a manager looks at after sync: clashes that need a decision
// (sync_conflicts) and what clashes overwrote (sync_changelog), in plain words.
import type Database from "better-sqlite3";
import { formatOrderNumber } from "@/lib/orders/shared";

type Client = Database.Database;

export type ConflictItem = { id: string; kind: string; orderId: string | null; detail: string; createdAt: number; resolvedAt: number | null; resolvedBy: string | null };

export const CONFLICT_ADVICE: Record<string, string> = {
  overpaid: "Give the guest back what was taken twice, and note it for the cash-up.",
  "table-taken": "Check the floor plan: move one of the orders to another table, or pay both.",
};

export function listConflicts(db: Client, { open }: { open: boolean }, limit = 50): ConflictItem[] {
  const rows = db
    .prepare(`SELECT id, kind, order_id, detail, created_at, resolved_at, resolved_by FROM sync_conflicts WHERE resolved_at IS ${open ? "" : "NOT "}NULL ORDER BY ${open ? "created_at" : "resolved_at DESC"} LIMIT ?`)
    .all(limit) as { id: string; kind: string; order_id: string | null; detail: string; created_at: number; resolved_at: number | null; resolved_by: string | null }[];
  return rows.map((r) => ({ id: r.id, kind: r.kind, orderId: r.order_id, detail: r.detail, createdAt: r.created_at, resolvedAt: r.resolved_at, resolvedBy: r.resolved_by }));
}

export const openConflictCount = (db: Client) => (db.prepare("SELECT count(*) AS n FROM sync_conflicts WHERE resolved_at IS NULL").get() as { n: number }).n;

/** A manager has dealt with it. */
export function resolveConflict(db: Client, id: string, by: string, now = new Date()): { ok: true } | { ok: false; error: string } {
  const result = db.prepare("UPDATE sync_conflicts SET resolved_at = ?, resolved_by = ? WHERE id = ? AND resolved_at IS NULL").run(now.getTime(), by, String(id));
  return result.changes ? { ok: true } : { ok: false, error: "That has already been dealt with." };
}

// ---------- The change log

const TABLES: Record<string, string> = {
  restaurants: "Business settings",
  staff: "Staff member",
  menu_categories: "Menu category",
  menu_items: "Dish",
  floor_areas: "Floor area",
  dining_tables: "Table",
  orders: "Order",
  kitchen_tickets: "Kitchen ticket",
  order_lines: "Item on an order",
  payments: "Payment",
};
const MONEY = new Set(["price", "unit_price", "total", "subtotal", "discount", "tip", "amount", "tendered", "change"]);
/** Bookkeeping that changes with every edit, or isn't for showing. */
const HIDDEN = new Set(["id", "updated_at", "version", "created_at", "restaurant_id", "failed_pin_attempts", "locked_until"]);
const FIELD_NAMES: Record<string, string> = {
  unit_price: "Price",
  table_label: "Table",
  table_id: "Table (floor plan)",
  customer_name: "Customer",
  staff_id: "Server",
  discount_reason: "Discount reason",
  paid_at: "Paid",
  bill_printed_at: "Bill printed",
  pin_hash: "PIN",
  job_title: "Job title",
  receipt_footer: "Receipt footer",
  tax_config: "Taxes",
  reserved_time: "Reserved at",
  reserved_name: "Reserved for",
};
const fieldName = (key: string) => FIELD_NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");

function show(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "–";
  if (key === "pin_hash") return "(a PIN)";
  if (MONEY.has(key) && typeof value === "number") return `GH₵ ${(value / 100).toFixed(2)}`;
  if (/_at$/.test(key) && typeof value === "number") return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" }).format(value);
  if (typeof value === "number" && (key === "available" || key === "active" || key === "archived")) return value ? "Yes" : "No";
  return String(value);
}

function describe(tbl: string, row: Record<string, unknown> | null): string {
  const kind = TABLES[tbl] ?? tbl;
  if (!row) return kind;
  if (tbl === "orders" && typeof row.number === "number") return `Order #${formatOrderNumber(row.number)}`;
  if (tbl === "dining_tables" && row.label) return `Table ${row.label}`;
  const name = row.name ?? row.label;
  return name ? `${kind}: ${name}` : kind;
}

export type ChangeLogEntry = {
  id: string;
  at: number;
  what: string;
  /** "this side": this computer's version was kept; "other side": the other's was. */
  kept: "this side" | "other side";
  /** Gone entirely (one side deleted it), or the fields that differed. */
  deleted: "kept" | "lost" | null;
  differences: { field: string; kept: string; lost: string }[];
};

export function listChangeLog(db: Client, limit = 100): ChangeLogEntry[] {
  const rows = db.prepare("SELECT id, tbl, kept, kept_row, lost_row, created_at FROM sync_changelog ORDER BY created_at DESC LIMIT ?").all(limit) as {
    id: string;
    tbl: string;
    kept: "this side" | "other side";
    kept_row: string | null;
    lost_row: string | null;
    created_at: number;
  }[];
  return rows.map((r) => {
    const kept = r.kept_row ? (JSON.parse(r.kept_row) as Record<string, unknown>) : null;
    const lost = r.lost_row ? (JSON.parse(r.lost_row) as Record<string, unknown>) : null;
    const keys = [...new Set([...Object.keys(kept ?? {}), ...Object.keys(lost ?? {})])].filter((k) => !HIDDEN.has(k));
    return {
      id: r.id,
      at: r.created_at,
      what: describe(r.tbl, kept ?? lost),
      kept: r.kept,
      deleted: !kept ? "kept" : !lost ? "lost" : null,
      differences:
        kept && lost
          ? keys.filter((k) => JSON.stringify(kept[k]) !== JSON.stringify(lost[k])).map((k) => ({ field: fieldName(k), kept: show(k, kept[k]), lost: show(k, lost[k]) }))
          : [],
    };
  });
}
