import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  ORDER_TYPES,
  kitchenTickets,
  menuCategories,
  menuItems,
  orderLines,
  orders,
  payments,
  staff,
  type OrderStatus,
  type OrderType,
  type Station,
} from "@/db/schema";
import { computeBill } from "@/lib/payments/bill";
import { getTaxConfig } from "@/lib/settings/service";
import { FIRST_ORDER_NUMBER, LABEL_MAX, MAX_LINES, MAX_QUANTITY, NOTE_MAX } from "./shared";

export { FIRST_ORDER_NUMBER };

export type MenuEntry = { id: string; name: string; category: string; station: Station; price: number; available: boolean };

export type TicketLine = {
  id: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  station: Station;
  quantity: number;
  note: string | null;
  /** When it went to the kitchen (Unix ms), or null if not sent yet. */
  sentAt: number | null;
};

export type OrderDetail = {
  id: string;
  number: number;
  type: OrderType;
  status: OrderStatus;
  tableLabel: string | null;
  customerName: string | null;
  version: number;
  staffName: string;
  lines: TicketLine[];
};

/** Furthest-along kitchen state the till needs to know about: ready beats cooking beats sent. */
export type KitchenProgress = "none" | "sent" | "cooking" | "ready" | "served";

export type OrderSummary = {
  id: string;
  number: number;
  type: OrderType;
  status: OrderStatus;
  kitchen: KitchenProgress;
  /** Paid so far; more than 0 means a split bill is part paid. */
  paid: number;
  tableLabel: string | null;
  customerName: string | null;
  staffName: string;
  itemCount: number;
  total: number;
  hasUnsent: boolean;
  updatedAt: number;
};

export type SaveOrderInput = {
  orderId: string | null;
  /** The version the till last loaded; null for a new order. */
  version: number | null;
  type: OrderType;
  tableLabel: string;
  customerName: string;
  /** Lines not yet sent to the kitchen. Sent lines are locked and never sent back. */
  lines: { menuItemId: string; quantity: number; note: string }[];
  send: boolean;
};

export type SaveOrderResult = { ok: true; order: OrderDetail; sentItems: number } | { ok: false; error: string };

type Actor = { id: string; restaurantId: string };

const fail = (error: string): SaveOrderResult => ({ ok: false, error });

export function listMenu(db: Db, restaurantId: string): MenuEntry[] {
  return db
    .select({
      id: menuItems.id,
      name: menuItems.name,
      category: menuItems.category,
      station: menuItems.station,
      price: menuItems.price,
      available: menuItems.available,
    })
    .from(menuItems)
    .leftJoin(menuCategories, and(eq(menuCategories.restaurantId, menuItems.restaurantId), eq(menuCategories.name, menuItems.category)))
    .where(and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.archived, false)))
    // Categories in their set order, then dishes in theirs.
    .orderBy(sql`coalesce(${menuCategories.sortOrder}, 1000000)`, asc(menuItems.sortOrder), asc(menuItems.name))
    .all();
}

function kitchenProgress(statuses: string[]): KitchenProgress {
  if (statuses.length === 0) return "none";
  if (statuses.includes("ready")) return "ready";
  if (statuses.includes("cooking")) return "cooking";
  if (statuses.includes("new")) return "sent";
  return "served";
}

/** Held and open orders, most recently changed first. */
export function listOpenOrders(db: Db, restaurantId: string): OrderSummary[] {
  const rows = db
    .select({
      id: orders.id,
      number: orders.number,
      type: orders.type,
      status: orders.status,
      tableLabel: orders.tableLabel,
      customerName: orders.customerName,
      staffName: staff.name,
      updatedAt: orders.updatedAt,
      itemCount: sql<number>`coalesce(sum(${orderLines.quantity}), 0)`,
      subtotal: sql<number>`coalesce(sum(${orderLines.quantity} * ${orderLines.unitPrice}), 0)`,
      discount: orders.discount,
      tip: orders.tip,
      unsent: sql<number>`coalesce(sum(case when ${orderLines.ticketId} is null and ${orderLines.id} is not null then 1 else 0 end), 0)`,
      paid: sql<number>`(select coalesce(sum(${payments.amount}), 0) from ${payments} where ${payments.orderId} = ${orders.id})`,
      ticketStatuses: sql<string | null>`(select group_concat(${kitchenTickets.status}) from ${kitchenTickets} where ${kitchenTickets.orderId} = ${orders.id})`,
    })
    .from(orders)
    .innerJoin(staff, eq(orders.staffId, staff.id))
    .leftJoin(orderLines, eq(orderLines.orderId, orders.id))
    .where(and(eq(orders.restaurantId, restaurantId), inArray(orders.status, ["held", "open"])))
    .groupBy(orders.id)
    .orderBy(desc(orders.updatedAt))
    .all();

  const taxConfig = getTaxConfig(db, restaurantId);
  return rows.map(({ subtotal, discount, tip, unsent, updatedAt, ticketStatuses, ...row }) => ({
    ...row,
    kitchen: kitchenProgress(ticketStatuses ? ticketStatuses.split(",") : []),
    // Taxes depend only on the subtotal, so one combined line gives the same total.
    total: computeBill([{ unitPrice: subtotal, quantity: 1 }], { discount, tip }, taxConfig).total,
    hasUnsent: unsent > 0,
    updatedAt: updatedAt.getTime(),
  }));
}

export function getOrderDetail(db: Db, restaurantId: string, orderId: string): OrderDetail | null {
  const order = db
    .select({
      id: orders.id,
      number: orders.number,
      type: orders.type,
      status: orders.status,
      tableLabel: orders.tableLabel,
      customerName: orders.customerName,
      version: orders.version,
      staffName: staff.name,
    })
    .from(orders)
    .innerJoin(staff, eq(orders.staffId, staff.id))
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
    .get();
  if (!order) return null;

  const lines = db
    .select({
      id: orderLines.id,
      menuItemId: orderLines.menuItemId,
      name: orderLines.name,
      unitPrice: orderLines.unitPrice,
      station: orderLines.station,
      quantity: orderLines.quantity,
      note: orderLines.note,
      sentAt: kitchenTickets.createdAt,
    })
    .from(orderLines)
    .leftJoin(kitchenTickets, eq(orderLines.ticketId, kitchenTickets.id))
    .where(eq(orderLines.orderId, orderId))
    .orderBy(asc(orderLines.position))
    .all()
    .map((l) => ({ ...l, sentAt: l.sentAt ? l.sentAt.getTime() : null }));

  return { ...order, lines };
}

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");

/**
 * Creates or updates an order from the till, optionally sending its new lines
 * to the kitchen. Prices, names and stations always come from the menu in the
 * database, never from the till. Lines already sent are left untouched.
 */
export function saveOrder(db: Db, actor: Actor, input: SaveOrderInput, now = new Date()): SaveOrderResult {
  // The input comes from the browser: check every field.
  if (!input || typeof input !== "object") return fail("Something went wrong. Try again.");
  const type = input.type;
  if (!ORDER_TYPES.includes(type)) return fail("Choose dine-in, takeaway or delivery.");
  if (!Array.isArray(input.lines) || input.lines.length > MAX_LINES) return fail("This order has too many lines.");

  const lines: { menuItemId: string; quantity: number; note: string | null }[] = [];
  for (const line of input.lines) {
    const quantity = Number(line?.quantity);
    if (typeof line?.menuItemId !== "string" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return fail(`Each line needs a quantity from 1 to ${MAX_QUANTITY}.`);
    }
    lines.push({ menuItemId: line.menuItemId, quantity, note: clean(line.note, NOTE_MAX) || null });
  }
  const tableLabel = clean(input.tableLabel, LABEL_MAX) || null;
  const customerName = clean(input.customerName, LABEL_MAX) || null;
  const send = input.send === true;

  if (type === "dine_in" && !tableLabel) return fail("Enter a table for dine-in.");
  if (type === "delivery" && !customerName) return fail("Enter the customer's name and phone for delivery.");

  return db.transaction((tx) => {
    // Existing order: must belong to this restaurant and not have changed since the till loaded it.
    let existing: { id: string; version: number; status: string } | undefined;
    if (input.orderId) {
      existing = tx
        .select({ id: orders.id, version: orders.version, status: orders.status })
        .from(orders)
        .where(and(eq(orders.id, input.orderId), eq(orders.restaurantId, actor.restaurantId)))
        .get();
      if (!existing) return fail("That order no longer exists.");
      if (existing.version !== input.version) return fail("This order was changed on another till. Reopen it to see the latest.");
      if (existing.status === "paid") return fail("This order is already paid.");
      const hasPayment = tx.select({ id: payments.id }).from(payments).where(eq(payments.orderId, existing.id)).limit(1).get();
      if (hasPayment) return fail("This order has a payment, so it can't be changed. Finish taking payment first.");
    }

    // Every new line must be a current, available menu item.
    const ids = [...new Set(lines.map((l) => l.menuItemId))];
    const menu = ids.length
      ? tx.select().from(menuItems).where(and(eq(menuItems.restaurantId, actor.restaurantId), inArray(menuItems.id, ids))).all()
      : [];
    const byId = new Map(menu.map((m) => [m.id, m]));
    for (const id of ids) {
      const item = byId.get(id);
      if (!item) return fail("One of the items is no longer on the menu.");
      if (item.archived) return fail(`${item.name} is no longer on the menu.`);
      if (!item.available) return fail(`${item.name} is sold out.`);
    }

    const sentLines = existing
      ? tx
          .select({ position: orderLines.position })
          .from(orderLines)
          .where(and(eq(orderLines.orderId, existing.id), isNotNull(orderLines.ticketId)))
          .all()
      : [];
    if (sentLines.length + lines.length === 0) return fail("Add at least one item.");
    if (send && lines.length === 0) return fail("Nothing new to send to the kitchen.");

    // All checks passed: write.
    let orderId: string;
    if (existing) {
      orderId = existing.id;
      tx.update(orders)
        .set({ type, tableLabel, customerName, version: existing.version + 1, updatedAt: now })
        .where(eq(orders.id, orderId))
        .run();
      tx.delete(orderLines).where(and(eq(orderLines.orderId, orderId), isNull(orderLines.ticketId))).run();
    } else {
      const last = tx
        .select({ max: sql<number | null>`max(${orders.number})` })
        .from(orders)
        .where(eq(orders.restaurantId, actor.restaurantId))
        .get();
      const number = Math.max((last?.max ?? 0) + 1, FIRST_ORDER_NUMBER);
      orderId = randomUUID();
      tx.insert(orders)
        .values({
          id: orderId,
          restaurantId: actor.restaurantId,
          number,
          type,
          status: "held",
          tableLabel,
          customerName,
          staffId: actor.id,
          updatedAt: now,
        })
        .run();
    }

    const startPosition = sentLines.reduce((max, l) => Math.max(max, l.position + 1), 0);
    if (lines.length) {
      tx.insert(orderLines)
        .values(
          lines.map((line, i) => {
            const item = byId.get(line.menuItemId)!;
            return {
              id: randomUUID(),
              orderId,
              menuItemId: item.id,
              name: item.name,
              unitPrice: item.price,
              station: item.station,
              quantity: line.quantity,
              note: line.note,
              position: startPosition + i,
            };
          })
        )
        .run();
    }

    let sentItems = 0;
    if (send) {
      const ticketId = randomUUID();
      tx.insert(kitchenTickets).values({ id: ticketId, orderId, sentBy: actor.id, createdAt: now }).run();
      tx.update(orderLines).set({ ticketId }).where(and(eq(orderLines.orderId, orderId), isNull(orderLines.ticketId))).run();
      tx.update(orders).set({ status: "open" }).where(eq(orders.id, orderId)).run();
      sentItems = lines.reduce((n, l) => n + l.quantity, 0);
    }

    const order = getOrderDetail(tx as unknown as Db, actor.restaurantId, orderId)!;
    return { ok: true, order, sentItems } as const;
  });
}
