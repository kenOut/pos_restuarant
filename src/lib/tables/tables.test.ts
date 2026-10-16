import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "@/db/client";
import { diningTables, floorAreas, orders } from "@/db/schema";
import { DEMO_RESTAURANT_ID, seedDemoData } from "@/db/seed";
import { bumpTicket, getKitchenBoard } from "@/lib/kitchen/service";
import { saveOrder, type SaveOrderInput } from "@/lib/orders/service";
import { getPaymentView, takePayment } from "@/lib/payments/service";
import {
  addArea,
  addTable,
  changeServer,
  clearReservation,
  deleteArea,
  deleteTable,
  ensureDefaultAreas,
  getFloor,
  listTableOptions,
  markBillPrinted,
  moveOrderToTable,
  placeTable,
  reserveTable,
  updateTable,
} from "./service";
import { clampPosition, firstFreeSpot, fits, tableSize } from "./shared";

const R = DEMO_RESTAURANT_ID;
const EFUA = { id: "staff-efua", restaurantId: R, role: "cashier" as const };
const KWAME = { id: "staff-kwame", restaurantId: R, role: "manager" as const };
let db: Db;

const tableId = (label: string) => db.select({ id: diningTables.id }).from(diningTables).where(eq(diningTables.label, label)).get()!.id;
const status = (label: string) => getFloor(db, R).tables.find((t) => t.label === label)!.status;
/** Pays the whole balance in cash. */
const payAll = (orderId: string) => takePayment(db, EFUA, orderId, { method: "card", amount: getPaymentView(db, R, orderId)!.balance });
const areaId = (name: string) => db.select({ id: floorAreas.id }).from(floorAreas).where(eq(floorAreas.name, name)).get()!.id;

function order(label: string, overrides: Partial<SaveOrderInput> = {}) {
  const result = saveOrder(db, EFUA, {
    orderId: null,
    version: null,
    type: "dine_in",
    tableId: tableId(label),
    tableLabel: "",
    guests: 2,
    customerName: "",
    lines: [{ menuItemId: "jollof-chicken", quantity: 1, note: "" }],
    send: false,
    ...overrides,
  });
  if (!result.ok) throw new Error(result.error);
  return result.order;
}

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDemoData(db);
});

describe("floor plan grid", () => {
  it("sizes tables by seats and keeps them on the grid", () => {
    expect([tableSize(2), tableSize(6), tableSize(8)]).toEqual([{ w: 2, h: 2 }, { w: 3, h: 2 }, { w: 4, h: 2 }]);
    expect(clampPosition(-3, 40, 4)).toEqual({ x: 0, y: 12 });
    expect(clampPosition(30, 2.4, 8)).toEqual({ x: 20, y: 2 });
  });

  it("spots overlaps and finds the first free spot", () => {
    const others = [{ id: "a", x: 0, y: 0, seats: 4 }];
    expect(fits({ id: "b", x: 1, y: 1, seats: 2 }, others)).toBe(false);
    expect(fits({ id: "b", x: 2, y: 0, seats: 2 }, others)).toBe(true);
    expect(firstFreeSpot(2, others)).toEqual({ x: 2, y: 0 });
  });
});

describe("table status", () => {
  it("goes free → ordering → eating → waiting to pay → free", () => {
    expect(status("T4")).toBe("free");
    const held = order("T4");
    expect(status("T4")).toBe("ordering");
    const floorT4 = getFloor(db, R).tables.find((t) => t.label === "T4")!;
    expect([floorT4.order?.number, floorT4.order?.guests, floorT4.order?.staffName]).toEqual([held.number, 2, "Efua M."]);

    const sent = saveOrder(db, EFUA, { orderId: held.id, version: held.version, type: "dine_in", tableId: tableId("T4"), tableLabel: "", guests: 2, customerName: "", lines: [{ menuItemId: "jollof-chicken", quantity: 1, note: "" }], send: true });
    if (!sent.ok) throw new Error(sent.error);
    expect(status("T4")).toBe("eating");
    // Still eating once the food is ready.
    bumpTicket(db, R, getKitchenBoard(db, R).active[0].id);
    expect(status("T4")).toBe("eating");

    expect(markBillPrinted(db, R, held.id)).toEqual({ ok: true });
    expect(status("T4")).toBe("waiting");

    expect(payAll(held.id).ok).toBe(true);
    expect(status("T4")).toBe("free");
  });

  it("clears 'waiting to pay' when the order changes after the bill was printed", () => {
    const held = order("T2");
    markBillPrinted(db, R, held.id);
    expect(status("T2")).toBe("waiting");
    saveOrder(db, EFUA, { orderId: held.id, version: held.version, type: "dine_in", tableId: tableId("T2"), tableLabel: "", guests: 2, customerName: "", lines: [{ menuItemId: "jollof-chicken", quantity: 2, note: "" }], send: false });
    expect(status("T2")).toBe("ordering");
  });

  it("shows reservations, which seating the guests uses up", () => {
    expect(reserveTable(db, R, tableId("T9"), "19:30", "Mensah, 4")).toEqual({ ok: true });
    const t9 = getFloor(db, R).tables.find((t) => t.label === "T9")!;
    expect([t9.status, t9.reservedTime, t9.reservedName]).toEqual(["reserved", "19:30", "Mensah, 4"]);
    expect(reserveTable(db, R, tableId("T9"), "7pm", "").ok).toBe(false);
    order("T9");
    expect(getFloor(db, R).tables.find((t) => t.label === "T9")!.reservedTime).toBeNull();
    expect(reserveTable(db, R, tableId("T9"), "20:00", "").ok).toBe(false); // has an order open

    reserveTable(db, R, tableId("T10"), "18:00", "");
    expect(clearReservation(db, R, tableId("T10"))).toEqual({ ok: true });
    expect(status("T10")).toBe("free");
  });
});

describe("one open order per table", () => {
  it("refuses a second order on a busy table, but lets the same order be saved again", () => {
    const first = order("T7");
    expect(saveOrder(db, EFUA, { orderId: null, version: null, type: "dine_in", tableId: tableId("T7"), tableLabel: "", customerName: "", lines: [{ menuItemId: "sobolo", quantity: 1, note: "" }], send: false })).toEqual({
      ok: false,
      error: `T7 already has order #${first.number} open. Open that order to add to it.`,
    });
    const again = saveOrder(db, EFUA, { orderId: first.id, version: first.version, type: "dine_in", tableId: tableId("T7"), tableLabel: "", customerName: "", lines: [{ menuItemId: "sobolo", quantity: 1, note: "" }], send: false });
    expect(again.ok).toBe(true);
  });

  it("is also enforced by the database", () => {
    order("T1");
    expect(() =>
      db.insert(orders).values({ id: "sneaky", restaurantId: R, number: 9999, type: "dine_in", status: "held", tableId: tableId("T1"), tableLabel: "T1", staffId: "staff-efua", updatedAt: new Date() }).run()
    ).toThrow(/UNIQUE/);
  });

  it("refuses tables from another restaurant", () => {
    const other = openDatabase(":memory:");
    seedDemoData(other, { restaurantId: "other", name: "Other" });
    const foreign = other.select({ id: diningTables.id }).from(diningTables).get()!.id;
    expect(saveOrder(db, EFUA, { orderId: null, version: null, type: "dine_in", tableId: foreign, tableLabel: "", customerName: "", lines: [{ menuItemId: "sobolo", quantity: 1, note: "" }], send: false })).toEqual({ ok: false, error: "Choose a table for dine-in." });
  });

  it("falls back to a typed table name when there's no floor plan", () => {
    db.delete(diningTables).run();
    const result = saveOrder(db, EFUA, { orderId: null, version: null, type: "dine_in", tableLabel: "Garden 2", customerName: "", lines: [{ menuItemId: "sobolo", quantity: 1, note: "" }], send: false });
    expect(result.ok && result.order.tableLabel).toBe("Garden 2");
  });

  it("lists tables for the order screen with what's open on them", () => {
    const opened = order("T3");
    const options = listTableOptions(db, R);
    expect(options.slice(0, 3).map((o) => o.label)).toEqual(["T1", "T2", "T3"]);
    expect(options.find((o) => o.label === "T3")).toMatchObject({ area: "Main hall", orderId: opened.id });
    expect(options.at(-1)?.label).toBe("B4");
  });
});

describe("table panel actions", () => {
  it("moves an order to a free table only", () => {
    const opened = order("T5");
    order("T6");
    expect(moveOrderToTable(db, R, opened.id, tableId("T6"))).toEqual({ ok: false, error: "T6 already has an order open." });
    reserveTable(db, R, tableId("T8"), "20:00", "");
    expect(moveOrderToTable(db, R, opened.id, tableId("T8"))).toEqual({ ok: true });
    expect([status("T5"), status("T8")]).toEqual(["free", "ordering"]);
    const moved = db.select({ label: orders.tableLabel, version: orders.version }).from(orders).where(eq(orders.id, opened.id)).get();
    expect(moved).toEqual({ label: "T8", version: opened.version + 1 });
    expect(getFloor(db, R).tables.find((t) => t.label === "T8")!.reservedTime).toBeNull();
  });

  it("changes the server to someone from the front of house", () => {
    const opened = order("T3");
    expect(changeServer(db, R, opened.id, "staff-yaw").ok).toBe(false); // kitchen
    expect(changeServer(db, R, opened.id, "staff-kofi")).toEqual({ ok: true });
    expect(getFloor(db, R).tables.find((t) => t.label === "T3")!.order?.staffName).toBe("Kofi A.");
  });

  it("only prints a bill for an unpaid order with something on it", () => {
    expect(markBillPrinted(db, R, "nope").ok).toBe(false);
    expect(markBillPrinted(db, R, order("T1").id)).toEqual({ ok: true });
  });
});

describe("arranging the floor plan", () => {
  it("is for owners and managers", () => {
    expect(addArea(db, EFUA, "Garden")).toEqual({ ok: false, error: "Only owners and managers can arrange the floor plan." });
    expect(placeTable(db, EFUA, tableId("T1"), 20, 10).ok).toBe(false);
  });

  it("adds, renames and removes areas", () => {
    expect(addArea(db, KWAME, "Garden")).toEqual({ ok: true });
    expect(addArea(db, KWAME, "garden").ok).toBe(false);
    expect(deleteArea(db, KWAME, areaId("Bar"))).toEqual({ ok: false, error: "Move or remove the tables in Bar first." });
    expect(deleteArea(db, KWAME, areaId("Garden"))).toEqual({ ok: true });
    expect(getFloor(db, R).areas.map((a) => a.name)).toEqual(["Main hall", "Terrace", "Bar"]);
  });

  it("adds tables in a free spot and refuses duplicate names", () => {
    const added = addTable(db, KWAME, { areaId: areaId("Bar"), label: "B5", seats: 2, shape: "round" });
    expect(added.ok).toBe(true);
    const b5 = getFloor(db, R).tables.find((t) => t.label === "B5")!;
    expect(fits({ id: b5.id, x: b5.x, y: b5.y, seats: 2 }, getFloor(db, R).tables.filter((t) => t.areaId === b5.areaId))).toBe(true);
    expect(addTable(db, KWAME, { areaId: areaId("Bar"), label: "B5", seats: 2, shape: "round" })).toEqual({ ok: false, error: "There's already a table called B5." });
    expect(addTable(db, KWAME, { areaId: areaId("Bar"), label: "B6", seats: 0, shape: "round" }).ok).toBe(false);
  });

  it("places tables without overlapping others", () => {
    expect(placeTable(db, KWAME, tableId("T1"), 20, 10)).toEqual({ ok: true });
    expect(placeTable(db, KWAME, tableId("T2"), 13, 1)).toEqual({ ok: false, error: "There's another table there." }); // T4 is there
    expect(placeTable(db, KWAME, tableId("T2"), 99, 99)).toEqual({ ok: true }); // clamped to the corner
    const t2 = getFloor(db, R).tables.find((t) => t.label === "T2")!;
    expect([t2.x, t2.y]).toEqual([22, 12]);
  });

  it("renames a table, and its open order follows", () => {
    const opened = order("T3");
    expect(updateTable(db, KWAME, tableId("T3"), { areaId: areaId("Main hall"), label: "Window", seats: 4, shape: "round" })).toEqual({ ok: true });
    expect(db.select({ label: orders.tableLabel }).from(orders).where(eq(orders.id, opened.id)).get()?.label).toBe("Window");
  });

  it("won't remove a table with an order open; past orders keep its name", () => {
    const opened = order("T6");
    expect(deleteTable(db, KWAME, tableId("T6")).ok).toBe(false);
    expect(payAll(opened.id).ok).toBe(true);
    expect(deleteTable(db, KWAME, tableId("T6"))).toEqual({ ok: true });
    expect(db.select({ label: orders.tableLabel, tableId: orders.tableId }).from(orders).where(eq(orders.id, opened.id)).get()).toEqual({ label: "T6", tableId: null });
  });

  it("gives a new restaurant Main hall, Terrace and Bar once", () => {
    const fresh = openDatabase(":memory:");
    seedDemoData(fresh, { restaurantId: "x", name: "X" });
    fresh.delete(diningTables).run();
    fresh.delete(floorAreas).run();
    ensureDefaultAreas(fresh, "x");
    ensureDefaultAreas(fresh, "x");
    expect(getFloor(fresh, "x").areas.map((a) => a.name)).toEqual(["Main hall", "Terrace", "Bar"]);
  });
});
