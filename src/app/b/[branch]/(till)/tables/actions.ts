"use server";

import { revalidatePath } from "next/cache";
import { type Db } from "@/db";
import type { SessionStaff } from "@/lib/auth/service";
import { requireStaff } from "@/lib/auth/session";
import { publish } from "@/lib/live/bus";
import {
  addArea,
  addTable,
  changeServer,
  clearReservation,
  deleteArea,
  deleteTable,
  markBillPrinted,
  moveOrderToTable,
  placeTable,
  renameArea,
  reserveTable,
  updateTable,
  type Result,
  type TableInput,
} from "@/lib/tables/service";
import { getDb } from "@/lib/tenancy/context";

/** Runs a floor plan change, then refreshes every till's floor plan. */
async function run(change: (db: Db, person: SessionStaff) => Result | { ok: true; id: string }): Promise<Result> {
  const person = await requireStaff("tables");
  const result = change(await getDb(), person);
  if (result.ok) {
    publish(person.restaurantId, { type: "changed" });
    revalidatePath("/b/[branch]", "layout");
    return { ok: true };
  }
  return result;
}

// Arrange mode (owners and managers; checked in the service).
export const addAreaAction = async (name: string) => run((db, p) => addArea(db, p, name));
export const renameAreaAction = async (id: string, name: string) => run((db, p) => renameArea(db, p, id, name));
export const deleteAreaAction = async (id: string) => run((db, p) => deleteArea(db, p, id));
export const addTableAction = async (input: TableInput) => run((db, p) => addTable(db, p, input));
export const updateTableAction = async (id: string, input: TableInput) => run((db, p) => updateTable(db, p, id, input));
export const placeTableAction = async (id: string, x: number, y: number) => run((db, p) => placeTable(db, p, id, x, y));
export const deleteTableAction = async (id: string) => run((db, p) => deleteTable(db, p, id));

// The table panel (front of house).
export const reserveTableAction = async (id: string, time: string, name: string) => run((db, p) => reserveTable(db, p.restaurantId, id, time, name));
export const clearReservationAction = async (id: string) => run((db, p) => clearReservation(db, p.restaurantId, id));
export const printBillAction = async (orderId: string) => run((db, p) => markBillPrinted(db, p.restaurantId, orderId));
export const moveOrderAction = async (orderId: string, tableId: string) => run((db, p) => moveOrderToTable(db, p.restaurantId, orderId, tableId));
export const changeServerAction = async (orderId: string, staffId: string) => run((db, p) => changeServer(db, p.restaurantId, orderId, staffId));
