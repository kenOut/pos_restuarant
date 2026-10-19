// Figures for the back office and the data API: dashboard totals, order and
// payment lists, and the reports. Pure functions over a branch database.
// Money is in pesewas; a day runs midnight to midnight on the main computer's clock.
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { Db } from "@/db/client";
import {
  MOMO_NETWORKS,
  ORDER_STATUSES,
  ORDER_TYPES,
  PAYMENT_METHODS,
  menuItems,
  orderLines,
  orders,
  payments,
  staff,
  type MomoNetwork,
  type OrderStatus,
  type OrderType,
  type PaymentMethod,
} from "@/db/schema";
import { listOpenOrders, type OrderSummary } from "@/lib/orders/service";
import { ONLINE_SERIES } from "@/lib/orders/shared";
import { getPaymentView } from "@/lib/payments/service";

import { addDays, dayKey, type Range } from "./periods";

export { MAX_RANGE_DAYS, PERIODS, PERIOD_LABELS, dayKey, resolveRange, type Period, type Range, type ResolvedRange } from "./periods";

const inRange = (column: AnySQLiteColumn, range: Range) => and(gte(column, range.from), lt(column, range.to));

// ---------- Dashboard

export type MethodTotal = { method: PaymentMethod; count: number; amount: number };

export type Summary = {
  /** Orders paid in full in the period. */
  orders: number;
  /** What those orders came to, taxes and tips included. */
  sales: number;
  averageOrder: number;
  discounts: number;
  tips: number;
  /** Money taken in the period (including part payments on orders still open). */
  payments: number;
  byMethod: MethodTotal[];
  /** Orders open right now, and what they come to. */
  activeOrders: number;
  activeValue: number;
};

export function getSummary(db: Db, restaurantId: string, range: Range): Summary {
  const paid = db
    .select({
      n: sql<number>`count(*)`,
      sales: sql<number>`coalesce(sum(${orders.total}), 0)`,
      discounts: sql<number>`coalesce(sum(${orders.discount}), 0)`,
      tips: sql<number>`coalesce(sum(${orders.tip}), 0)`,
    })
    .from(orders)
    .where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "paid"), inRange(orders.paidAt, range)))
    .get()!;
  const byMethod = paymentTotals(db, restaurantId, { range });
  const active = listOpenOrders(db, restaurantId);
  return {
    orders: paid.n,
    sales: paid.sales,
    averageOrder: paid.n ? Math.round(paid.sales / paid.n) : 0,
    discounts: paid.discounts,
    tips: paid.tips,
    payments: byMethod.reduce((sum, m) => sum + m.amount, 0),
    byMethod,
    activeOrders: active.length,
    activeValue: active.reduce((sum, o) => sum + o.total, 0),
  };
}

/** Orders open now, oldest first: what the live tracking shows. */
export function listActiveOrders(db: Db, restaurantId: string): OrderSummary[] {
  return listOpenOrders(db, restaurantId).sort((a, b) => a.openedAt - b.openedAt);
}

// ---------- Orders

export const STATUS_LABELS: Record<OrderStatus, string> = { held: "Held", open: "Sent", paid: "Paid" };

export type OrderFilters = {
  range: Range;
  status?: OrderStatus | null;
  type?: OrderType | null;
  staffId?: string | null;
  /** Order number, or part of a table or customer name. */
  search?: string | null;
};

export type OrderRow = {
  id: string;
  number: number;
  type: OrderType;
  status: OrderStatus;
  tableLabel: string | null;
  customerName: string | null;
  staffName: string;
  openedAt: number;
  paidAt: number | null;
  itemCount: number;
  total: number;
  paid: number;
};

export const PAGE_SIZE = 50;

/** Reads filters from a query string, ignoring anything unexpected. */
export function orderFiltersFrom(params: Record<string, string | undefined>, range: Range): OrderFilters {
  return {
    range,
    status: ORDER_STATUSES.includes(params.status as OrderStatus) ? (params.status as OrderStatus) : null,
    type: ORDER_TYPES.includes(params.type as OrderType) ? (params.type as OrderType) : null,
    staffId: params.staff || null,
    search: params.q?.trim().slice(0, 40) || null,
  };
}

function orderConditions(restaurantId: string, f: OrderFilters) {
  const search = f.search ?? "";
  return and(
    eq(orders.restaurantId, restaurantId),
    inRange(orders.createdAt, f.range),
    f.status ? eq(orders.status, f.status) : undefined,
    f.type ? eq(orders.type, f.type) : undefined,
    f.staffId ? eq(orders.staffId, f.staffId) : undefined,
    search
      ? /^w?\d+$/i.test(search)
        ? eq(orders.number, /^w/i.test(search) ? ONLINE_SERIES + Number(search.slice(1)) : Number(search))
        : sql`(lower(${orders.tableLabel}) like ${`%${search.toLowerCase()}%`} or lower(${orders.customerName}) like ${`%${search.toLowerCase()}%`})`
      : undefined
  );
}

/** One page of orders opened in the range, newest first, with exact totals (frozen once paid). */
export function listOrders(db: Db, restaurantId: string, f: OrderFilters, page = 1, pageSize = PAGE_SIZE): { rows: OrderRow[]; total: number; pages: number } {
  const where = orderConditions(restaurantId, f);
  const total = db.select({ n: sql<number>`count(*)` }).from(orders).where(where).get()!.n;
  const ids = db
    .select({ id: orders.id })
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt), desc(orders.number))
    .limit(pageSize)
    .offset((Math.max(1, page) - 1) * pageSize)
    .all();
  const rows = ids.flatMap(({ id }) => {
    const view = getPaymentView(db, restaurantId, id);
    if (!view) return [];
    const o = view.order;
    return [
      {
        id: o.id,
        number: o.number,
        type: o.type,
        status: o.status,
        tableLabel: o.tableLabel,
        customerName: o.customerName,
        staffName: o.staffName,
        openedAt: o.createdAt,
        paidAt: o.paidAt,
        itemCount: view.lines.reduce((n, l) => n + l.quantity, 0),
        total: view.bill.total,
        paid: view.paid,
      },
    ];
  });
  return { rows, total, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

// ---------- Payments

export type PaymentFilters = { range: Range; method?: PaymentMethod | null; network?: MomoNetwork | null; staffId?: string | null };

export function paymentFiltersFrom(params: Record<string, string | undefined>, range: Range): PaymentFilters {
  return {
    range,
    method: PAYMENT_METHODS.includes(params.method as PaymentMethod) ? (params.method as PaymentMethod) : null,
    network: MOMO_NETWORKS.includes(params.network as MomoNetwork) ? (params.network as MomoNetwork) : null,
    staffId: params.staff || null,
  };
}

export type PaymentRow = {
  id: string;
  orderId: string;
  orderNumber: number;
  method: PaymentMethod;
  network: MomoNetwork | null;
  account: string | null;
  reference: string | null;
  amount: number;
  tendered: number | null;
  change: number | null;
  staffName: string;
  createdAt: number;
};

function paymentConditions(restaurantId: string, f: PaymentFilters) {
  return and(
    eq(orders.restaurantId, restaurantId),
    inRange(payments.createdAt, f.range),
    f.method ? eq(payments.method, f.method) : undefined,
    f.network ? eq(payments.network, f.network) : undefined,
    f.staffId ? eq(payments.staffId, f.staffId) : undefined
  );
}

export function listPayments(db: Db, restaurantId: string, f: PaymentFilters, page = 1, pageSize = PAGE_SIZE): { rows: PaymentRow[]; total: number; pages: number } {
  const where = paymentConditions(restaurantId, f);
  const total = db.select({ n: sql<number>`count(*)` }).from(payments).innerJoin(orders, eq(payments.orderId, orders.id)).where(where).get()!.n;
  const rows = db
    .select({
      id: payments.id,
      orderId: payments.orderId,
      orderNumber: orders.number,
      method: payments.method,
      network: payments.network,
      account: payments.account,
      reference: payments.reference,
      amount: payments.amount,
      tendered: payments.tendered,
      change: payments.change,
      staffName: staff.name,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .innerJoin(staff, eq(payments.staffId, staff.id))
    .where(where)
    .orderBy(desc(payments.createdAt))
    .limit(pageSize)
    .offset((Math.max(1, page) - 1) * pageSize)
    .all()
    .map((p) => ({ ...p, createdAt: p.createdAt.getTime() }));
  return { rows, total, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Money taken per method, in a fixed order (methods with nothing taken included, for cashing up). */
export function paymentTotals(db: Db, restaurantId: string, f: PaymentFilters): MethodTotal[] {
  const rows = db
    .select({ method: payments.method, count: sql<number>`count(*)`, amount: sql<number>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(paymentConditions(restaurantId, f))
    .groupBy(payments.method)
    .all();
  const methods = f.method ? [f.method] : PAYMENT_METHODS;
  return methods.map((method) => rows.find((r) => r.method === method) ?? { method, count: 0, amount: 0 });
}

// ---------- Reports

export type DayRow = { day: string; orders: number; sales: number; tips: number; discounts: number };
export type ItemRow = { name: string; category: string; quantity: number; gross: number };
export type CategoryRow = { category: string; quantity: number; gross: number };
export type ServerRow = { staffName: string; orders: number; sales: number; tips: number; averageOrder: number };
export type MethodRow = { method: PaymentMethod; network: MomoNetwork | null; count: number; amount: number };
export type TaxRow = { id: string; label: string; amount: number };
export type HourRow = { hour: number; orders: number; sales: number };

export type Reports = {
  range: Range;
  summary: { orders: number; sales: number; netSales: number; taxes: number; tips: number; discounts: number };
  byDay: DayRow[];
  byItem: ItemRow[];
  byCategory: CategoryRow[];
  byServer: ServerRow[];
  byMethod: MethodRow[];
  taxes: TaxRow[];
  byHour: HourRow[];
};

/**
 * Everything on the Reports screen, from orders paid in the range (sales,
 * dishes, servers, taxes, hours) and payments taken in it (methods). Dish and
 * category figures are before discounts, at the price each was sold for.
 */
export function getReports(db: Db, restaurantId: string, range: Range): Reports {
  const paid = db
    .select({
      id: orders.id,
      total: orders.total,
      subtotal: orders.subtotal,
      discount: orders.discount,
      tip: orders.tip,
      taxes: orders.taxes,
      paidAt: orders.paidAt,
      createdAt: orders.createdAt,
      staffName: staff.name,
    })
    .from(orders)
    .innerJoin(staff, eq(orders.staffId, staff.id))
    .where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "paid"), inRange(orders.paidAt, range)))
    .orderBy(asc(orders.paidAt))
    .all();

  // By day, every day in the range (quiet days show as zero).
  const days = new Map<string, DayRow>();
  for (let d = range.from; d < range.to; d = addDays(d, 1)) days.set(dayKey(d), { day: dayKey(d), orders: 0, sales: 0, tips: 0, discounts: 0 });
  const servers = new Map<string, ServerRow>();
  const taxes = new Map<string, TaxRow>();
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, sales: 0 }));
  for (const o of paid) {
    const total = o.total ?? 0;
    const day = days.get(dayKey(o.paidAt!));
    if (day) {
      day.orders++;
      day.sales += total;
      day.tips += o.tip;
      day.discounts += o.discount;
    }
    const server = servers.get(o.staffName) ?? { staffName: o.staffName, orders: 0, sales: 0, tips: 0, averageOrder: 0 };
    server.orders++;
    server.sales += total;
    server.tips += o.tip;
    servers.set(o.staffName, server);
    for (const t of o.taxes ?? []) {
      const row = taxes.get(t.id) ?? { id: t.id, label: t.label, amount: 0 };
      row.amount += t.amount;
      taxes.set(t.id, row);
    }
    // When the guests ordered.
    hours[o.createdAt.getHours()].orders++;
    hours[o.createdAt.getHours()].sales += total;
  }

  const ids = paid.map((o) => o.id);
  const items: ItemRow[] = [];
  // In chunks, to stay well inside SQLite's limit on query parameters.
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = db
      .select({
        name: orderLines.name,
        category: sql<string>`coalesce(${menuItems.category}, 'Other')`,
        quantity: sql<number>`sum(${orderLines.quantity})`,
        gross: sql<number>`sum(${orderLines.quantity} * ${orderLines.unitPrice})`,
      })
      .from(orderLines)
      .leftJoin(menuItems, eq(orderLines.menuItemId, menuItems.id))
      .where(inArray(orderLines.orderId, chunk))
      .groupBy(orderLines.name, menuItems.category)
      .all();
    for (const row of rows) {
      const existing = items.find((x) => x.name === row.name && x.category === row.category);
      if (existing) {
        existing.quantity += row.quantity;
        existing.gross += row.gross;
      } else items.push({ ...row });
    }
  }
  items.sort((a, b) => b.gross - a.gross || a.name.localeCompare(b.name));
  const categories = new Map<string, CategoryRow>();
  for (const item of items) {
    const c = categories.get(item.category) ?? { category: item.category, quantity: 0, gross: 0 };
    c.quantity += item.quantity;
    c.gross += item.gross;
    categories.set(item.category, c);
  }

  const byMethod = db
    .select({ method: payments.method, network: payments.network, count: sql<number>`count(*)`, amount: sql<number>`sum(${payments.amount})` })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(and(eq(orders.restaurantId, restaurantId), inRange(payments.createdAt, range)))
    .groupBy(payments.method, payments.network)
    .orderBy(desc(sql`sum(${payments.amount})`))
    .all();

  const sales = paid.reduce((sum, o) => sum + (o.total ?? 0), 0);
  const tips = paid.reduce((sum, o) => sum + o.tip, 0);
  const taxTotal = [...taxes.values()].reduce((sum, t) => sum + t.amount, 0);
  return {
    range,
    summary: {
      orders: paid.length,
      sales,
      // What the restaurant keeps before tax: sales less taxes collected and tips.
      netSales: sales - taxTotal - tips,
      taxes: taxTotal,
      tips,
      discounts: paid.reduce((sum, o) => sum + o.discount, 0),
    },
    byDay: [...days.values()],
    byItem: items,
    byCategory: [...categories.values()].sort((a, b) => b.gross - a.gross),
    byServer: [...servers.values()].map((s) => ({ ...s, averageOrder: Math.round(s.sales / s.orders) })).sort((a, b) => b.sales - a.sales),
    byMethod,
    taxes: [...taxes.values()],
    byHour: hours,
  };
}

/** Staff who can appear on orders and payments, for the filters. */
export function listStaffForFilters(db: Db, restaurantId: string): { id: string; name: string }[] {
  return db.select({ id: staff.id, name: staff.name }).from(staff).where(eq(staff.restaurantId, restaurantId)).orderBy(asc(staff.name)).all();
}
