import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { kitchenTickets, orderLines, orders, staff, type OrderType, type Station, type TicketStatus } from "@/db/schema";
import { ticketDestination } from "./shared";

export { ticketDestination };

export type KitchenLine = { id: string; quantity: number; name: string; note: string | null; station: Station };

export type KitchenTicket = {
  id: string;
  orderNumber: number;
  orderType: OrderType;
  tableLabel: string | null;
  customerName: string | null;
  staffName: string;
  status: Extract<TicketStatus, "new" | "cooking">;
  /** When it was sent (Unix ms); the timer counts from here. */
  sentAt: number;
  lines: KitchenLine[];
};

export type ReadyTicket = {
  id: string;
  orderNumber: number;
  orderType: OrderType;
  tableLabel: string | null;
  customerName: string | null;
  readyAt: number;
};

export type KitchenBoard = { active: KitchenTicket[]; ready: ReadyTicket[]; canRecall: boolean };

export type KitchenActionResult = { ok: true; orderNumber: number; label: string } | { ok: false; error: string };

const ticketColumns = {
  id: kitchenTickets.id,
  status: kitchenTickets.status,
  createdAt: kitchenTickets.createdAt,
  readyAt: kitchenTickets.readyAt,
  orderNumber: orders.number,
  orderType: orders.type,
  tableLabel: orders.tableLabel,
  customerName: orders.customerName,
  staffName: staff.name,
};

/** Tickets to cook (oldest first) and tickets waiting to be served. */
export function getKitchenBoard(db: Db, restaurantId: string): KitchenBoard {
  const tickets = db
    .select(ticketColumns)
    .from(kitchenTickets)
    .innerJoin(orders, eq(kitchenTickets.orderId, orders.id))
    .innerJoin(staff, eq(orders.staffId, staff.id))
    .where(and(eq(orders.restaurantId, restaurantId), inArray(kitchenTickets.status, ["new", "cooking", "ready"])))
    .orderBy(asc(kitchenTickets.createdAt))
    .all();

  const activeIds = tickets.filter((t) => t.status !== "ready").map((t) => t.id);
  const lines = activeIds.length
    ? db
        .select({
          id: orderLines.id,
          ticketId: orderLines.ticketId,
          quantity: orderLines.quantity,
          name: orderLines.name,
          note: orderLines.note,
          station: orderLines.station,
        })
        .from(orderLines)
        .where(inArray(orderLines.ticketId, activeIds))
        .orderBy(asc(orderLines.position))
        .all()
    : [];

  const active: KitchenTicket[] = tickets
    .filter((t) => t.status === "new" || t.status === "cooking")
    .map((t) => ({
      id: t.id,
      orderNumber: t.orderNumber,
      orderType: t.orderType,
      tableLabel: t.tableLabel,
      customerName: t.customerName,
      staffName: t.staffName,
      status: t.status as KitchenTicket["status"],
      sentAt: t.createdAt.getTime(),
      lines: lines
        .filter((l) => l.ticketId === t.id)
        .map((l) => ({ id: l.id, quantity: l.quantity, name: l.name, note: l.note, station: l.station })),
    }));

  const ready: ReadyTicket[] = tickets
    .filter((t) => t.status === "ready" && t.readyAt)
    .sort((a, b) => a.readyAt!.getTime() - b.readyAt!.getTime())
    .map((t) => ({
      id: t.id,
      orderNumber: t.orderNumber,
      orderType: t.orderType,
      tableLabel: t.tableLabel,
      customerName: t.customerName,
      readyAt: t.readyAt!.getTime(),
    }));

  return { active, ready, canRecall: lastBumped(db, restaurantId) !== undefined };
}

/** Tickets still being cooked, for the badge on the Kitchen tab. */
export function countActiveTickets(db: Db, restaurantId: string): number {
  return db
    .select({ id: kitchenTickets.id })
    .from(kitchenTickets)
    .innerJoin(orders, eq(kitchenTickets.orderId, orders.id))
    .where(and(eq(orders.restaurantId, restaurantId), inArray(kitchenTickets.status, ["new", "cooking"])))
    .all().length;
}

function findTicket(db: Db, restaurantId: string, ticketId: string) {
  return db
    .select(ticketColumns)
    .from(kitchenTickets)
    .innerJoin(orders, eq(kitchenTickets.orderId, orders.id))
    .innerJoin(staff, eq(orders.staffId, staff.id))
    .where(and(eq(kitchenTickets.id, ticketId), eq(orders.restaurantId, restaurantId)))
    .get();
}

function lastBumped(db: Db, restaurantId: string) {
  return db
    .select(ticketColumns)
    .from(kitchenTickets)
    .innerJoin(orders, eq(kitchenTickets.orderId, orders.id))
    .innerJoin(staff, eq(orders.staffId, staff.id))
    .where(and(eq(orders.restaurantId, restaurantId), inArray(kitchenTickets.status, ["ready", "served"]), isNotNull(kitchenTickets.readyAt)))
    .orderBy(desc(kitchenTickets.readyAt))
    .limit(1)
    .get();
}

type Ticket = NonNullable<ReturnType<typeof findTicket>>;
const done = (t: Ticket): KitchenActionResult => ({ ok: true, orderNumber: t.orderNumber, label: ticketDestination(t) });
const gone: KitchenActionResult = { ok: false, error: "That ticket is no longer on the board." };

/** New → cooking. */
export function startTicket(db: Db, restaurantId: string, ticketId: string, now = new Date()): KitchenActionResult {
  const t = findTicket(db, restaurantId, ticketId);
  if (!t || t.status !== "new") return gone;
  db.update(kitchenTickets).set({ status: "cooking", startedAt: now }).where(eq(kitchenTickets.id, t.id)).run();
  return done(t);
}

/** New or cooking → ready to serve. */
export function bumpTicket(db: Db, restaurantId: string, ticketId: string, now = new Date()): KitchenActionResult {
  const t = findTicket(db, restaurantId, ticketId);
  if (!t || (t.status !== "new" && t.status !== "cooking")) return gone;
  db.update(kitchenTickets).set({ status: "ready", readyAt: now }).where(eq(kitchenTickets.id, t.id)).run();
  return done(t);
}

/** Ready → served (taken to the guest). */
export function serveTicket(db: Db, restaurantId: string, ticketId: string, now = new Date()): KitchenActionResult {
  const t = findTicket(db, restaurantId, ticketId);
  if (!t || t.status !== "ready") return gone;
  db.update(kitchenTickets).set({ status: "served", servedAt: now }).where(eq(kitchenTickets.id, t.id)).run();
  return done(t);
}

/** Brings the most recently bumped ticket back onto the board as cooking. */
export function recallLastTicket(db: Db, restaurantId: string): KitchenActionResult {
  const t = lastBumped(db, restaurantId);
  if (!t) return { ok: false, error: "Nothing to recall." };
  db.update(kitchenTickets).set({ status: "cooking", readyAt: null, servedAt: null }).where(eq(kitchenTickets.id, t.id)).run();
  return done(t);
}
