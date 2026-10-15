// Order constants shared by the server and the till screen. Keep this file free
// of server-only imports so the browser can use it.
import type { OrderType } from "@/db/schema";

export const FIRST_ORDER_NUMBER = 1001;
export const MAX_QUANTITY = 99;
export const MAX_LINES = 100;
export const NOTE_MAX = 140;
export const LABEL_MAX = 40;

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  dine_in: "Dine-in",
  takeaway: "Takeaway",
  delivery: "Delivery",
};

/** Notes kitchens see most often, offered as one-tap chips. */
export const QUICK_NOTES = ["No pepper", "Extra pepper", "Well done", "Pack to take away"] as const;
