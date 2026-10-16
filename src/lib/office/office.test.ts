import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "@/db/client";
import { apiKeys, sessions, type StaffRole } from "@/db/schema";
import { DEMO_RESTAURANT_ID, seedDemoData } from "@/db/seed";
import { listOrdersJson, listPaymentsJson, orderJson, receiptJson } from "@/lib/api/data";
import { authenticateApiKey, createApiKey, getAllowedOrigins, listApiKeys, revokeApiKey, setAllowedOrigins } from "@/lib/api/keys";
import { createSession, findSessionStaff, OFFICE_IDLE_MS } from "@/lib/auth/service";
import { saveOrder } from "@/lib/orders/service";
import { getPaymentView, setDiscount, setTip, takePayment } from "@/lib/payments/service";
import { getReports, getSummary, listOrders, listPayments, paymentTotals, resolveRange } from "./reports";

const R = DEMO_RESTAURANT_ID;
const EFUA = { id: "staff-efua", restaurantId: R, role: "cashier" as const };
const KWAME = { id: "staff-kwame", restaurantId: R, role: "manager" as const };
const AMA = { id: "staff-ama", restaurantId: R, role: "owner" as const };
let db: Db;

/** A takeaway order of these dishes, at a given time; paid by card in full unless `pay` is false. */
type Person = { id: string; restaurantId: string; role: StaffRole };
function order(lines: [string, number][], at: Date, { pay = true, by = EFUA as Person }: { pay?: boolean; by?: Person } = {}) {
  const saved = saveOrder(db, by, { orderId: null, version: null, type: "takeaway", tableLabel: "", customerName: "", lines: lines.map(([menuItemId, quantity]) => ({ menuItemId, quantity, note: "" })), send: true }, at);
  if (!saved.ok) throw new Error(saved.error);
  if (pay) {
    const paid = takePayment(db, by, saved.order.id, { method: "card", amount: getPaymentView(db, R, saved.order.id)!.balance }, at);
    if (!paid.ok) throw new Error(paid.error);
  }
  return saved.order.id;
}
const at = (day: string, time = "12:00") => new Date(`${day}T${time}:00`);

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDemoData(db);
});

describe("periods", () => {
  const now = at("2026-10-16", "15:30"); // a Friday
  it("resolves today, yesterday, this week (from Monday) and this month", () => {
    expect(resolveRange("today", null, null, now)).toMatchObject({ fromDay: "2026-10-16", toDay: "2026-10-16" });
    expect(resolveRange("yesterday", null, null, now)).toMatchObject({ fromDay: "2026-10-15", toDay: "2026-10-15" });
    expect(resolveRange("week", null, null, now)).toMatchObject({ fromDay: "2026-10-12", toDay: "2026-10-16" });
    expect(resolveRange("month", null, null, now)).toMatchObject({ fromDay: "2026-10-01", toDay: "2026-10-16" });
  });
  it("takes custom dates either way round, and falls back to today on bad ones", () => {
    const r = resolveRange("custom", "2026-10-10", "2026-10-03", now);
    expect([r.fromDay, r.toDay, r.to.getTime() - r.from.getTime()]).toEqual(["2026-10-03", "2026-10-10", 8 * 86_400_000]);
    expect(resolveRange("custom", "2026-02-31", null, now).period).toBe("today");
    expect(resolveRange("nonsense", null, null, now).period).toBe("today");
  });
});

describe("dashboard and reports add up to the receipts", () => {
  beforeEach(() => {
    order([["jollof-chicken", 2], ["sobolo", 2]], at("2026-10-15", "13:10"));
    order([["banku-tilapia", 1]], at("2026-10-16", "19:05"), { by: KWAME });
    order([["kelewele", 3]], at("2026-10-16", "19:40"));
    order([["beef-suya", 1]], at("2026-10-16", "20:00"), { pay: false }); // still open
  });
  const today = () => resolveRange("custom", "2026-10-16", "2026-10-16");
  const receiptTotal = (id: string) => receiptJson(db, R, id)!.total;

  it("counts paid orders, sales and payments for the period, and what's open now", () => {
    const s = getSummary(db, R, today());
    const paidToday = listOrders(db, R, { range: today(), status: "paid" }).rows;
    expect(s.orders).toBe(2);
    expect(s.sales).toBe(paidToday.reduce((n, o) => n + receiptTotal(o.id), 0));
    expect(s.payments).toBe(s.sales); // paid by card in full
    expect(s.byMethod.find((m) => m.method === "card")).toMatchObject({ count: 2, amount: s.sales });
    expect(s.averageOrder).toBe(Math.round(s.sales / 2));
    expect([s.activeOrders, s.activeValue]).toEqual([1, getPaymentView(db, R, listOrders(db, R, { range: today(), status: "open" }).rows[0].id)!.bill.total]);
  });

  it("filters orders by status, server and number", () => {
    expect(listOrders(db, R, { range: today() }).total).toBe(3);
    expect(listOrders(db, R, { range: today(), staffId: "staff-kwame" }).rows.map((o) => o.staffName)).toEqual(["Kwame B."]);
    const first = listOrders(db, R, { range: resolveRange("custom", "2026-10-15", "2026-10-15") }).rows[0];
    expect(listOrders(db, R, { range: resolveRange("custom", "2026-10-01", "2026-10-31"), search: String(first.number) }).rows.map((o) => o.id)).toEqual([first.id]);
  });

  it("lists payments with totals per method", () => {
    const week = resolveRange("custom", "2026-10-12", "2026-10-18");
    expect(listPayments(db, R, { range: week }).total).toBe(3);
    expect(paymentTotals(db, R, { range: week, method: "cash" })).toEqual([{ method: "cash", count: 0, amount: 0 }]);
  });

  it("reports by day, dish, server, method, tax and hour, all agreeing", () => {
    const r = getReports(db, R, resolveRange("custom", "2026-10-15", "2026-10-16"));
    expect(r.byDay.map((d) => [d.day, d.orders])).toEqual([["2026-10-15", 1], ["2026-10-16", 2]]);
    expect(r.byDay.reduce((n, d) => n + d.sales, 0)).toBe(r.summary.sales);
    expect(r.byItem.find((i) => i.name.startsWith("Kelewele"))?.quantity).toBe(3);
    expect(r.byItem.some((i) => i.name.startsWith("Beef suya"))).toBe(false); // not paid
    expect(r.byCategory.reduce((n, c) => n + c.gross, 0)).toBe(r.byItem.reduce((n, i) => n + i.gross, 0));
    expect(r.byServer.map((s) => [s.staffName, s.orders])).toEqual([["Efua M.", 2], ["Kwame B.", 1]]);
    expect(r.taxes.map((t) => t.label)).toEqual(["VAT", "NHIL", "GETFund Levy"].map((l) => r.taxes.find((t) => t.label.startsWith(l))!.label));
    expect(r.summary.netSales + r.summary.taxes + r.summary.tips).toBe(r.summary.sales);
    expect(r.byHour[19].orders).toBe(2);
    expect(r.byMethod).toEqual([{ method: "card", network: null, count: 3, amount: r.summary.sales }]);
  });

  it("uses the frozen totals of paid orders, with discounts and tips", async () => {
    const id = order([["guinea-fowl", 1]], at("2026-10-16", "21:00"), { pay: false, by: KWAME });
    expect((await setDiscount(db, KWAME, id, { kind: "percent", value: 10, reason: "Regular" }, null)).ok).toBe(true);
    expect(setTip(db, KWAME, id, 500).ok).toBe(true);
    takePayment(db, KWAME, id, { method: "cash", amount: getPaymentView(db, R, id)!.balance, tendered: 1_000_000 }, at("2026-10-16", "21:30"));
    const r = getReports(db, R, today());
    expect(r.summary.discounts).toBeGreaterThan(0);
    expect(r.summary.tips).toBe(500);
    expect(r.summary.sales).toBe(listOrders(db, R, { range: today(), status: "paid" }).rows.reduce((n, o) => n + receiptTotal(o.id), 0));
  });
});

describe("API keys", () => {
  it("are created by owners, shown once and stored only as a hash", () => {
    expect(createApiKey(db, KWAME, "Sync").ok).toBe(false);
    expect(createApiKey(db, AMA, "  ").ok).toBe(false);
    const created = createApiKey(db, AMA, "Head office sync");
    if (!created.ok) throw new Error(created.error);
    expect(created.key).toMatch(/^enyo_[\w-]{8}_[\w-]{43}$/);
    expect(created.key.startsWith(created.info.prefix)).toBe(true);
    const stored = db.select().from(apiKeys).get()!;
    expect(JSON.stringify(stored)).not.toContain(created.key.slice(14));
    expect(listApiKeys(db, R).map((k) => [k.name, k.createdBy])).toEqual([["Head office sync", "Ama Owner"]]);
  });

  it("authenticate bearer headers, note when used, and stop working when revoked", () => {
    const created = createApiKey(db, AMA, "Sync");
    if (!created.ok) throw new Error(created.error);
    expect(authenticateApiKey(db, `Bearer ${created.key}`)).toEqual({ id: created.info.id, restaurantId: R });
    expect(listApiKeys(db, R)[0].lastUsedAt).not.toBeNull();
    expect(authenticateApiKey(db, created.key)).toBeNull(); // no "Bearer"
    expect(authenticateApiKey(db, `Bearer ${created.key.slice(0, -1)}x`)).toBeNull();
    expect(authenticateApiKey(db, null)).toBeNull();
    expect(revokeApiKey(db, KWAME, created.info.id).ok).toBe(false);
    expect(revokeApiKey(db, AMA, created.info.id)).toEqual({ ok: true });
    expect(authenticateApiKey(db, `Bearer ${created.key}`)).toBeNull();
  });

  it("keep a list of websites allowed to call from a browser", () => {
    expect(setAllowedOrigins(db, AMA, "https://dash.example.com/\nhttp://localhost:5173 https://dash.example.com")).toEqual({ ok: true });
    expect(getAllowedOrigins(db, R)).toEqual(["https://dash.example.com", "http://localhost:5173"]);
    expect(setAllowedOrigins(db, AMA, "dash.example.com").ok).toBe(false);
    expect(setAllowedOrigins(db, KWAME, "").ok).toBe(false);
  });
});

describe("API data", () => {
  it("returns an order with lines, taxes and payments that match its receipt", () => {
    const id = order([["jollof-chicken", 2], ["sobolo", 1]], at("2026-10-16", "12:00"));
    const o = orderJson(db, R, id)!;
    const receipt = receiptJson(db, R, id)!;
    expect(o.status).toBe("paid");
    expect(o.lines.reduce((n, l) => n + l.amount, 0)).toBe(o.subtotal);
    expect(o.subtotal - o.discount + o.taxes.reduce((n, t) => n + t.amount, 0) + o.tip).toBe(o.total);
    expect([o.total, o.paid, o.balance]).toEqual([receipt.total, receipt.total, 0]);
    expect(o.payments.map((p) => [p.method, p.amount])).toEqual([["card", o.total]]);
    expect(receipt.kind).toBe("receipt");
    expect(orderJson(db, R, "nope")).toBeNull();
  });

  it("pages orders oldest change first with a cursor, and picks up changes with updated_since", () => {
    const ids = [1, 2, 3, 4, 5].map((i) => order([["sobolo", i]], at("2026-10-16", `1${i}:00`), { pay: false }));
    const first = listOrdersJson(db, R, { limit: "2", cursor: null, updated_since: null, from: null, to: null, status: null });
    if (!first.ok) throw new Error(first.error);
    expect(first.data.map((o) => o.id)).toEqual(ids.slice(0, 2));
    const all = [...first.data.map((o) => o.id)];
    let cursor = first.next_cursor;
    while (cursor) {
      const next = listOrdersJson(db, R, { limit: "2", cursor, updated_since: null, from: null, to: null, status: null });
      if (!next.ok) throw new Error(next.error);
      all.push(...next.data.map((o) => o.id));
      cursor = next.next_cursor;
    }
    expect(all).toEqual(ids);

    // Paying order 2 later moves it to the end of a sync from then on.
    takePayment(db, EFUA, ids[1], { method: "card", amount: getPaymentView(db, R, ids[1])!.balance }, at("2026-10-16", "22:00"));
    const changed = listOrdersJson(db, R, { updated_since: at("2026-10-16", "21:00").toISOString(), limit: null, cursor: null, from: null, to: null, status: null });
    expect(changed.ok && changed.data.map((o) => [o.id, o.status])).toEqual([[ids[1], "paid"]]);
  });

  it("refuses bad filters", () => {
    const q = { limit: null, cursor: null, updated_since: null, from: null, to: null, status: null };
    expect(listOrdersJson(db, R, { ...q, limit: "500" }).ok).toBe(false);
    expect(listOrdersJson(db, R, { ...q, updated_since: "yesterday" }).ok).toBe(false);
    expect(listOrdersJson(db, R, { ...q, status: "lost" }).ok).toBe(false);
    expect(listOrdersJson(db, R, { ...q, cursor: "!!" }).ok).toBe(false);
    expect(listPaymentsJson(db, R, { method: "bitcoin", since: null, from: null, to: null, limit: null, cursor: null }).ok).toBe(false);
  });

  it("lists payments with their order", () => {
    const id = order([["kelewele", 1]], at("2026-10-16", "12:00"));
    const result = listPaymentsJson(db, R, { since: at("2026-10-16", "00:00").toISOString(), from: null, to: null, method: "card", limit: null, cursor: null });
    expect(result.ok && result.data.map((p) => [p.order_id, p.method, p.staff_name])).toEqual([[id, "card", "Efua M."]]);
  });
});

describe("back office sessions", () => {
  it("are separate from till sessions", () => {
    const office = createSession(db, "staff-kwame", new Date(), "office");
    const till = createSession(db, "staff-kwame", new Date(), "till");
    expect(findSessionStaff(db, office.token, new Date(), "office")?.name).toBe("Kwame B.");
    expect(findSessionStaff(db, office.token, new Date(), "till")).toBeNull();
    expect(findSessionStaff(db, till.token, new Date(), "office")).toBeNull();
  });

  it("end after 30 minutes without use, and use keeps them going", () => {
    const start = at("2026-10-16", "09:00");
    const { token } = createSession(db, "staff-kwame", start, "office");
    const later = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
    expect(findSessionStaff(db, token, later(25), "office")).not.toBeNull(); // pushes the limit to 09:55
    expect(findSessionStaff(db, token, later(50), "office")).not.toBeNull();
    const expires = db.select({ e: sessions.expiresAt }).from(sessions).get()!.e.getTime();
    expect(expires).toBe(later(50).getTime() + OFFICE_IDLE_MS);
    expect(findSessionStaff(db, token, later(50 + 31), "office")).toBeNull();
  });
});

