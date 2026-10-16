// Floor plan rules shared by the server and the till screens. No server-only
// imports, so the browser can use it.
import type { TableShape } from "@/db/enums";

/** The floor plan is a grid of cells; tables sit on whole cells. */
export const FLOOR_COLS = 24;
export const FLOOR_ROWS = 14;
export const MAX_SEATS = 20;
export const TABLE_LABEL_MAX = 12;
export const AREA_NAME_MAX = 30;
export const RESERVED_NAME_MAX = 40;
export const DEFAULT_AREAS = ["Main hall", "Terrace", "Bar"] as const;

/** Cells a table covers: bigger tables are wider. */
export function tableSize(seats: number): { w: number; h: number } {
  if (seats >= 7) return { w: 4, h: 2 };
  if (seats >= 5) return { w: 3, h: 2 };
  return { w: 2, h: 2 };
}

/** Keeps a table fully on the grid. */
export function clampPosition(x: number, y: number, seats: number): { x: number; y: number } {
  const { w, h } = tableSize(seats);
  return {
    x: Math.min(Math.max(0, Math.round(x)), FLOOR_COLS - w),
    y: Math.min(Math.max(0, Math.round(y)), FLOOR_ROWS - h),
  };
}

type Placed = { id: string; x: number; y: number; seats: number };

export function overlaps(a: Placed, b: Placed): boolean {
  const sa = tableSize(a.seats);
  const sb = tableSize(b.seats);
  return a.x < b.x + sb.w && b.x < a.x + sa.w && a.y < b.y + sb.h && b.y < a.y + sa.h;
}

/** Whether a table can sit at (x, y) without covering another table in the same area. */
export function fits(table: Placed, others: Placed[]): boolean {
  return others.every((o) => o.id === table.id || !overlaps(table, o));
}

/** First free spot, reading left to right and top to bottom; null if the area is full. */
export function firstFreeSpot(seats: number, others: Placed[]): { x: number; y: number } | null {
  const { w, h } = tableSize(seats);
  for (let y = 0; y + h <= FLOOR_ROWS; y++) {
    for (let x = 0; x + w <= FLOOR_COLS; x++) {
      if (fits({ id: "", x, y, seats }, others)) return { x, y };
    }
  }
  return null;
}

/**
 * The deck's floor plan legend:
 *  free: no open order · ordering: an order is open but nothing has gone to the kitchen ·
 *  eating: food has gone to the kitchen · waiting: the bill has been printed ·
 *  reserved: marked reserved, with a time.
 */
export const TABLE_STATUSES = ["free", "ordering", "eating", "waiting", "reserved"] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  free: "Free",
  ordering: "Ordering",
  eating: "Eating",
  waiting: "Waiting to pay",
  reserved: "Reserved",
};

export const SHAPE_LABELS: Record<TableShape, string> = { round: "Round", square: "Square" };

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
