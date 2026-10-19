// What the data API returns. Money is in pesewas (GH₵ 1 = 100), times are ISO
// 8601 in UTC. Lists come oldest change first with a cursor, so a central
// system can fetch everything once, then only what changed since.
import { and, asc, eq, gt, gte, lt, or, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { ORDER_STATUSES, PAYMENT_METHODS, orders, payments, restaurants, type OrderStatus, type PaymentMethod } from "@/db/schema";
import type { Summary } from "@/lib/office/reports";
import type { OrderSummary } from "@/lib/orders/service";
import { taxLinesForDisplay } from "@/lib/payments/bill";
import { getPaymentView, type PaymentRecord } from "@/lib/payments/service";
import { formatOrderNumber } from "@/lib/orders/shared";

export const API_VERSION = "1";
export const MAX_LIMIT = 200;
export const DEFAULT_LIMIT = 50;

const iso = (ms: number | null | undefined) => (ms == null ? null : new Date(ms).toISOString());

function paymentJson(p: PaymentRecord) {
  return {
    id: p.id,
    method: p.method,
    amount: p.amount,
    tendered: p.tendered,
    change: p.change,
    network: p.network,
    account: p.account,
    reference: p.reference,
    staff_name: p.staffName,
    created_at: iso(p.createdAt),
  };
}

/** One order with its lines, bill and payments; null if it isn't this branch's. */
export function orderJson(db: Db, restaurantId: string, orderId: string) {
  const view = getPaymentView(db, restaurantId, orderId);
  if (!view) return null;
  const extra = db
    .select({ updatedAt: orders.updatedAt, guests: orders.guests, staffId: orders.staffId, tableId: orders.tableId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .get()!;
  const o = view.order;
  return {
    id: o.id,
    number: o.number,
    number_label: formatOrderNumber(o.number),
    type: o.type,
    status: o.status,
    table: o.tableLabel,
    table_id: extra.tableId,
    guests: extra.guests,
    customer_name: o.customerName,
    staff_id: extra.staffId,
    staff_name: o.staffName,
    opened_at: iso(o.createdAt),
    updated_at: iso(extra.updatedAt.getTime()),
    paid_at: iso(o.paidAt),
    lines: view.lines.map((l) => ({ id: l.id, name: l.name, quantity: l.quantity, unit_price: l.unitPrice, amount: l.unitPrice * l.quantity, note: l.note })),
    subtotal: view.bill.subtotal,
    discount: view.bill.discount,
    discount_reason: o.discountReason,
    taxes: view.bill.taxes.map((t) => ({ id: t.id, label: t.label, amount: t.amount })),
    prices_include_tax: view.bill.pricesIncludeTax,
    tip: view.bill.tip,
    total: view.bill.total,
    paid: view.paid,
    balance: view.balance,
    payments: view.payments.map(paymentJson),
  };
}

/** The receipt (or bill, before payment) as data: what the printed one shows, line for line. */
export function receiptJson(db: Db, restaurantId: string, orderId: string) {
  const view = getPaymentView(db, restaurantId, orderId);
  if (!view) return null;
  const o = view.order;
  return {
    kind: o.status === "paid" ? "receipt" : "bill",
    restaurant_name: view.restaurantName,
    order_id: o.id,
    order_number: o.number,
    order_label: formatOrderNumber(o.number),
    type: o.type,
    table: o.tableLabel,
    customer_name: o.customerName,
    staff_name: o.staffName,
    opened_at: iso(o.createdAt),
    paid_at: iso(o.paidAt),
    lines: view.lines.map((l) => ({ name: l.name, quantity: l.quantity, unit_price: l.unitPrice, amount: l.unitPrice * l.quantity, note: l.note })),
    subtotal: view.bill.subtotal,
    discount: view.bill.discount,
    discount_reason: o.discountReason,
    // As printed: combined lines where the tax settings fold taxes together.
    tax_lines: taxLinesForDisplay(view.bill.taxes).map((t) => ({ label: t.label, amount: t.amount })),
    prices_include_tax: view.bill.pricesIncludeTax,
    tip: view.bill.tip,
    total: view.bill.total,
    payments: view.payments.map((p) => ({ method: p.method, network: p.network, amount: p.amount, tendered: p.tendered, change: p.change })),
    paid: view.paid,
    balance: view.balance,
    footer: view.receiptFooter,
  };
}

export type Receipt = NonNullable<ReturnType<typeof receiptJson>>;

// ---------- Paging

/** Cursor: the sort time and id of the last row returned. */
const encodeCursor = (t: number, id: string) => Buffer.from(`${t}:${id}`).toString("base64url");
function decodeCursor(cursor: string | null): { t: Date; id: string } | null | "bad" {
  if (!cursor) return null;
  const [t, id] = Buffer.from(cursor, "base64url").toString("utf8").split(/:(.*)/s);
  return /^\d+$/.test(t) && id ? { t: new Date(Number(t)), id } : "bad";
}

export type ListQuery = { [key: string]: string | null };
type ListResult<T> = { ok: true; data: T[]; next_cursor: string | null } | { ok: false; error: string };

function parseTime(value: string | null, name: string): Date | null | { error: string } {
  if (!value) return null;
  const t = new Date(value);
  return Number.isNaN(t.getTime()) ? { error: `${name} must be a date and time, e.g. 2026-10-16T08:00:00Z.` } : t;
}
function parseLimit(value: string | null): number | { error: string } {
  if (!value) return DEFAULT_LIMIT;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_LIMIT ? n : { error: `limit must be from 1 to ${MAX_LIMIT}.` };
}
const isError = (v: unknown): v is { error: string } => typeof v === "object" && v !== null && "error" in v;

/**
 * Orders, oldest change first. Filters: updated_since, from / to (when opened),
 * status. Each page ends with next_cursor; pass it back as cursor for the next.
 */
export function listOrdersJson(db: Db, restaurantId: string, q: ListQuery): ListResult<NonNullable<ReturnType<typeof orderJson>>> {
  const since = parseTime(q.updated_since, "updated_since");
  const from = parseTime(q.from, "from");
  const to = parseTime(q.to, "to");
  const limit = parseLimit(q.limit);
  const cursor = decodeCursor(q.cursor);
  for (const v of [since, from, to, limit]) if (isError(v)) return { ok: false, error: v.error };
  if (cursor === "bad") return { ok: false, error: "That cursor isn't valid. Start again without one." };
  if (q.status && !ORDER_STATUSES.includes(q.status as OrderStatus)) return { ok: false, error: `status must be one of ${ORDER_STATUSES.join(", ")}.` };

  const conditions: (SQL | undefined)[] = [
    eq(orders.restaurantId, restaurantId),
    since ? gte(orders.updatedAt, since as Date) : undefined,
    from ? gte(orders.createdAt, from as Date) : undefined,
    to ? lt(orders.createdAt, to as Date) : undefined,
    q.status ? eq(orders.status, q.status as OrderStatus) : undefined,
    cursor ? or(gt(orders.updatedAt, cursor.t), and(eq(orders.updatedAt, cursor.t), gt(orders.id, cursor.id))) : undefined,
  ];
  const rows = db
    .select({ id: orders.id, updatedAt: orders.updatedAt })
    .from(orders)
    .where(and(...conditions))
    .orderBy(asc(orders.updatedAt), asc(orders.id))
    .limit((limit as number) + 1)
    .all();
  const page = rows.slice(0, limit as number);
  const last = page.at(-1);
  return {
    ok: true,
    data: page.map((r) => orderJson(db, restaurantId, r.id)!),
    next_cursor: rows.length > page.length && last ? encodeCursor(last.updatedAt.getTime(), last.id) : null,
  };
}

/** Payments, oldest first. Filters: since / from / to (when taken), method. */
export function listPaymentsJson(db: Db, restaurantId: string, q: ListQuery): ListResult<ReturnType<typeof paymentJson> & { order_id: string; order_number: number }> {
  const from = parseTime(q.since ?? q.from, q.since ? "since" : "from");
  const to = parseTime(q.to, "to");
  const limit = parseLimit(q.limit);
  const cursor = decodeCursor(q.cursor);
  for (const v of [from, to, limit]) if (isError(v)) return { ok: false, error: v.error };
  if (cursor === "bad") return { ok: false, error: "That cursor isn't valid. Start again without one." };
  if (q.method && !PAYMENT_METHODS.includes(q.method as PaymentMethod)) return { ok: false, error: `method must be one of ${PAYMENT_METHODS.join(", ")}.` };

  const rows = db
    .select({ id: payments.id, orderId: payments.orderId, number: orders.number, createdAt: payments.createdAt })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(
      and(
        eq(orders.restaurantId, restaurantId),
        from ? gte(payments.createdAt, from as Date) : undefined,
        to ? lt(payments.createdAt, to as Date) : undefined,
        q.method ? eq(payments.method, q.method as PaymentMethod) : undefined,
        cursor ? or(gt(payments.createdAt, cursor.t), and(eq(payments.createdAt, cursor.t), gt(payments.id, cursor.id))) : undefined
      )
    )
    .orderBy(asc(payments.createdAt), asc(payments.id))
    .limit((limit as number) + 1)
    .all();
  const page = rows.slice(0, limit as number);
  // Full payment records (with who took them), fetched per order.
  const byOrder = new Map<string, PaymentRecord[]>();
  for (const orderId of [...new Set(page.map((p) => p.orderId))]) byOrder.set(orderId, getPaymentView(db, restaurantId, orderId)?.payments ?? []);
  const last = page.at(-1);
  return {
    ok: true,
    data: page.map((p) => ({ ...paymentJson(byOrder.get(p.orderId)!.find((r) => r.id === p.id)!), order_id: p.orderId, order_number: p.number, order_label: formatOrderNumber(p.number) })),
    next_cursor: rows.length > page.length && last ? encodeCursor(last.createdAt.getTime(), last.id) : null,
  };
}

export function activeOrderJson(o: OrderSummary) {
  return {
    id: o.id,
    number: o.number,
    number_label: formatOrderNumber(o.number),
    type: o.type,
    status: o.status,
    kitchen: o.kitchen,
    table: o.tableLabel,
    guests: o.guests,
    customer_name: o.customerName,
    staff_name: o.staffName,
    opened_at: iso(o.openedAt),
    bill_printed: o.billPrinted,
    items: o.itemCount,
    total: o.total,
    paid: o.paid,
  };
}

export function summaryJson(s: Summary, range: { from: Date; to: Date }) {
  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    orders: s.orders,
    sales: s.sales,
    average_order: s.averageOrder,
    discounts: s.discounts,
    tips: s.tips,
    payments: s.payments,
    payments_by_method: s.byMethod.map((m) => ({ method: m.method, count: m.count, amount: m.amount })),
    active_orders: s.activeOrders,
    active_value: s.activeValue,
  };
}

export function branchJson(db: Db, restaurantId: string) {
  const row = db.select({ id: restaurants.id, name: restaurants.name }).from(restaurants).where(eq(restaurants.id, restaurantId)).get();
  return { api_version: API_VERSION, branch_id: row?.id ?? restaurantId, name: row?.name ?? null };
}
