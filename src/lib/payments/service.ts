import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Db } from "@/db/client";
import {
  MOMO_NETWORKS,
  PAYMENT_METHODS,
  kitchenTickets,
  orderLines,
  orders,
  payments,
  staff,
  type MomoNetwork,
  type OrderStatus,
  type OrderType,
  type PaymentMethod,
  type StaffRole,
} from "@/db/schema";
import { checkPin } from "@/lib/auth/service";
import { getSettings } from "@/lib/settings/service";
import { DEFAULT_TAX_CONFIG } from "@/lib/tax-config";
import { computeBill, percentOf, type Bill } from "./bill";

export const DISCOUNT_REASON_MAX = 80;
export const ACCOUNT_MAX = 40;
export const REFERENCE_MAX = 40;
/** Largest single tip or cash amount accepted (GH₵ 100,000), to catch typing mistakes. */
export const MAX_AMOUNT = 10_000_000;

const APPROVERS: readonly StaffRole[] = ["owner", "manager"];

export type PaymentRecord = {
  id: string;
  method: PaymentMethod;
  amount: number;
  tendered: number | null;
  change: number | null;
  network: MomoNetwork | null;
  account: string | null;
  reference: string | null;
  staffName: string;
  createdAt: number;
};

export type PaymentView = {
  restaurantName: string;
  logoFile: string | null;
  receiptFooter: string;
  /** Whether a cashier or server needs a manager's PIN for a discount. */
  discountNeedsApproval: boolean;
  order: {
    id: string;
    number: number;
    type: OrderType;
    status: OrderStatus;
    tableLabel: string | null;
    customerName: string | null;
    staffName: string;
    createdAt: number;
    paidAt: number | null;
    discountReason: string | null;
    discountApprovedBy: string | null;
  };
  lines: { id: string; name: string; quantity: number; unitPrice: number; note: string | null }[];
  /** Items not yet sent to the kitchen; the first payment sends them. */
  unsentItems: number;
  bill: Bill;
  payments: PaymentRecord[];
  paid: number;
  balance: number;
};

type Actor = { id: string; restaurantId: string; role: StaffRole };
type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

const approver = alias(staff, "approver");

function loadOrder(db: Db, restaurantId: string, orderId: string) {
  return db
    .select({
      id: orders.id,
      number: orders.number,
      type: orders.type,
      status: orders.status,
      tableLabel: orders.tableLabel,
      customerName: orders.customerName,
      staffName: staff.name,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      discount: orders.discount,
      discountReason: orders.discountReason,
      discountApprovedBy: approver.name,
      tip: orders.tip,
      subtotal: orders.subtotal,
      taxes: orders.taxes,
      taxInclusive: orders.taxInclusive,
      total: orders.total,
    })
    .from(orders)
    .innerJoin(staff, eq(orders.staffId, staff.id))
    .leftJoin(approver, eq(orders.discountApprovedBy, approver.id))
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
    .get();
}

function loadLines(db: Db, orderId: string) {
  return db
    .select({ id: orderLines.id, name: orderLines.name, quantity: orderLines.quantity, unitPrice: orderLines.unitPrice, note: orderLines.note, ticketId: orderLines.ticketId })
    .from(orderLines)
    .where(eq(orderLines.orderId, orderId))
    .orderBy(asc(orderLines.position))
    .all();
}

function loadPayments(db: Db, orderId: string): PaymentRecord[] {
  return db
    .select({
      id: payments.id,
      method: payments.method,
      amount: payments.amount,
      tendered: payments.tendered,
      change: payments.change,
      network: payments.network,
      account: payments.account,
      reference: payments.reference,
      staffName: staff.name,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(staff, eq(payments.staffId, staff.id))
    .where(eq(payments.orderId, orderId))
    .orderBy(asc(payments.createdAt))
    .all()
    .map((p) => ({ ...p, createdAt: p.createdAt.getTime() }));
}

/** Everything the pay screen and the receipt need. Paid orders show their frozen totals. */
export function getPaymentView(db: Db, restaurantId: string, orderId: string): PaymentView | null {
  const order = loadOrder(db, restaurantId, orderId);
  if (!order) return null;
  const lines = loadLines(db, orderId);
  const taken = loadPayments(db, orderId);

  const settings = getSettings(db, restaurantId);
  // Paid orders show exactly what was charged; open ones use today's tax settings.
  const bill: Bill =
    order.status === "paid" && order.subtotal !== null && order.total !== null && order.taxes
      ? {
          subtotal: order.subtotal,
          discount: order.discount,
          taxes: order.taxes.map((t) => ({ ...t, displayAs: t.displayAs ?? null })),
          tip: order.tip,
          total: order.total,
          pricesIncludeTax: order.taxInclusive,
        }
      : computeBill(lines, { discount: order.discount, tip: order.tip }, settings?.taxConfig ?? DEFAULT_TAX_CONFIG);
  const paid = taken.reduce((sum, p) => sum + p.amount, 0);


  return {
    restaurantName: settings?.name ?? "",
    logoFile: settings?.logoFile ?? null,
    receiptFooter: settings?.receiptFooter ?? "",
    discountNeedsApproval: settings?.discountNeedsApproval ?? true,
    order: {
      id: order.id,
      number: order.number,
      type: order.type,
      status: order.status,
      tableLabel: order.tableLabel,
      customerName: order.customerName,
      staffName: order.staffName,
      createdAt: order.createdAt.getTime(),
      paidAt: order.paidAt ? order.paidAt.getTime() : null,
      discountReason: order.discountReason,
      discountApprovedBy: order.discountApprovedBy,
    },
    lines: lines.map((l) => ({ id: l.id, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, note: l.note })),
    unsentItems: lines.filter((l) => l.ticketId === null).reduce((n, l) => n + l.quantity, 0),
    bill,
    payments: taken,
    paid,
    balance: Math.max(0, bill.total - paid),
  };
}

/** Discount and tip can only change before any money is taken, so the balance never shifts under a split bill. */
function editableBeforePayment(db: Db, restaurantId: string, orderId: string): Fail | { ok: true; subtotal: number } {
  const order = db
    .select({ status: orders.status })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
    .get();
  if (!order) return fail("That order no longer exists.");
  if (order.status === "paid") return fail("This order is already paid.");
  const hasPayments = db.select({ id: payments.id }).from(payments).where(eq(payments.orderId, orderId)).limit(1).get();
  if (hasPayments) return fail("The discount and tip can't change once a payment has been taken.");
  const subtotal = loadLines(db, orderId).reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  return { ok: true, subtotal };
}

export type DiscountInput = { kind: "amount" | "percent"; value: number; reason: string };
export type Approval = { staffId: string; pin: string } | null;

/**
 * Sets (or with value 0 removes) the order's discount. Owners and managers
 * approve their own; anyone else needs an owner or manager to enter their PIN.
 */
export async function setDiscount(
  db: Db,
  actor: Actor,
  orderId: string,
  input: DiscountInput,
  approval: Approval,
  now = new Date()
): Promise<{ ok: true } | Fail> {
  const state = editableBeforePayment(db, actor.restaurantId, orderId);
  if (!state.ok) return state;

  const value = Number(input?.value);
  if (!["amount", "percent"].includes(input?.kind) || !Number.isFinite(value) || value < 0) return fail("Enter a valid discount.");
  if (input.kind === "percent" && value > 100) return fail("A discount can't be more than 100%.");
  const amount = input.kind === "percent" ? percentOf(state.subtotal, value) : Math.round(value);
  if (amount > state.subtotal) return fail("A discount can't be more than the bill.");

  if (amount === 0) {
    db.update(orders).set({ discount: 0, discountReason: null, discountApprovedBy: null, updatedAt: now }).where(eq(orders.id, orderId)).run();
    return { ok: true };
  }

  const reason = typeof input.reason === "string" ? input.reason.trim().replace(/\s+/g, " ").slice(0, DISCOUNT_REASON_MAX) : "";
  if (!reason) return fail("Give a reason for the discount.");

  let approvedBy = actor.id;
  const needsApproval = getSettings(db, actor.restaurantId)?.discountNeedsApproval ?? true;
  if (needsApproval && !APPROVERS.includes(actor.role)) {
    if (!approval?.staffId || typeof approval.pin !== "string") return fail("A manager needs to approve this discount.");
    const person = db
      .select({ role: staff.role })
      .from(staff)
      .where(and(eq(staff.id, approval.staffId), eq(staff.restaurantId, actor.restaurantId), eq(staff.active, true)))
      .get();
    if (!person || !APPROVERS.includes(person.role)) return fail("Only an owner or manager can approve a discount.");
    const check = await checkPin(db, approval.staffId, approval.pin, now);
    if (!check.ok) {
      return fail(check.reason === "locked" ? "That manager is locked out after too many wrong PINs." : "Wrong manager PIN.");
    }
    approvedBy = approval.staffId;
  }

  db.update(orders).set({ discount: amount, discountReason: reason, discountApprovedBy: approvedBy, updatedAt: now }).where(eq(orders.id, orderId)).run();
  return { ok: true };
}

export function setTip(db: Db, actor: Actor, orderId: string, tip: number, now = new Date()): { ok: true } | Fail {
  const state = editableBeforePayment(db, actor.restaurantId, orderId);
  if (!state.ok) return state;
  if (!Number.isInteger(tip) || tip < 0 || tip > MAX_AMOUNT) return fail("Enter a valid tip.");
  db.update(orders).set({ tip, updatedAt: now }).where(eq(orders.id, orderId)).run();
  return { ok: true };
}

export type PaymentInput = {
  method: PaymentMethod;
  /** Pesewas put towards the bill. */
  amount: number;
  /** Cash: what the guest handed over (defaults to the amount). */
  tendered?: number | null;
  network?: MomoNetwork | null;
  /** Mobile money number, voucher code or house account name. */
  account?: string | null;
  reference?: string | null;
};

export type TakePaymentResult =
  | { ok: true; closed: boolean; change: number; balance: number; sentItems: number; orderNumber: number }
  | Fail;

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");

/**
 * Records one payment. The first payment sends any items not yet in the
 * kitchen. When the balance reaches zero the order closes and its totals are
 * frozen.
 */
export function takePayment(db: Db, actor: Actor, orderId: string, input: PaymentInput, now = new Date()): TakePaymentResult {
  if (!input || !PAYMENT_METHODS.includes(input.method)) return fail("Choose how the guest is paying.");
  const amount = Number(input.amount);
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) return fail("Enter the amount to collect.");

  let tendered: number | null = null;
  let change: number | null = null;
  let network: MomoNetwork | null = null;
  let account: string | null = null;
  const reference = clean(input.reference, REFERENCE_MAX) || null;

  switch (input.method) {
    case "cash": {
      tendered = input.tendered === undefined || input.tendered === null ? amount : Number(input.tendered);
      if (!Number.isInteger(tendered) || tendered > MAX_AMOUNT) return fail("Enter the cash received.");
      if (tendered < amount) return fail("The cash received is less than the amount to collect.");
      change = tendered - amount;
      break;
    }
    case "mobile_money": {
      if (!input.network || !MOMO_NETWORKS.includes(input.network)) return fail("Choose the mobile money network.");
      network = input.network;
      account = clean(input.account, ACCOUNT_MAX);
      if (!/^\+?[\d ]{9,15}$/.test(account)) return fail("Enter the customer's mobile money number.");
      break;
    }
    case "voucher":
      account = clean(input.account, ACCOUNT_MAX);
      if (!account) return fail("Enter the voucher code.");
      break;
    case "house_account":
      account = clean(input.account, ACCOUNT_MAX);
      if (!account) return fail("Enter the house account name.");
      break;
    case "card":
      break;
  }

  return db.transaction((tx) => {
    const order = tx
      .select({ status: orders.status, number: orders.number, discount: orders.discount, tip: orders.tip })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.restaurantId, actor.restaurantId)))
      .get();
    if (!order) return fail("That order no longer exists.");
    if (order.status === "paid") return fail("This order is already paid.");

    const lines = loadLines(tx as unknown as Db, orderId);
    if (lines.length === 0) return fail("There's nothing on this order to pay for.");

    const bill = computeBill(lines, { discount: order.discount, tip: order.tip }, getSettings(tx as unknown as Db, actor.restaurantId)?.taxConfig ?? DEFAULT_TAX_CONFIG);
    const paidSoFar =
      tx
        .select({ sum: sql<number>`coalesce(sum(${payments.amount}), 0)` })
        .from(payments)
        .where(eq(payments.orderId, orderId))
        .get()?.sum ?? 0;
    const balance = bill.total - paidSoFar;
    if (amount > balance) return fail(`That's more than the ${(balance / 100).toFixed(2)} still to pay.`);

    // Anything not yet in the kitchen goes now (e.g. takeaway paid up front).
    const unsent = lines.filter((l) => l.ticketId === null);
    let sentItems = 0;
    if (unsent.length) {
      const ticketId = randomUUID();
      tx.insert(kitchenTickets).values({ id: ticketId, orderId, sentBy: actor.id, createdAt: now }).run();
      tx.update(orderLines).set({ ticketId }).where(and(eq(orderLines.orderId, orderId), isNull(orderLines.ticketId))).run();
      sentItems = unsent.reduce((n, l) => n + l.quantity, 0);
    }

    tx.insert(payments)
      .values({ id: randomUUID(), orderId, method: input.method, amount, tendered, change, network, account, reference, staffId: actor.id, createdAt: now })
      .run();

    const remaining = balance - amount;
    const closed = remaining === 0;
    tx.update(orders)
      .set(
        closed
          ? { status: "paid", subtotal: bill.subtotal, taxes: bill.taxes, taxInclusive: bill.pricesIncludeTax, total: bill.total, paidAt: now, updatedAt: now }
          : { status: "open", updatedAt: now }
      )
      .where(eq(orders.id, orderId))
      .run();

    return { ok: true, closed, change: change ?? 0, balance: remaining, sentItems, orderNumber: order.number } as const;
  });
}

