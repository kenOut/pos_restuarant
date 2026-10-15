import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "@/db/client";
import { kitchenTickets, menuItems, orders, payments } from "@/db/schema";
import { DEMO_RESTAURANT_ID, seedDemoData } from "@/db/seed";
import { getKitchenBoard } from "@/lib/kitchen/service";
import { cedis } from "@/lib/money";
import { listOpenOrders, saveOrder } from "@/lib/orders/service";
import { getPaymentView, setDiscount, setTip, takePayment } from "./service";

const R = DEMO_RESTAURANT_ID;
const EFUA = { id: "staff-efua", restaurantId: R, role: "cashier" as const };
const KWAME = { id: "staff-kwame", restaurantId: R, role: "manager" as const };
let db: Db;

/** The deck's order: 2× Jollof, 1× Banku and tilapia, 2× Sobolo = 340.00 + tax = 408.00. */
function deckOrder(send = true) {
  const result = saveOrder(db, EFUA, {
    orderId: null,
    version: null,
    type: "takeaway",
    tableLabel: "",
    customerName: "",
    lines: [
      { menuItemId: "jollof-chicken", quantity: 2, note: "" },
      { menuItemId: "banku-tilapia", quantity: 1, note: "" },
      { menuItemId: "sobolo", quantity: 2, note: "" },
    ],
    send,
  });
  if (!result.ok) throw new Error(result.error);
  return result.order.id;
}
const view = (id: string) => getPaymentView(db, R, id)!;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDemoData(db);
});

describe("takePayment", () => {
  it("closes the order when paid in full, and freezes its totals", () => {
    const id = deckOrder();
    const result = takePayment(db, EFUA, id, { method: "card", amount: cedis(408) });
    expect(result).toMatchObject({ ok: true, closed: true, balance: 0 });
    const v = view(id);
    expect(v.order.status).toBe("paid");
    expect(v.bill.total).toBe(cedis(408));
    expect(listOpenOrders(db, R)).toHaveLength(0);

    // A later menu price change doesn't touch the paid order.
    db.update(menuItems).set({ price: cedis(999) }).where(eq(menuItems.id, "sobolo")).run();
    expect(view(id).bill.total).toBe(cedis(408));
    const row = db.select().from(orders).where(eq(orders.id, id)).get()!;
    expect(row.taxes?.map((t) => t.amount)).toEqual([cedis(51), cedis(8.5), cedis(8.5)]);
  });

  it("gives change on cash", () => {
    const id = deckOrder();
    expect(takePayment(db, EFUA, id, { method: "cash", amount: cedis(408), tendered: cedis(500) })).toMatchObject({ ok: true, change: cedis(92) });
    expect(takePayment(db, EFUA, deckOrder(), { method: "cash", amount: cedis(408), tendered: cedis(400) })).toEqual({
      ok: false,
      error: "The cash received is less than the amount to collect.",
    });
  });

  it("splits the bill across payments and methods", () => {
    const id = deckOrder();
    expect(takePayment(db, EFUA, id, { method: "mobile_money", amount: cedis(204), network: "mtn", account: "024 000 5821" })).toMatchObject({
      ok: true,
      closed: false,
      balance: cedis(204),
    });
    expect(listOpenOrders(db, R)[0].paid).toBe(cedis(204));
    expect(takePayment(db, EFUA, id, { method: "cash", amount: cedis(204), tendered: cedis(210) })).toMatchObject({ ok: true, closed: true, change: cedis(6) });
    expect(view(id).payments.map((p) => [p.method, p.amount])).toEqual([
      ["mobile_money", cedis(204)],
      ["cash", cedis(204)],
    ]);
  });

  it("refuses more than the balance, and payments on a paid order", () => {
    const id = deckOrder();
    expect(takePayment(db, EFUA, id, { method: "card", amount: cedis(409) })).toEqual({ ok: false, error: "That's more than the 408.00 still to pay." });
    takePayment(db, EFUA, id, { method: "card", amount: cedis(408) });
    expect(takePayment(db, EFUA, id, { method: "card", amount: 1 })).toEqual({ ok: false, error: "This order is already paid." });
  });

  it("checks the details each method needs", () => {
    const id = deckOrder();
    expect(takePayment(db, EFUA, id, { method: "mobile_money", amount: 100, network: "mtn", account: "" }).ok).toBe(false);
    expect(takePayment(db, EFUA, id, { method: "mobile_money", amount: 100, account: "0240005821" }).ok).toBe(false);
    expect(takePayment(db, EFUA, id, { method: "voucher", amount: 100 }).ok).toBe(false);
    expect(takePayment(db, EFUA, id, { method: "house_account", amount: 100, account: "Ministry canteen" }).ok).toBe(true);
    expect(takePayment(db, EFUA, id, { method: "card", amount: 0 }).ok).toBe(false);
    expect(takePayment(db, EFUA, id, { method: "bitcoin" as never, amount: 100 }).ok).toBe(false);
  });

  it("sends items still waiting to the kitchen with the first payment (takeaway paid up front)", () => {
    const id = deckOrder(false);
    expect(view(id).unsentItems).toBe(5);
    expect(takePayment(db, EFUA, id, { method: "card", amount: cedis(100) })).toMatchObject({ ok: true, sentItems: 5 });
    expect(view(id).unsentItems).toBe(0);
    expect(getKitchenBoard(db, R).active).toHaveLength(1);
    expect(takePayment(db, EFUA, id, { method: "card", amount: cedis(308) })).toMatchObject({ ok: true, sentItems: 0, closed: true });
    expect(db.select().from(kitchenTickets).all()).toHaveLength(1);
  });

  it("locks the order against edits once a payment is taken", () => {
    const id = deckOrder();
    takePayment(db, EFUA, id, { method: "card", amount: cedis(100) });
    const v = view(id);
    const edit = saveOrder(db, EFUA, {
      orderId: id,
      version: 2,
      type: "takeaway",
      tableLabel: "",
      customerName: "",
      lines: [{ menuItemId: "kelewele", quantity: 1, note: "" }],
      send: false,
    });
    expect(edit.ok).toBe(false);
    expect(v.balance).toBe(cedis(308));
  });
});

describe("discounts and tips", () => {
  it("lets a manager discount without a second PIN, before tax", async () => {
    const id = deckOrder();
    expect(await setDiscount(db, KWAME, id, { kind: "amount", value: cedis(40), reason: "Regular guest" }, null)).toEqual({ ok: true });
    const v = view(id);
    expect(v.bill).toMatchObject({ discount: cedis(40), total: cedis(360) });
    expect(v.order).toMatchObject({ discountReason: "Regular guest", discountApprovedBy: "Kwame B." });
  });

  it("needs a manager's PIN when a cashier gives a discount", async () => {
    const id = deckOrder();
    const discount = { kind: "percent" as const, value: 10, reason: "Late food" };
    expect(await setDiscount(db, EFUA, id, discount, null)).toEqual({ ok: false, error: "A manager needs to approve this discount." });
    expect(await setDiscount(db, EFUA, id, discount, { staffId: "staff-kofi", pin: "3333" })).toEqual({
      ok: false,
      error: "Only an owner or manager can approve a discount.",
    });
    expect(await setDiscount(db, EFUA, id, discount, { staffId: KWAME.id, pin: "0000" })).toEqual({ ok: false, error: "Wrong manager PIN." });
    expect(await setDiscount(db, EFUA, id, discount, { staffId: KWAME.id, pin: "2222" })).toEqual({ ok: true });
    expect(view(id).bill.discount).toBe(cedis(34));
  });

  it("needs a reason, and can't exceed the bill", async () => {
    const id = deckOrder();
    expect((await setDiscount(db, KWAME, id, { kind: "amount", value: cedis(10), reason: " " }, null)).ok).toBe(false);
    expect((await setDiscount(db, KWAME, id, { kind: "amount", value: cedis(341), reason: "x" }, null)).ok).toBe(false);
    expect((await setDiscount(db, KWAME, id, { kind: "percent", value: 101, reason: "x" }, null)).ok).toBe(false);
  });

  it("adds an untaxed tip", () => {
    const id = deckOrder();
    expect(setTip(db, EFUA, id, cedis(20))).toEqual({ ok: true });
    expect(view(id).bill.total).toBe(cedis(428));
  });

  it("freezes discount and tip once money has been taken", async () => {
    const id = deckOrder();
    takePayment(db, EFUA, id, { method: "card", amount: cedis(100) });
    expect(setTip(db, EFUA, id, cedis(20)).ok).toBe(false);
    expect((await setDiscount(db, KWAME, id, { kind: "amount", value: cedis(10), reason: "x" }, null)).ok).toBe(false);
    expect(db.select().from(payments).all()).toHaveLength(1);
  });
});
