import { getOfficeStaff } from "@/lib/office/session";
import { getReports, listOrders, listPayments, orderFiltersFrom, paymentFiltersFrom, resolveRange, STATUS_LABELS } from "@/lib/office/reports";
import { ORDER_TYPE_LABELS, formatOrderNumber } from "@/lib/orders/shared";
import { METHOD_LABELS, NETWORK_LABELS } from "@/lib/payments/labels";
import { getDb } from "@/lib/tenancy/context";

export const dynamic = "force-dynamic";

/** Most rows one download holds. */
const MAX_ROWS = 20_000;

/** GH₵ with two decimals, which spreadsheets read as a number. */
const cedis = (pesewas: number) => (pesewas / 100).toFixed(2);
const iso = (ms: number | null) => (ms === null ? "" : new Date(ms).toISOString());

/** One CSV cell; formula-looking text is prefixed so spreadsheets don't run it. */
function cell(value: string | number | null): string {
  let s = value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && typeof value === "string") s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const toCsv = (header: string[], rows: (string | number | null)[][]) => [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

/** Downloads for the Orders, Payments and Reports screens, with the same filters as the screen. */
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const person = await getOfficeStaff();
  if (!person) return new Response("Sign in to the back office first.", { status: 401 });
  const db = await getDb();
  const { kind } = await params;
  const q = Object.fromEntries(new URL(request.url).searchParams) as Record<string, string | undefined>;
  const range = resolveRange(q.period, q.from, q.to);
  const rid = person.restaurantId;
  let csv: string;

  switch (kind) {
    case "orders": {
      const { rows } = listOrders(db, rid, orderFiltersFrom(q, range), 1, MAX_ROWS);
      csv = toCsv(
        ["Order", "Opened", "Paid", "Status", "Type", "Table", "Customer", "Server", "Items", "Total (GH₵)", "Paid (GH₵)"],
        rows.map((o) => [formatOrderNumber(o.number), iso(o.openedAt), iso(o.paidAt), STATUS_LABELS[o.status], ORDER_TYPE_LABELS[o.type], o.tableLabel, o.customerName, o.staffName, o.itemCount, cedis(o.total), cedis(o.paid)])
      );
      break;
    }
    case "payments": {
      const { rows } = listPayments(db, rid, paymentFiltersFrom(q, range), 1, MAX_ROWS);
      csv = toCsv(
        ["Taken", "Order", "Method", "Network", "Account", "Reference", "Taken by", "Amount (GH₵)", "Tendered (GH₵)", "Change (GH₵)"],
        rows.map((p) => [iso(p.createdAt), formatOrderNumber(p.orderNumber), METHOD_LABELS[p.method], p.network ? NETWORK_LABELS[p.network] : null, p.account, p.reference, p.staffName, cedis(p.amount), p.tendered === null ? null : cedis(p.tendered), p.change === null ? null : cedis(p.change)])
      );
      break;
    }
    default: {
      const r = getReports(db, rid, range);
      const reports: Record<string, () => string> = {
        days: () => toCsv(["Day", "Orders", "Discounts (GH₵)", "Tips (GH₵)", "Sales (GH₵)"], r.byDay.map((d) => [d.day, d.orders, cedis(d.discounts), cedis(d.tips), cedis(d.sales)])),
        dishes: () => toCsv(["Dish", "Category", "Sold", "Amount (GH₵)"], r.byItem.map((i) => [i.name, i.category, i.quantity, cedis(i.gross)])),
        categories: () => toCsv(["Category", "Sold", "Amount (GH₵)"], r.byCategory.map((c) => [c.category, c.quantity, cedis(c.gross)])),
        servers: () => toCsv(["Server", "Orders", "Average (GH₵)", "Tips (GH₵)", "Sales (GH₵)"], r.byServer.map((s) => [s.staffName, s.orders, cedis(s.averageOrder), cedis(s.tips), cedis(s.sales)])),
        methods: () => toCsv(["Method", "Network", "Payments", "Amount (GH₵)"], r.byMethod.map((m) => [METHOD_LABELS[m.method], m.network ? NETWORK_LABELS[m.network] : null, m.count, cedis(m.amount)])),
        taxes: () => toCsv(["Tax", "Amount (GH₵)"], r.taxes.map((t) => [t.label, cedis(t.amount)])),
        hours: () => toCsv(["Hour", "Orders", "Sales (GH₵)"], r.byHour.map((h) => [`${String(h.hour).padStart(2, "0")}:00`, h.orders, cedis(h.sales)])),
      };
      if (!reports[kind]) return new Response("Not found", { status: 404 });
      csv = reports[kind]();
    }
  }

  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="enyo-${kind}-${range.fromDay}-to-${range.toDay}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
