// What sync does when both sides changed the same thing while apart, beyond
// "the later change wins" (see ./engine.ts).
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { formatOrderNumber } from "@/lib/orders/shared";
import { resend, type Change, type Conflict, type Hooks, type Row } from "./engine";

const orderNo = (n: unknown) => (typeof n === "number" ? `#${formatOrderNumber(n)}` : "An order");

/** A branch's data: orders, payments, menu, staff, tables… */
export function branchHooks(db: Database.Database): Hooks {
  return {
    beforeWrite(tbl, incoming, existing) {
      // A paid order stays paid: an edit from the other side made before it heard about the payment loses.
      if (tbl === "orders" && existing?.status === "paid" && incoming.status !== "paid") return { action: "skip", resend: true };
      return { action: "write" };
    },
    onUnique(tbl, incoming) {
      if (tbl === "orders" && incoming.table_id) return tableClash(db, incoming);
      return otherClash(tbl, incoming);
    },
  };
}

/**
 * Both sides opened an order on the same table while apart. Both orders are
 * kept; the one opened first keeps the table on both sides (so they agree),
 * and the other keeps its table name but leaves the floor plan.
 */
function tableClash(db: Database.Database, incoming: Row): { row: Row; conflict: Conflict } {
  const occupant = db
    .prepare("SELECT id, number, created_at FROM orders WHERE table_id = ? AND status IN ('held', 'open') AND id <> ?")
    .get(incoming.table_id, incoming.id) as { id: string; number: number; created_at: number } | undefined;
  const incomingFirst = !!occupant && (Number(incoming.created_at) < occupant.created_at || (Number(incoming.created_at) === occupant.created_at && String(incoming.id) < occupant.id));
  const loser = incomingFirst ? { id: occupant!.id, number: occupant!.number } : { id: String(incoming.id), number: incoming.number };
  const conflict: Conflict = {
    kind: "table-taken",
    orderId: loser.id,
    detail: `${orderNo(loser.number)} was opened on table ${incoming.table_label ?? ""} while another order was open there. It's kept, but no longer shown on the floor plan.`,
  };
  if (incomingFirst) {
    // The order already here gives up the table, and the other side is told.
    db.prepare("UPDATE orders SET table_id = NULL WHERE id = ?").run(occupant!.id);
    resend(db, "orders", occupant!.id);
    return { row: incoming, conflict };
  }
  return { row: { ...incoming, table_id: null }, conflict };
}

function otherClash(tbl: string, incoming: Row): { row: Row } | null {
  // Areas and tables with the same name made on both sides: keep both, the second renamed.
  if (tbl === "floor_areas") return { row: { ...incoming, name: `${incoming.name} (2)` } };
  if (tbl === "dining_tables") return { row: { ...incoming, label: `${incoming.label}-2` } };
  // A menu category of the same name on both sides: one is enough (dishes refer to it by name).
  return null;
}

/** Head office data: the business, its branches, head office sign-ins. */
export const controlHooks: Hooks = {
  defaults(tbl, row): Row {
    // Each computer keeps a branch's database in its own place.
    if (tbl === "branches") return { db_path: `branches/${row.id}/enyo.db` };
    return {};
  },
  onUnique(tbl, incoming) {
    if (tbl === "branches") return { row: { ...incoming, slug: `${incoming.slug}-2` } };
    return null;
  },
};

/**
 * After a branch's changes are applied: payments from both sides on the same
 * order can add up to more than the bill. That's flagged for a manager.
 */
export function findOverpaid(db: Database.Database, touched: Change[]): Conflict[] {
  const orderIds = [...new Set(touched.filter((c) => c.tbl === "payments" && c.row?.order_id).map((c) => String(c.row!.order_id)))];
  return orderIds.flatMap((orderId) => {
    const order = db.prepare("SELECT number, status, total FROM orders WHERE id = ?").get(orderId) as { number: number; status: string; total: number | null } | undefined;
    if (!order || order.status !== "paid" || order.total === null) return [];
    const paid = (db.prepare("SELECT coalesce(sum(amount), 0) AS paid FROM payments WHERE order_id = ?").get(orderId) as { paid: number }).paid;
    if (paid <= order.total) return [];
    return [{ kind: "overpaid", orderId, detail: `${orderNo(order.number)} was paid on both sides: GH₵ ${((paid - order.total) / 100).toFixed(2)} more than the bill was taken.` }];
  });
}

/** Keeps conflicts for a manager to look at; the same open problem isn't listed twice. */
export function saveConflicts(db: Database.Database, conflicts: Conflict[]): void {
  const exists = db.prepare("SELECT 1 FROM sync_conflicts WHERE kind = ? AND coalesce(order_id, '') = coalesce(?, '') AND resolved_at IS NULL");
  const insert = db.prepare("INSERT INTO sync_conflicts (id, kind, order_id, detail) VALUES (?, ?, ?, ?)");
  for (const c of conflicts) if (!exists.get(c.kind, c.orderId)) insert.run(randomUUID(), c.kind, c.orderId, c.detail);
}
