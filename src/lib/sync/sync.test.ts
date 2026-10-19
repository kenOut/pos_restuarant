import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "@/db/client";
import { openControlDatabase } from "@/db/control-client";
import { diningTables, orders, staff } from "@/db/schema";
import { DEMO_RESTAURANT_ID, seedDemoData } from "@/db/seed";
import { saveOrder, type SaveOrderInput } from "@/lib/orders/service";
import { getPaymentView, takePayment } from "@/lib/payments/service";
import { applyChanges, collectAll, collectChanges, meta, pendingCount, setMeta, type Change } from "./engine";
import { branchHooks, controlHooks, findOverpaid, saveConflicts } from "./rules";
import { BRANCH_TABLES, CONTROL_TABLES, type SyncedTable } from "./tables";

const R = DEMO_RESTAURANT_ID;
const EFUA = { id: "staff-efua", restaurantId: R, role: "cashier" as const };
let restaurant: Db; // the restaurant's computer
let online: Db; // ENYO Online

/** Runs `fn` as ENYO Online would (its own order-number range). */
function asOnline<T>(fn: () => T): T {
  const before = process.env.ENYO_MODE;
  process.env.ENYO_MODE = "online";
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.ENYO_MODE;
    else process.env.ENYO_MODE = before;
  }
}

/** Sends `from`'s new changes to `to`, as the sync would, page by page. */
function send(from: Db, to: Db, tables: SyncedTable[] = BRANCH_TABLES): number {
  const key = `sent_to_${meta(to.$client, "node")}`;
  let applied = 0;
  for (;;) {
    const page = collectChanges(from.$client, tables, Number(meta(from.$client, key) ?? 0), 50);
    const result = applyChanges(to.$client, tables, page.changes, tables === BRANCH_TABLES ? branchHooks(to.$client) : controlHooks);
    saveConflicts(to.$client, [...result.conflicts, ...findOverpaid(to.$client, result.touched)]);
    applied += result.applied;
    setMeta(from.$client, key, String(page.lastSeq));
    if (!page.more) return applied;
  }
}
/** Both directions, until neither side has anything new (resent rows can bounce once). */
function exchange() {
  for (let i = 0; i < 4; i++) if (send(restaurant, online) + send(online, restaurant) === 0) return;
}
/** A first full copy, as on first connection. */
function copyAll(from: Db, to: Db, tables: SyncedTable[] = BRANCH_TABLES) {
  let cursor = undefined as Parameters<typeof collectAll>[2];
  do {
    const page = collectAll(from.$client, tables, cursor, 40);
    applyChanges(to.$client, tables, page.changes, tables === BRANCH_TABLES ? branchHooks(to.$client) : controlHooks);
    cursor = page.next ?? undefined;
  } while (cursor);
}
/** Every synced row on one side, for comparing the two. */
function snapshot(db: Db, tables: SyncedTable[] = BRANCH_TABLES) {
  return Object.fromEntries(
    tables.map((t) => {
      const rows = db.$client.prepare(`SELECT * FROM "${t.table}" ORDER BY id`).all() as Record<string, unknown>[];
      return [t.table, rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !(t.local ?? []).includes(k))))];
    })
  );
}
const tableId = (db: Db, label: string) => db.select({ id: diningTables.id }).from(diningTables).where(eq(diningTables.label, label)).get()!.id;
function order(db: Db, lines: [string, number][], extra: Partial<SaveOrderInput> = {}) {
  const r = saveOrder(db, EFUA, { orderId: null, version: null, type: "takeaway", tableLabel: "", customerName: "", lines: lines.map(([menuItemId, quantity]) => ({ menuItemId, quantity, note: "" })), send: true, ...extra });
  if (!r.ok) throw new Error(r.error);
  return r.order;
}
const payAll = (db: Db, id: string) => takePayment(db, EFUA, id, { method: "card", amount: getPaymentView(db, R, id)!.balance });

beforeEach(() => {
  restaurant = openDatabase(":memory:");
  online = openDatabase(":memory:");
  seedDemoData(restaurant);
  copyAll(restaurant, online);
  exchange();
});
afterEach(() => {
  restaurant.$client.close();
  online.$client.close();
});

describe("change recording", () => {
  it("has triggers for every synced table, and none for sign-ins", () => {
    for (const [file, tables] of [["drizzle/0008_sync.sql", BRANCH_TABLES], ["drizzle-control/0001_sync.sql", CONTROL_TABLES]] as const) {
      const sql = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      for (const t of tables) for (const s of ["ai", "au", "ad"]) expect(sql).toContain(`sync_${t.table}_${s}`);
      expect(sql).not.toContain("ON `sessions`");
    }
  });

  it("records each change once, and not changes being applied from the other side", () => {
    const before = pendingCount(restaurant.$client, 0);
    order(restaurant, [["kelewele", 1]]);
    expect(pendingCount(restaurant.$client, 0)).toBeGreaterThan(before);
    const onlineBefore = pendingCount(online.$client, 0);
    send(restaurant, online);
    expect(pendingCount(online.$client, 0)).toBe(onlineBefore); // nothing bounces back
  });
});

describe("a first copy", () => {
  it("gives ENYO Online exactly the restaurant's data", () => {
    expect(snapshot(online)).toEqual(snapshot(restaurant));
    expect(online.select({ n: staff.id }).from(staff).all()).toHaveLength(7);
  });
});

describe("both sides trading while apart", () => {
  it("end up with every order and payment from both, numbered so they never clash", () => {
    const a = order(restaurant, [["jollof-chicken", 2]]);
    payAll(restaurant, a.id);
    const b = asOnline(() => order(online, [["sobolo", 3]]));
    asOnline(() => payAll(online, b.id));
    order(restaurant, [["kelewele", 1]]);
    exchange();
    expect(snapshot(online)).toEqual(snapshot(restaurant));
    const numbers = restaurant.select({ n: orders.number }).from(orders).all().map((o) => o.n).sort((x, y) => x - y);
    expect(numbers).toEqual([1001, 1002, 501001]); // W1001 taken online
  });

  it("keep items added to the same order on both sides", () => {
    const o = order(restaurant, [["jollof-chicken", 1]]);
    exchange();
    const add = (db: Db, item: string, online = false) => {
      const current = db.select().from(orders).where(eq(orders.id, o.id)).get()!;
      const run = () => saveOrder(db, EFUA, { orderId: o.id, version: current.version, type: "takeaway", tableLabel: "", customerName: "", lines: [{ menuItemId: item, quantity: 1, note: "" }], send: true });
      const r = online ? asOnline(run) : run();
      if (!r.ok) throw new Error(r.error);
    };
    add(restaurant, "sobolo");
    add(online, "kelewele", true);
    exchange();
    expect(snapshot(online)).toEqual(snapshot(restaurant));
    const items = restaurant.$client.prepare("SELECT name FROM order_lines WHERE order_id = ? ORDER BY name").all(o.id) as { name: string }[];
    expect(items.map((i) => i.name)).toEqual(["Jollof rice with chicken", "Kelewele", "Sobolo"]);
  });

  it("keep a paid order paid, even if the other side changed it later without knowing", () => {
    const o = order(restaurant, [["jollof-chicken", 1]]);
    exchange();
    payAll(restaurant, o.id);
    // Online, a moment later, still thinks it's open and changes the customer name.
    online.$client.prepare("UPDATE orders SET customer_name = 'Late edit', updated_at = updated_at + 1 WHERE id = ?").run(o.id);
    exchange();
    for (const db of [restaurant, online]) expect(db.select({ s: orders.status }).from(orders).where(eq(orders.id, o.id)).get()?.s).toBe("paid");
    expect(snapshot(online)).toEqual(snapshot(restaurant));
  });

  it("agree on who keeps a table both sides used, and flag it", () => {
    const first = order(restaurant, [["kelewele", 1]], { type: "dine_in", tableId: tableId(restaurant, "T4") });
    const second = asOnline(() => order(online, [["sobolo", 1]], { type: "dine_in", tableId: tableId(online, "T4") }));
    exchange();
    expect(snapshot(online)).toEqual(snapshot(restaurant));
    const t4 = (db: Db) => db.select({ id: orders.id }).from(orders).where(eq(orders.tableId, tableId(db, "T4"))).all().map((x) => x.id);
    expect(t4(restaurant)).toEqual([first.id]); // the one opened first keeps it
    expect(t4(online)).toEqual([first.id]);
    expect(restaurant.select({ label: orders.tableLabel }).from(orders).where(eq(orders.id, second.id)).get()?.label).toBe("T4");
    const flagged = (db: Db) => db.$client.prepare("SELECT kind, order_id FROM sync_conflicts").all();
    expect([...flagged(restaurant), ...flagged(online)]).toContainEqual({ kind: "table-taken", order_id: second.id });
  });

  it("flag an order paid on both sides", () => {
    const o = order(restaurant, [["jollof-chicken", 1]]);
    exchange();
    payAll(restaurant, o.id);
    asOnline(() => payAll(online, o.id));
    exchange();
    expect(snapshot(online)).toEqual(snapshot(restaurant));
    const flagged = [...restaurant.$client.prepare("SELECT kind FROM sync_conflicts").all(), ...online.$client.prepare("SELECT kind FROM sync_conflicts").all()];
    expect(flagged).toContainEqual({ kind: "overpaid" });
  });

  it("take the later change to menu, staff and settings", async () => {
    restaurant.$client.prepare("UPDATE menu_items SET price = 9000 WHERE id = 'kelewele'").run();
    // A moment later (a burst of changes can move a clock a few milliseconds ahead of real time).
    await new Promise((r) => setTimeout(r, 200));
    online.$client.prepare("UPDATE menu_items SET price = 9500 WHERE id = 'kelewele'").run();
    online.$client.prepare("UPDATE staff SET name = 'Efua Mensah' WHERE id = 'staff-efua'").run();
    exchange();
    for (const db of [restaurant, online]) {
      expect((db.$client.prepare("SELECT price FROM menu_items WHERE id = 'kelewele'").get() as { price: number }).price).toBe(9500);
      expect((db.$client.prepare("SELECT name FROM staff WHERE id = 'staff-efua'").get() as { name: string }).name).toBe("Efua Mensah");
    }
  });
});

describe("safety", () => {
  it("doesn't let a computer whose clock is behind lose edits made after it heard from the other side", () => {
    // ENYO Online's clock is an hour ahead of the restaurant's.
    setMeta(online.$client, "clock", String(Date.now() + 3_600_000));
    online.$client.prepare("UPDATE menu_items SET price = 9500 WHERE id = 'kelewele'").run();
    exchange();
    // The restaurant changes it afterwards: its change must win, despite its slow clock.
    restaurant.$client.prepare("UPDATE menu_items SET price = 8800 WHERE id = 'kelewele'").run();
    exchange();
    for (const db of [restaurant, online]) expect((db.$client.prepare("SELECT price FROM menu_items WHERE id = 'kelewele'").get() as { price: number }).price).toBe(8800);
  });

  it("ignores unknown tables, unknown columns and odd values", () => {
    const sneaky: Change[] = [
      { tbl: "sessions", id: "x", op: "u", hlc: Date.now() + 1e9, origin: "z", row: { token_hash: "x" } },
      { tbl: "menu_items", id: "kelewele", op: "u", hlc: Date.now() + 1e9, origin: "z", row: { id: "kelewele", price: 1, 'name" = 1; DROP TABLE staff; --': "x", category: { evil: true } as never } },
    ];
    applyChanges(online.$client, BRANCH_TABLES, sneaky, branchHooks(online.$client));
    expect(online.$client.prepare("SELECT count(*) AS n FROM sessions").get()).toEqual({ n: 0 });
    expect(online.$client.prepare("SELECT count(*) AS n FROM staff").get()).toEqual({ n: 7 });
    expect(online.$client.prepare("SELECT price, category FROM menu_items WHERE id = 'kelewele'").get()).toMatchObject({ price: 1, category: "Starters" });
  });

  it("is safe to repeat: the same changes twice change nothing", () => {
    order(restaurant, [["kelewele", 1]]);
    const page = collectChanges(restaurant.$client, BRANCH_TABLES, 0, 10_000);
    applyChanges(online.$client, BRANCH_TABLES, page.changes, branchHooks(online.$client));
    const once = snapshot(online);
    applyChanges(online.$client, BRANCH_TABLES, page.changes, branchHooks(online.$client));
    expect(snapshot(online)).toEqual(once);
  });

  it("never sends this computer's own folders", () => {
    restaurant.$client.prepare("UPDATE restaurants SET backup_copy_dir = 'E:\\backups'").run();
    exchange();
    expect((online.$client.prepare("SELECT backup_copy_dir AS d FROM restaurants").get() as { d: string | null }).d).toBeNull();
  });

  it("catches up fully with everything again (after a restore)", () => {
    order(restaurant, [["kelewele", 2]]);
    exchange();
    // ENYO Online restored from before that order: everything is sent again, and nothing older wins.
    online.$client.prepare("DELETE FROM order_lines").run();
    online.$client.prepare("DELETE FROM kitchen_tickets").run();
    online.$client.prepare("DELETE FROM orders").run();
    online.$client.prepare("DELETE FROM sync_rows WHERE tbl IN ('orders', 'order_lines', 'kitchen_tickets')").run();
    copyAll(restaurant, online);
    expect(snapshot(online)).toEqual(snapshot(restaurant));
  });
});

describe("head office data", () => {
  it("copies branches with each side's own file location, and head office sign-ins", () => {
    const dir = fs.mkdtempSync(path.join(process.cwd(), "tmp-sync-"));
    try {
      const local = openControlDatabase(path.join(dir, "local.db"));
      const remote = openControlDatabase(path.join(dir, "remote.db"));
      local.$client.prepare("INSERT INTO organisation (id, name) VALUES ('org', 'Mama Akos')").run();
      local.$client.prepare("INSERT INTO branches (id, slug, name, db_path) VALUES ('b1', 'spintex', 'Spintex', 'enyo.db')").run();
      local.$client.prepare("INSERT INTO hq_users (id, name, email, password_hash) VALUES ('u1', 'Ama', 'ama@akos.test', 'hash')").run();
      copyAll(local as unknown as Db, remote as unknown as Db, CONTROL_TABLES);
      expect(remote.$client.prepare("SELECT slug, db_path FROM branches").get()).toEqual({ slug: "spintex", db_path: "branches/b1/enyo.db" });
      expect(remote.$client.prepare("SELECT email FROM hq_users").get()).toEqual({ email: "ama@akos.test" });
      local.$client.close();
      remote.$client.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
