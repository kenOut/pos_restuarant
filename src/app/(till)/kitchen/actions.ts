"use server";

import { revalidatePath } from "next/cache";
import { getDb, type Db } from "@/db";
import { requireStaff } from "@/lib/auth/session";
import {
  bumpTicket,
  recallLastTicket,
  serveTicket,
  startTicket,
  type KitchenActionResult,
} from "@/lib/kitchen/service";
import { publish } from "@/lib/live/bus";

async function run(
  change: (db: Db, restaurantId: string) => KitchenActionResult,
  announceReady = false
): Promise<KitchenActionResult> {
  const person = await requireStaff("kitchen");
  const result = change(getDb(), person.restaurantId);
  if (result.ok) {
    publish(person.restaurantId, announceReady ? { type: "ready", orderNumber: result.orderNumber, label: result.label } : { type: "changed" });
    revalidatePath("/kitchen");
  }
  return result;
}

const invalid: KitchenActionResult = { ok: false, error: "That ticket is no longer on the board." };

export async function startTicketAction(ticketId: string) {
  if (typeof ticketId !== "string") return invalid;
  return run((db, r) => startTicket(db, r, ticketId));
}

export async function bumpTicketAction(ticketId: string) {
  if (typeof ticketId !== "string") return invalid;
  return run((db, r) => bumpTicket(db, r, ticketId), true);
}

export async function serveTicketAction(ticketId: string) {
  if (typeof ticketId !== "string") return invalid;
  return run((db, r) => serveTicket(db, r, ticketId));
}

export async function recallLastAction() {
  return run((db, r) => recallLastTicket(db, r));
}
