"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { requireStaff } from "@/lib/auth/session";
import { publish } from "@/lib/live/bus";
import { getOrderDetail, saveOrder, type OrderDetail, type SaveOrderInput, type SaveOrderResult } from "@/lib/orders/service";

/** Hold or send the ticket on this till. */
export async function saveOrderAction(input: SaveOrderInput): Promise<SaveOrderResult> {
  const person = await requireStaff("order");
  const result = saveOrder(getDb(), person, input);
  if (result.ok) {
    revalidatePath("/order");
    publish(person.restaurantId, { type: "changed" });
  }
  return result;
}

/** Load a held or open order back onto the till. */
export async function loadOrderAction(orderId: string): Promise<OrderDetail | null> {
  const person = await requireStaff("order");
  if (typeof orderId !== "string") return null;
  return getOrderDetail(getDb(), person.restaurantId, orderId);
}
