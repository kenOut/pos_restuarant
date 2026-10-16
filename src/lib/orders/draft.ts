// The ticket being built on a till, before it's saved. Pure functions so the
// rules are easy to test; the screen keeps a Draft in React state.
import type { OrderType, Station } from "@/db/schema";
import { computeBill, type Bill } from "@/lib/payments/bill";
import { DEFAULT_TAX_CONFIG, type TaxConfig } from "@/lib/tax-config";
import type { MenuEntry, OrderDetail, SaveOrderInput, TicketLine } from "./service";
import { MAX_QUANTITY, NOTE_MAX } from "./shared";

export type DraftLine = {
  key: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  station: Station;
  quantity: number;
  note: string;
};

export type Draft = {
  orderId: string | null;
  version: number | null;
  number: number | null;
  /** Who opened the order; null for a new one (it'll be the signed-in person). */
  staffName: string | null;
  type: OrderType;
  /** Floor plan table for dine-in, or null (typed tableLabel when there's no floor plan). */
  tableId: string | null;
  tableLabel: string;
  /** Guests at the table, as typed ("" for not given). */
  guests: string;
  customerName: string;
  /** Already in the kitchen: shown, but locked. */
  sent: TicketLine[];
  /** Not sent yet: editable. */
  lines: DraftLine[];
  /** True once anything changes after the last load or save. */
  dirty: boolean;
};

// Keys only need to be unique on this screen. (crypto.randomUUID isn't available
// on plain-http local network addresses, which is how tablets reach the till.)
let keySeq = 0;
const nextKey = () => `line-${++keySeq}`;

export function emptyDraft(): Draft {
  return {
    orderId: null,
    version: null,
    number: null,
    staffName: null,
    type: "takeaway",
    tableId: null,
    tableLabel: "",
    guests: "",
    customerName: "",
    sent: [],
    lines: [],
    dirty: false,
  };
}

export function draftFromOrder(order: OrderDetail): Draft {
  return {
    orderId: order.id,
    version: order.version,
    number: order.number,
    staffName: order.staffName,
    type: order.type,
    tableId: order.tableId,
    tableLabel: order.tableLabel ?? "",
    guests: order.guests ? String(order.guests) : "",
    customerName: order.customerName ?? "",
    sent: order.lines.filter((l) => l.sentAt !== null),
    lines: order.lines
      .filter((l) => l.sentAt === null)
      .map((l) => ({ key: nextKey(), menuItemId: l.menuItemId, name: l.name, unitPrice: l.unitPrice, station: l.station, quantity: l.quantity, note: l.note ?? "" })),
    dirty: false,
  };
}

/** Adds one of an item: bumps an unsent line without a note, or starts a new line. */
export function addItem(draft: Draft, item: MenuEntry): Draft {
  if (!item.available) return draft;
  const existing = draft.lines.find((l) => l.menuItemId === item.id && l.note === "");
  const lines = existing
    ? draft.lines.map((l) => (l === existing ? { ...l, quantity: Math.min(l.quantity + 1, MAX_QUANTITY) } : l))
    : [
        ...draft.lines,
        { key: nextKey(), menuItemId: item.id, name: item.name, unitPrice: item.price, station: item.station, quantity: 1, note: "" },
      ];
  return { ...draft, lines, dirty: true };
}

/** +1 / −1 on an unsent line; going below 1 removes it. */
export function changeQuantity(draft: Draft, key: string, delta: number): Draft {
  const lines = draft.lines
    .map((l) => (l.key === key ? { ...l, quantity: Math.min(l.quantity + delta, MAX_QUANTITY) } : l))
    .filter((l) => l.quantity > 0);
  return { ...draft, lines, dirty: true };
}

export function setNote(draft: Draft, key: string, note: string): Draft {
  const lines = draft.lines.map((l) => (l.key === key ? { ...l, note: note.slice(0, NOTE_MAX) } : l));
  return { ...draft, lines, dirty: true };
}

/** A new dine-in ticket for a table picked on the floor plan. */
export function draftForTable(table: { id: string; label: string }): Draft {
  return { ...emptyDraft(), type: "dine_in", tableId: table.id, tableLabel: table.label };
}

export function setDetails(draft: Draft, details: Partial<Pick<Draft, "type" | "tableId" | "tableLabel" | "guests" | "customerName">>): Draft {
  return { ...draft, ...details, dirty: true };
}

/** Ticket totals before any discount or tip (those are set on the pay screen). */
export function draftTotals(draft: Draft, taxConfig: TaxConfig = DEFAULT_TAX_CONFIG): Bill {
  return computeBill([...draft.sent, ...draft.lines].map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity })), {}, taxConfig);
}

/** Total quantity of each menu item on the ticket, for the badges on the menu. */
export function quantitiesByItem(draft: Draft): Map<string, number> {
  const counts = new Map<string, number>();
  for (const l of [...draft.sent, ...draft.lines]) counts.set(l.menuItemId, (counts.get(l.menuItemId) ?? 0) + l.quantity);
  return counts;
}

export const itemCount = (draft: Draft) => [...draft.sent, ...draft.lines].reduce((n, l) => n + l.quantity, 0);
export const unsentCount = (draft: Draft) => draft.lines.reduce((n, l) => n + l.quantity, 0);

export function toSaveInput(draft: Draft, send: boolean): SaveOrderInput {
  return {
    orderId: draft.orderId,
    version: draft.version,
    type: draft.type,
    tableId: draft.type === "dine_in" ? draft.tableId : null,
    tableLabel: draft.tableLabel,
    guests: draft.type === "dine_in" && draft.guests.trim() ? Number(draft.guests) : null,
    customerName: draft.customerName,
    lines: draft.lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, note: l.note })),
    send,
  };
}
