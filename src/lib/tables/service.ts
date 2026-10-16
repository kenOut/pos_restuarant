// The floor plan: areas and tables, each table's live status from its open
// order, arranging tables (owners and managers), and the table actions from
// the floor plan (reserve, print bill, move, change server).
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { TABLE_SHAPES, diningTables, floorAreas, orderLines, orders, staff, type Order, type StaffRole, type TableShape } from "@/db/schema";
import { listOpenOrders, type OrderSummary } from "@/lib/orders/service";
import {
  AREA_NAME_MAX,
  DEFAULT_AREAS,
  MAX_SEATS,
  RESERVED_NAME_MAX,
  TABLE_LABEL_MAX,
  TIME_PATTERN,
  clampPosition,
  firstFreeSpot,
  fits,
  type TableStatus,
} from "./shared";

export type Result = { ok: true } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const OK: Result = { ok: true };
const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");

/** Arranging the floor plan is for owners and managers. */
export const canArrange = (role: StaffRole) => role === "owner" || role === "manager";

export type FloorArea = { id: string; name: string };
export type FloorTable = {
  id: string;
  areaId: string;
  label: string;
  seats: number;
  shape: TableShape;
  x: number;
  y: number;
  status: TableStatus;
  reservedTime: string | null;
  reservedName: string | null;
  order: OrderSummary | null;
};
export type Floor = { areas: FloorArea[]; tables: FloorTable[] };

function statusOf(order: OrderSummary | null, reservedTime: string | null): TableStatus {
  if (!order) return reservedTime ? "reserved" : "free";
  if (order.billPrinted) return "waiting";
  return order.kitchen === "none" ? "ordering" : "eating";
}

/** Gives a restaurant Main hall, Terrace and Bar if it has no areas yet. */
export function ensureDefaultAreas(db: Db, restaurantId: string): void {
  if (db.select({ id: floorAreas.id }).from(floorAreas).where(eq(floorAreas.restaurantId, restaurantId)).limit(1).get()) return;
  db.insert(floorAreas)
    .values(DEFAULT_AREAS.map((name, i) => ({ id: randomUUID(), restaurantId, name, sortOrder: i })))
    .onConflictDoNothing()
    .run();
}

export function listAreas(db: Db, restaurantId: string): FloorArea[] {
  return db
    .select({ id: floorAreas.id, name: floorAreas.name })
    .from(floorAreas)
    .where(eq(floorAreas.restaurantId, restaurantId))
    .orderBy(asc(floorAreas.sortOrder), asc(floorAreas.name))
    .all();
}

/** Every area and table, with each table's status and open order. */
export function getFloor(db: Db, restaurantId: string): Floor {
  const byTable = new Map(listOpenOrders(db, restaurantId).flatMap((o) => (o.tableId ? [[o.tableId, o] as const] : [])));
  const tables = db
    .select()
    .from(diningTables)
    .where(eq(diningTables.restaurantId, restaurantId))
    .orderBy(asc(diningTables.label))
    .all()
    .map((t) => {
      const order = byTable.get(t.id) ?? null;
      return {
        id: t.id,
        areaId: t.areaId,
        label: t.label,
        seats: t.seats,
        shape: t.shape,
        x: t.x,
        y: t.y,
        status: statusOf(order, t.reservedTime),
        reservedTime: t.reservedTime,
        reservedName: t.reservedName,
        order,
      };
    });
  return { areas: listAreas(db, restaurantId), tables };
}

export type TableOption = { id: string; label: string; area: string; seats: number; orderId: string | null; reservedTime: string | null };

/** Tables for the order screen's picker, with the order already open on each (if any). */
export function listTableOptions(db: Db, restaurantId: string): TableOption[] {
  const floor = getFloor(db, restaurantId);
  // Areas in their set order, then tables by name (T2 before T10).
  return floor.areas.flatMap((area) =>
    floor.tables
      .filter((t) => t.areaId === area.id)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
      .map((t) => ({ id: t.id, label: t.label, area: area.name, seats: t.seats, orderId: t.order?.id ?? null, reservedTime: t.reservedTime }))
  );
}

export function hasTables(db: Db, restaurantId: string): boolean {
  return !!db.select({ id: diningTables.id }).from(diningTables).where(eq(diningTables.restaurantId, restaurantId)).limit(1).get();
}

// ---------- Arranging (owners and managers)

type Actor = { restaurantId: string; role: StaffRole };
const notAllowed = fail("Only owners and managers can arrange the floor plan.");

function findArea(db: Db, restaurantId: string, id: string) {
  return db.select().from(floorAreas).where(and(eq(floorAreas.id, String(id)), eq(floorAreas.restaurantId, restaurantId))).get();
}
function findTable(db: Db, restaurantId: string, id: string) {
  return db.select().from(diningTables).where(and(eq(diningTables.id, String(id)), eq(diningTables.restaurantId, restaurantId))).get();
}
function openOrderOn(db: Db, tableId: string) {
  return db
    .select({ id: orders.id, number: orders.number })
    .from(orders)
    .where(and(eq(orders.tableId, tableId), inArray(orders.status, ["held", "open"])))
    .get();
}
const tablesIn = (db: Db, areaId: string) =>
  db.select({ id: diningTables.id, x: diningTables.x, y: diningTables.y, seats: diningTables.seats }).from(diningTables).where(eq(diningTables.areaId, areaId)).all();

export function addArea(db: Db, actor: Actor, rawName: string): Result {
  if (!canArrange(actor.role)) return notAllowed;
  const name = clean(rawName, AREA_NAME_MAX);
  if (!name) return fail("Enter the area's name.");
  const areas = listAreas(db, actor.restaurantId);
  if (areas.some((a) => a.name.toLowerCase() === name.toLowerCase())) return fail(`There's already an area called ${name}.`);
  db.insert(floorAreas).values({ id: randomUUID(), restaurantId: actor.restaurantId, name, sortOrder: areas.length }).run();
  return OK;
}

export function renameArea(db: Db, actor: Actor, id: string, rawName: string): Result {
  if (!canArrange(actor.role)) return notAllowed;
  const area = findArea(db, actor.restaurantId, id);
  if (!area) return fail("That area no longer exists.");
  const name = clean(rawName, AREA_NAME_MAX);
  if (!name) return fail("Enter the area's name.");
  if (listAreas(db, actor.restaurantId).some((a) => a.id !== area.id && a.name.toLowerCase() === name.toLowerCase())) return fail(`There's already an area called ${name}.`);
  db.update(floorAreas).set({ name }).where(eq(floorAreas.id, area.id)).run();
  return OK;
}

export function deleteArea(db: Db, actor: Actor, id: string): Result {
  if (!canArrange(actor.role)) return notAllowed;
  const area = findArea(db, actor.restaurantId, id);
  if (!area) return fail("That area no longer exists.");
  if (tablesIn(db, area.id).length) return fail(`Move or remove the tables in ${area.name} first.`);
  if (listAreas(db, actor.restaurantId).length === 1) return fail("The floor plan needs at least one area.");
  db.delete(floorAreas).where(eq(floorAreas.id, area.id)).run();
  return OK;
}

export type TableInput = { areaId: string; label: string; seats: number; shape: TableShape };

function checkTableInput(db: Db, actor: Actor, input: TableInput, exceptId?: string): { ok: false; error: string } | { ok: true; label: string; seats: number; shape: TableShape; areaId: string } {
  const label = clean(input?.label, TABLE_LABEL_MAX);
  const seats = Number(input?.seats);
  if (!label) return fail("Enter the table's name or number, e.g. T7.");
  if (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS) return fail(`Seats must be from 1 to ${MAX_SEATS}.`);
  if (!TABLE_SHAPES.includes(input?.shape)) return fail("Choose round or square.");
  const area = findArea(db, actor.restaurantId, input?.areaId);
  if (!area) return fail("Choose an area.");
  const clash = db
    .select({ id: diningTables.id })
    .from(diningTables)
    .where(and(eq(diningTables.restaurantId, actor.restaurantId), eq(diningTables.label, label), exceptId ? ne(diningTables.id, exceptId) : undefined))
    .get();
  if (clash) return fail(`There's already a table called ${label}.`);
  return { ok: true, label, seats, shape: input.shape, areaId: area.id };
}

export function addTable(db: Db, actor: Actor, input: TableInput): { ok: true; id: string } | { ok: false; error: string } {
  if (!canArrange(actor.role)) return notAllowed;
  const checked = checkTableInput(db, actor, input);
  if (!checked.ok) return checked;
  const spot = firstFreeSpot(checked.seats, tablesIn(db, checked.areaId));
  if (!spot) return fail("There's no room left in this area. Move some tables or use another area.");
  const id = randomUUID();
  const { label, seats, shape, areaId } = checked;
  db.insert(diningTables).values({ id, restaurantId: actor.restaurantId, areaId, label, seats, shape, ...spot }).run();
  return { ok: true, id };
}

export function updateTable(db: Db, actor: Actor, id: string, input: TableInput): Result {
  if (!canArrange(actor.role)) return notAllowed;
  const table = findTable(db, actor.restaurantId, id);
  if (!table) return fail("That table no longer exists.");
  const checked = checkTableInput(db, actor, input, table.id);
  if (!checked.ok) return checked;
  const others = tablesIn(db, checked.areaId).filter((t) => t.id !== table.id);
  // Keep its place if it still fits there; otherwise find it a free spot.
  let spot: { x: number; y: number } | null = clampPosition(table.x, table.y, checked.seats);
  if (!fits({ id: table.id, ...spot, seats: checked.seats }, others)) spot = firstFreeSpot(checked.seats, others);
  if (!spot) return fail("There's no room for a table that size in this area.");
  const { label, seats, shape, areaId } = checked;
  db.transaction((tx) => {
    tx.update(diningTables).set({ label, seats, shape, areaId, ...spot }).where(eq(diningTables.id, table.id)).run();
    // An open order follows its table's new name.
    tx.update(orders).set({ tableLabel: label }).where(and(eq(orders.tableId, table.id), inArray(orders.status, ["held", "open"]))).run();
  });
  return OK;
}

/** Moves a table on the floor plan (drag or arrow keys). */
export function placeTable(db: Db, actor: Actor, id: string, x: number, y: number): Result {
  if (!canArrange(actor.role)) return notAllowed;
  const table = findTable(db, actor.restaurantId, id);
  if (!table) return fail("That table no longer exists.");
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return fail("Something went wrong. Try again.");
  const spot = clampPosition(Number(x), Number(y), table.seats);
  if (!fits({ id: table.id, ...spot, seats: table.seats }, tablesIn(db, table.areaId))) return fail("There's another table there.");
  db.update(diningTables).set(spot).where(eq(diningTables.id, table.id)).run();
  return OK;
}

export function deleteTable(db: Db, actor: Actor, id: string): Result {
  if (!canArrange(actor.role)) return notAllowed;
  const table = findTable(db, actor.restaurantId, id);
  if (!table) return fail("That table no longer exists.");
  const open = openOrderOn(db, table.id);
  if (open) return fail(`${table.label} has order #${open.number} open. Finish or move it first.`);
  // Past orders keep the table's name; their link to it is cleared.
  db.delete(diningTables).where(eq(diningTables.id, table.id)).run();
  return OK;
}

// ---------- Table actions (front of house)

export function reserveTable(db: Db, restaurantId: string, id: string, rawTime: string, rawName: string): Result {
  const table = findTable(db, restaurantId, id);
  if (!table) return fail("That table no longer exists.");
  const time = clean(rawTime, 5);
  if (!TIME_PATTERN.test(time)) return fail("Enter the time as HH:MM, e.g. 19:30.");
  if (openOrderOn(db, table.id)) return fail(`${table.label} has an order open.`);
  db.update(diningTables).set({ reservedTime: time, reservedName: clean(rawName, RESERVED_NAME_MAX) || null }).where(eq(diningTables.id, table.id)).run();
  return OK;
}

export function clearReservation(db: Db, restaurantId: string, id: string): Result {
  const table = findTable(db, restaurantId, id);
  if (!table) return fail("That table no longer exists.");
  db.update(diningTables).set({ reservedTime: null, reservedName: null }).where(eq(diningTables.id, table.id)).run();
  return OK;
}

function findOpenOrder(db: Db, restaurantId: string, orderId: string): { order: Order } | { error: string } {
  const order = db.select().from(orders).where(and(eq(orders.id, String(orderId)), eq(orders.restaurantId, restaurantId))).get();
  if (!order) return { error: "That order no longer exists." };
  if (order.status === "paid") return { error: "That order is already paid." };
  return { order };
}

/** Printing the bill puts the table in "waiting to pay". */
export function markBillPrinted(db: Db, restaurantId: string, orderId: string, now = new Date()): Result {
  const found = findOpenOrder(db, restaurantId, orderId);
  if ("error" in found) return fail(found.error);
  if (!db.select({ id: orderLines.id }).from(orderLines).where(eq(orderLines.orderId, found.order.id)).limit(1).get()) return fail("This order has nothing on it yet.");
  db.update(orders).set({ billPrintedAt: now }).where(eq(orders.id, found.order.id)).run();
  return OK;
}

/** Moves an open order to a free table (guests changed tables). */
export function moveOrderToTable(db: Db, restaurantId: string, orderId: string, tableId: string, now = new Date()): Result {
  const found = findOpenOrder(db, restaurantId, orderId);
  if ("error" in found) return fail(found.error);
  const table = findTable(db, restaurantId, tableId);
  if (!table) return fail("Choose a table to move to.");
  if (table.id === found.order.tableId) return fail(`The order is already at ${table.label}.`);
  if (openOrderOn(db, table.id)) return fail(`${table.label} already has an order open.`);
  try {
    db.transaction((tx) => {
      tx.update(orders)
        .set({ type: "dine_in", tableId: table.id, tableLabel: table.label, version: found.order.version + 1, updatedAt: now })
        .where(eq(orders.id, found.order.id))
        .run();
      tx.update(diningTables).set({ reservedTime: null, reservedName: null }).where(eq(diningTables.id, table.id)).run();
    });
  } catch (error) {
    if (String((error as Error).message).includes("UNIQUE")) return fail(`${table.label} already has an order open.`);
    throw error;
  }
  return OK;
}

export type Server = { id: string; name: string };

/** Front-of-house staff who can look after a table. */
export function listServers(db: Db, restaurantId: string): Server[] {
  return db
    .select({ id: staff.id, name: staff.name })
    .from(staff)
    .where(and(eq(staff.restaurantId, restaurantId), eq(staff.active, true), ne(staff.role, "kitchen")))
    .orderBy(asc(staff.name))
    .all();
}

export function changeServer(db: Db, restaurantId: string, orderId: string, staffId: string, now = new Date()): Result {
  const found = findOpenOrder(db, restaurantId, orderId);
  if ("error" in found) return fail(found.error);
  if (!listServers(db, restaurantId).some((s) => s.id === staffId)) return fail("Choose someone from the front of house.");
  db.update(orders).set({ staffId, version: found.order.version + 1, updatedAt: now }).where(eq(orders.id, found.order.id)).run();
  return OK;
}
