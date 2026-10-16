"use server";

import { revalidatePath } from "next/cache";
import { type Db } from "@/db";
import { getDb } from "@/lib/tenancy/context";
import { requireStaff } from "@/lib/auth/session";
import { publish } from "@/lib/live/bus";
import {
  createCategory,
  createItem,
  deleteCategory,
  moveCategory,
  moveItem,
  removeItem,
  renameCategory,
  restoreItem,
  setItemAvailable,
  updateItem,
  type ItemInput,
} from "@/lib/menu/service";

type Actor = Awaited<ReturnType<typeof requireStaff>>;

/** Runs a menu change as the signed-in person, then refreshes every till's menu. */
async function change<T extends { ok: boolean }>(run: (db: Db, actor: Actor) => T): Promise<T> {
  const person = await requireStaff("menu");
  const result = run((await getDb()), person);
  if (result.ok) {
    revalidatePath("/b/[branch]", "layout");
    publish(person.restaurantId, { type: "changed" });
  }
  return result;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const dir = (v: unknown): -1 | 1 => (v === -1 ? -1 : 1);

export const createCategoryAction = async (name: string) => change((db, a) => createCategory(db, a, str(name)));
export const renameCategoryAction = async (id: string, name: string) => change((db, a) => renameCategory(db, a, str(id), str(name)));
export const moveCategoryAction = async (id: string, direction: -1 | 1) => change((db, a) => moveCategory(db, a, str(id), dir(direction)));
export const deleteCategoryAction = async (id: string) => change((db, a) => deleteCategory(db, a, str(id)));

export const createItemAction = async (input: ItemInput) => change((db, a) => createItem(db, a, input));
export const updateItemAction = async (id: string, input: ItemInput) => change((db, a) => updateItem(db, a, str(id), input));
export const moveItemAction = async (id: string, direction: -1 | 1) => change((db, a) => moveItem(db, a, str(id), dir(direction)));
export const removeItemAction = async (id: string) => change((db, a) => removeItem(db, a, str(id)));
export const restoreItemAction = async (id: string) => change((db, a) => restoreItem(db, a, str(id)));

/** Also used from the order screen's sold-out mode. */
export const setAvailableAction = async (id: string, available: boolean) => change((db, a) => setItemAvailable(db, a, str(id), available === true));
