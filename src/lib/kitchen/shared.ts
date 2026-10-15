// Kitchen helpers shared by the server and the kitchen screen (no server-only imports).
import type { OrderType } from "@/db/enums";

/** Where the food goes: "Table T7", the customer's name, or the order type. */
export function ticketDestination(t: { orderType: OrderType; tableLabel: string | null; customerName: string | null }): string {
  if (t.tableLabel) return `Table ${t.tableLabel}`;
  if (t.customerName) return t.customerName;
  return t.orderType === "delivery" ? "Delivery" : "Takeaway";
}
