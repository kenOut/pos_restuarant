import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "@/db/client";
import { diningTables } from "@/db/schema";
import { DEMO_RESTAURANT_ID, seedDemoData } from "@/db/seed";
import { eq } from "drizzle-orm";
import { listOpenOrders, saveOrder } from "@/lib/orders/service";
import { bumpTicket, countActiveTickets, getKitchenBoard, recallLastTicket, serveTicket, startTicket } from "./service";

const R = DEMO_RESTAURANT_ID;
const KOFI = { id: "staff-kofi", restaurantId: R };
let db: Db;

function send(lines: { menuItemId: string; quantity: number; note?: string }[], tableLabel = "T7", at = new Date()) {
  const result = saveOrder(
    db,
    KOFI,
    {
      orderId: null,
      version: null,
      type: "dine_in",
      tableId: db.select({ id: diningTables.id }).from(diningTables).where(eq(diningTables.label, tableLabel)).get()!.id,
      tableLabel: "",
      customerName: "",
      lines: lines.map((l) => ({ note: "", ...l })),
      send: true,
    },
    at
  );
  if (!result.ok) throw new Error(result.error);
  return result.order;
}

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDemoData(db);
});

describe("kitchen board", () => {
  it("shows sent tickets oldest first, with lines, notes, stations and who's serving", () => {
    send([{ menuItemId: "waakye", quantity: 1, note: "Add egg" }], "T3", new Date("2026-10-04T12:00:00Z"));
    send([{ menuItemId: "jollof-chicken", quantity: 2 }, { menuItemId: "sobolo", quantity: 2 }], "T7", new Date("2026-10-04T12:05:00Z"));
    const board = getKitchenBoard(db, R);
    expect(board.active.map((t) => [t.orderNumber, t.tableLabel, t.status, t.staffName])).toEqual([
      [1001, "T3", "new", "Kofi A."],
      [1002, "T7", "new", "Kofi A."],
    ]);
    expect(board.active[0].lines[0]).toMatchObject({ name: "Waakye special", note: "Add egg", station: "Kitchen" });
    expect(board.active[1].lines.map((l) => l.station)).toEqual(["Kitchen", "Bar"]);
    expect(countActiveTickets(db, R)).toBe(2);
  });

  it("doesn't show held lines that haven't been sent", () => {
    saveOrder(db, KOFI, { orderId: null, version: null, type: "takeaway", tableLabel: "", customerName: "", lines: [{ menuItemId: "kelewele", quantity: 1, note: "" }], send: false });
    expect(getKitchenBoard(db, R).active).toHaveLength(0);
  });

  it("moves a ticket through start → bump → served", () => {
    const order = send([{ menuItemId: "kelewele", quantity: 1 }]);
    const [ticket] = getKitchenBoard(db, R).active;

    expect(startTicket(db, R, ticket.id)).toEqual({ ok: true, orderNumber: order.number, label: "Table T7" });
    expect(getKitchenBoard(db, R).active[0].status).toBe("cooking");

    expect(bumpTicket(db, R, ticket.id).ok).toBe(true);
    let board = getKitchenBoard(db, R);
    expect(board.active).toHaveLength(0);
    expect(board.ready.map((t) => t.orderNumber)).toEqual([order.number]);
    expect(countActiveTickets(db, R)).toBe(0);

    expect(serveTicket(db, R, ticket.id).ok).toBe(true);
    board = getKitchenBoard(db, R);
    expect(board.ready).toHaveLength(0);
  });

  it("lets a new ticket be bumped straight away, but not twice", () => {
    send([{ menuItemId: "sobolo", quantity: 1 }]);
    const [ticket] = getKitchenBoard(db, R).active;
    expect(bumpTicket(db, R, ticket.id).ok).toBe(true);
    expect(bumpTicket(db, R, ticket.id)).toEqual({ ok: false, error: "That ticket is no longer on the board." });
    expect(startTicket(db, R, ticket.id).ok).toBe(false);
  });

  it("recalls the most recently bumped ticket, even after it was served", () => {
    send([{ menuItemId: "kelewele", quantity: 1 }], "T1");
    send([{ menuItemId: "sobolo", quantity: 1 }], "T2");
    const [first, second] = getKitchenBoard(db, R).active;
    bumpTicket(db, R, first.id, new Date("2026-10-04T12:00:00Z"));
    bumpTicket(db, R, second.id, new Date("2026-10-04T12:01:00Z"));
    serveTicket(db, R, second.id);

    expect(recallLastTicket(db, R)).toMatchObject({ ok: true, label: "Table T2" });
    const board = getKitchenBoard(db, R);
    expect(board.active.map((t) => [t.tableLabel, t.status])).toEqual([["T2", "cooking"]]);
    expect(board.ready.map((t) => t.tableLabel)).toEqual(["T1"]);
  });

  it("has nothing to recall on a fresh board", () => {
    expect(getKitchenBoard(db, R).canRecall).toBe(false);
    expect(recallLastTicket(db, R)).toEqual({ ok: false, error: "Nothing to recall." });
  });

  it("tells the tills how far the kitchen has got", () => {
    send([{ menuItemId: "kelewele", quantity: 1 }]);
    const progress = () => listOpenOrders(db, R)[0].kitchen;
    expect(progress()).toBe("sent");
    const [ticket] = getKitchenBoard(db, R).active;
    startTicket(db, R, ticket.id);
    expect(progress()).toBe("cooking");
    bumpTicket(db, R, ticket.id);
    expect(progress()).toBe("ready");
    serveTicket(db, R, ticket.id);
    expect(progress()).toBe("served");
  });

  it("only touches this restaurant's tickets", () => {
    send([{ menuItemId: "kelewele", quantity: 1 }]);
    const [ticket] = getKitchenBoard(db, R).active;
    expect(getKitchenBoard(db, "elsewhere").active).toHaveLength(0);
    expect(bumpTicket(db, "elsewhere", ticket.id).ok).toBe(false);
  });
});
