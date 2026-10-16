import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "@/db/client";
import { diningTables, kitchenTickets, menuItems, orderLines } from "@/db/schema";
import { DEMO_RESTAURANT_ID, seedDemoData } from "@/db/seed";
import { cedis } from "@/lib/money";
import { FIRST_ORDER_NUMBER, getOrderDetail, listMenu, listOpenOrders, saveOrder, type SaveOrderInput } from "./service";

const EFUA = { id: "staff-efua", restaurantId: DEMO_RESTAURANT_ID };
let db: Db;

const input = (overrides: Partial<SaveOrderInput> = {}): SaveOrderInput => ({
  orderId: null,
  version: null,
  type: "takeaway",
  tableLabel: "",
  customerName: "",
  lines: [
    { menuItemId: "jollof-chicken", quantity: 2, note: "" },
    { menuItemId: "banku-tilapia", quantity: 1, note: " extra  pepper " },
    { menuItemId: "sobolo", quantity: 2, note: "" },
  ],
  send: false,
  ...overrides,
});

function ok(result: ReturnType<typeof saveOrder>) {
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result;
}

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDemoData(db);
});

describe("menu", () => {
  it("seeds the deck's 16 items with one sold out", () => {
    const menu = listMenu(db, DEMO_RESTAURANT_ID);
    expect(menu).toHaveLength(16);
    expect(menu.filter((m) => !m.available).map((m) => m.name)).toEqual(["Pineapple sorbet"]);
  });
});

describe("saveOrder: hold", () => {
  it("saves a held order with prices from the menu, numbered from 1001", () => {
    const { order } = ok(saveOrder(db, EFUA, input()));
    expect(order.number).toBe(FIRST_ORDER_NUMBER);
    expect(order.status).toBe("held");
    expect(order.lines.map((l) => [l.name, l.unitPrice, l.station, l.quantity])).toEqual([
      ["Jollof rice with chicken", cedis(90), "Kitchen", 2],
      ["Banku and tilapia", cedis(120), "Grill", 1],
      ["Sobolo", cedis(20), "Bar", 2],
    ]);
    expect(order.lines[1].note).toBe("extra pepper");
    expect(order.lines.every((l) => l.sentAt === null)).toBe(true);
  });

  it("totals open orders with the 2026 taxes (the deck's GH₵ 408.00)", () => {
    ok(saveOrder(db, EFUA, input()));
    const [summary] = listOpenOrders(db, DEMO_RESTAURANT_ID);
    expect(summary).toMatchObject({ itemCount: 5, total: cedis(408), hasUnsent: true, staffName: "Efua M." });
  });

  it("numbers orders one after another", () => {
    const a = ok(saveOrder(db, EFUA, input())).order.number;
    const b = ok(saveOrder(db, EFUA, input())).order.number;
    expect(b).toBe(a + 1);
  });
});

describe("saveOrder: send to kitchen", () => {
  it("puts every unsent line on one kitchen ticket and opens the order", () => {
    const result = ok(saveOrder(db, EFUA, input({ send: true })));
    expect(result.sentItems).toBe(5);
    expect(result.order.status).toBe("open");
    expect(result.order.lines.every((l) => l.sentAt !== null)).toBe(true);
    expect(db.select().from(kitchenTickets).all()).toHaveLength(1);
  });

  it("supports hold and fire: later lines go on a second ticket, sent lines stay locked", () => {
    const first = ok(saveOrder(db, EFUA, input({ send: true, lines: [{ menuItemId: "kelewele", quantity: 1, note: "" }] }))).order;

    // Add mains and hold them…
    const held = ok(
      saveOrder(db, EFUA, input({ orderId: first.id, version: first.version, lines: [{ menuItemId: "waakye", quantity: 2, note: "" }] }))
    ).order;
    expect(held.status).toBe("open");
    expect(held.lines.map((l) => [l.name, l.sentAt !== null])).toEqual([
      ["Kelewele", true],
      ["Waakye special", false],
    ]);

    // …then fire them.
    const fired = ok(saveOrder(db, EFUA, input({ orderId: held.id, version: held.version, send: true, lines: [{ menuItemId: "waakye", quantity: 2, note: "" }] })));
    expect(fired.sentItems).toBe(2);
    expect(db.select().from(kitchenTickets).all()).toHaveLength(2);
    expect(fired.order.lines.map((l) => l.name)).toEqual(["Kelewele", "Waakye special"]);
  });

  it("never changes or removes sent lines, whatever the till sends", () => {
    const first = ok(saveOrder(db, EFUA, input({ send: true }))).order;
    const after = ok(saveOrder(db, EFUA, input({ orderId: first.id, version: first.version, lines: [] }))).order;
    expect(after.lines).toHaveLength(3);
    expect(after.lines.map((l) => l.quantity)).toEqual([2, 1, 2]);
  });

  it("refuses to send when nothing is new", () => {
    const first = ok(saveOrder(db, EFUA, input({ send: true }))).order;
    expect(saveOrder(db, EFUA, input({ orderId: first.id, version: first.version, lines: [], send: true }))).toEqual({
      ok: false,
      error: "Nothing new to send to the kitchen.",
    });
  });
});

describe("saveOrder: checks", () => {
  it("refuses sold-out and unknown items", () => {
    expect(saveOrder(db, EFUA, input({ lines: [{ menuItemId: "pineapple-sorbet", quantity: 1, note: "" }] }))).toEqual({
      ok: false,
      error: "Pineapple sorbet is sold out.",
    });
    expect(saveOrder(db, EFUA, input({ lines: [{ menuItemId: "lobster", quantity: 1, note: "" }] }))).toMatchObject({ ok: false });
  });

  it("refuses an empty order and bad quantities", () => {
    expect(saveOrder(db, EFUA, input({ lines: [] }))).toEqual({ ok: false, error: "Add at least one item." });
    for (const quantity of [0, -1, 1.5, 100]) {
      expect(saveOrder(db, EFUA, input({ lines: [{ menuItemId: "sobolo", quantity, note: "" }] })).ok).toBe(false);
    }
  });

  it("needs a table for dine-in and a name for delivery", () => {
    expect(saveOrder(db, EFUA, input({ type: "dine_in" }))).toEqual({ ok: false, error: "Choose a table for dine-in." });
    // With a floor plan, a typed table name isn't enough: it must be one of the tables.
    expect(saveOrder(db, EFUA, input({ type: "dine_in", tableLabel: "T7" }))).toEqual({ ok: false, error: "Choose a table for dine-in." });
    const t7 = db.select({ id: diningTables.id }).from(diningTables).where(eq(diningTables.label, "T7")).get()!.id;
    const saved = saveOrder(db, EFUA, input({ type: "dine_in", tableId: t7, guests: 3 }));
    expect(saved.ok && [saved.order.tableLabel, saved.order.guests]).toEqual(["T7", 3]);
    expect(saveOrder(db, EFUA, input({ type: "delivery" })).ok).toBe(false);
  });

  it("ignores any price the till might send", () => {
    const tampered = input({ lines: [{ menuItemId: "guinea-fowl", quantity: 1, note: "", unitPrice: 1 } as never] });
    const { order } = ok(saveOrder(db, EFUA, tampered));
    expect(order.lines[0].unitPrice).toBe(cedis(140));
  });

  it("refuses a save from a till that has an out-of-date copy", () => {
    const first = ok(saveOrder(db, EFUA, input())).order;
    ok(saveOrder(db, EFUA, input({ orderId: first.id, version: first.version })));
    expect(saveOrder(db, EFUA, input({ orderId: first.id, version: first.version }))).toEqual({
      ok: false,
      error: "This order was changed on another till. Reopen it to see the latest.",
    });
  });

  it("keeps old orders' names and prices when the menu changes", () => {
    const { order } = ok(saveOrder(db, EFUA, input()));
    db.update(menuItems).set({ name: "Jollof (new)", price: cedis(95) }).where(eq(menuItems.id, "jollof-chicken")).run();
    const reloaded = getOrderDetail(db, DEMO_RESTAURANT_ID, order.id)!;
    expect(reloaded.lines[0]).toMatchObject({ name: "Jollof rice with chicken", unitPrice: cedis(90) });
  });

  it("can't see or change another restaurant's orders", () => {
    const { order } = ok(saveOrder(db, EFUA, input()));
    const outsider = { id: "staff-efua", restaurantId: "elsewhere" };
    expect(getOrderDetail(db, "elsewhere", order.id)).toBeNull();
    expect(saveOrder(db, outsider, input({ orderId: order.id, version: order.version }))).toEqual({
      ok: false,
      error: "That order no longer exists.",
    });
    expect(db.select().from(orderLines).all()).toHaveLength(3);
  });
});
