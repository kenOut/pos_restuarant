import { randomUUID } from "node:crypto";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { STATIONS, menuCategories, menuItems, orderLines, type Station, type StaffRole } from "@/db/schema";

export const ITEM_NAME_MAX = 60;
export const CATEGORY_NAME_MAX = 30;
/** GH₵ 10,000: the highest single menu price accepted, to catch typing mistakes. */
export const MAX_PRICE = 1_000_000;

export type AdminCategory = { id: string; name: string; itemCount: number };
export type AdminItem = {
  id: string;
  name: string;
  category: string;
  station: Station;
  price: number;
  available: boolean;
  archived: boolean;
};
export type ItemInput = { name: string; category: string; station: Station; price: number };

type Actor = { restaurantId: string; role: StaffRole };
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });
const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");

export const canManageMenu = (role: StaffRole) => role === "owner" || role === "manager";

/**
 * Categories in till order. Any category used by a dish but missing from the
 * table (e.g. a database from before categories existed) is added at the end.
 */
export function ensureCategories(db: Db, restaurantId: string): void {
  const known = new Set(db.select({ name: menuCategories.name }).from(menuCategories).where(eq(menuCategories.restaurantId, restaurantId)).all().map((c) => c.name));
  const used = db.selectDistinct({ name: menuItems.category }).from(menuItems).where(eq(menuItems.restaurantId, restaurantId)).all();
  let next = nextCategoryOrder(db, restaurantId);
  for (const { name } of used) {
    if (!known.has(name)) db.insert(menuCategories).values({ id: randomUUID(), restaurantId, name, sortOrder: next++ }).run();
  }
}

function nextCategoryOrder(db: Db, restaurantId: string): number {
  const row = db.select({ max: sql<number | null>`max(${menuCategories.sortOrder})` }).from(menuCategories).where(eq(menuCategories.restaurantId, restaurantId)).get();
  return (row?.max ?? -1) + 1;
}

export function listCategories(db: Db, restaurantId: string): AdminCategory[] {
  ensureCategories(db, restaurantId);
  return db
    .select({
      id: menuCategories.id,
      name: menuCategories.name,
      // Spelled out with table names: in a single-table query Drizzle leaves columns unqualified,
      // which inside this sub-query would point at menu_items instead of the category row.
      itemCount: sql<number>`(select count(*) from menu_items mi where mi.restaurant_id = menu_categories.restaurant_id and mi.category = menu_categories.name and mi.archived = 0)`,
    })
    .from(menuCategories)
    .where(eq(menuCategories.restaurantId, restaurantId))
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name))
    .all();
}

/** Every dish, archived ones included, in till order. */
export function listMenuAdmin(db: Db, restaurantId: string): AdminItem[] {
  return db
    .select({
      id: menuItems.id,
      name: menuItems.name,
      category: menuItems.category,
      station: menuItems.station,
      price: menuItems.price,
      available: menuItems.available,
      archived: menuItems.archived,
    })
    .from(menuItems)
    .leftJoin(menuCategories, and(eq(menuCategories.restaurantId, menuItems.restaurantId), eq(menuCategories.name, menuItems.category)))
    .where(eq(menuItems.restaurantId, restaurantId))
    .orderBy(sql`coalesce(${menuCategories.sortOrder}, 1000000)`, asc(menuItems.sortOrder), asc(menuItems.name))
    .all();
}

// ---------- Categories ----------

export function createCategory(db: Db, actor: Actor, rawName: string): Result<{ id: string }> {
  if (!canManageMenu(actor.role)) return fail("Only owners and managers can change the menu.");
  const name = clean(rawName, CATEGORY_NAME_MAX);
  if (!name) return fail("Enter a category name.");
  ensureCategories(db, actor.restaurantId);
  const exists = db.select({ id: menuCategories.id }).from(menuCategories).where(and(eq(menuCategories.restaurantId, actor.restaurantId), eq(menuCategories.name, name))).get();
  if (exists) return fail(`There's already a category called ${name}.`);
  const id = randomUUID();
  db.insert(menuCategories).values({ id, restaurantId: actor.restaurantId, name, sortOrder: nextCategoryOrder(db, actor.restaurantId) }).run();
  return { ok: true, id };
}

function findCategory(db: Db, restaurantId: string, id: string) {
  return db.select().from(menuCategories).where(and(eq(menuCategories.id, id), eq(menuCategories.restaurantId, restaurantId))).get();
}

/** Renames a category; its dishes (archived ones too) move with it. */
export function renameCategory(db: Db, actor: Actor, id: string, rawName: string): Result {
  if (!canManageMenu(actor.role)) return fail("Only owners and managers can change the menu.");
  const name = clean(rawName, CATEGORY_NAME_MAX);
  if (!name) return fail("Enter a category name.");
  const category = findCategory(db, actor.restaurantId, id);
  if (!category) return fail("That category no longer exists.");
  if (name === category.name) return { ok: true };
  const clash = db.select({ id: menuCategories.id }).from(menuCategories).where(and(eq(menuCategories.restaurantId, actor.restaurantId), eq(menuCategories.name, name))).get();
  if (clash) return fail(`There's already a category called ${name}.`);
  db.transaction((tx) => {
    tx.update(menuCategories).set({ name }).where(eq(menuCategories.id, id)).run();
    tx.update(menuItems).set({ category: name }).where(and(eq(menuItems.restaurantId, actor.restaurantId), eq(menuItems.category, category.name))).run();
  });
  return { ok: true };
}

/** Moves a category one place up (-1) or down (+1) on the till. */
export function moveCategory(db: Db, actor: Actor, id: string, direction: -1 | 1): Result {
  if (!canManageMenu(actor.role)) return fail("Only owners and managers can change the menu.");
  const list = listCategories(db, actor.restaurantId);
  const index = list.findIndex((c) => c.id === id);
  if (index === -1) return fail("That category no longer exists.");
  const swap = index + direction;
  if (swap < 0 || swap >= list.length) return { ok: true };
  [list[index], list[swap]] = [list[swap], list[index]];
  db.transaction((tx) => list.forEach((c, i) => tx.update(menuCategories).set({ sortOrder: i }).where(eq(menuCategories.id, c.id)).run()));
  return { ok: true };
}

export function deleteCategory(db: Db, actor: Actor, id: string): Result {
  if (!canManageMenu(actor.role)) return fail("Only owners and managers can change the menu.");
  const category = findCategory(db, actor.restaurantId, id);
  if (!category) return fail("That category no longer exists.");
  const inUse = db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(and(eq(menuItems.restaurantId, actor.restaurantId), eq(menuItems.category, category.name), eq(menuItems.archived, false)))
    .limit(1)
    .get();
  if (inUse) return fail("Move or remove the dishes in this category first.");
  db.delete(menuCategories).where(eq(menuCategories.id, id)).run();
  return { ok: true };
}

// ---------- Dishes ----------

function validateItem(db: Db, restaurantId: string, input: ItemInput, excludeId?: string): { ok: false; error: string } | { ok: true; value: ItemInput } {
  const name = clean(input?.name, ITEM_NAME_MAX);
  if (!name) return fail("Enter the dish's name.");
  const price = Number(input?.price);
  if (!Number.isInteger(price) || price <= 0 || price > MAX_PRICE) return fail("Enter a price between GH₵ 0.01 and GH₵ 10,000.");
  if (!STATIONS.includes(input?.station)) return fail("Choose the station that makes it.");
  const category = clean(input?.category, CATEGORY_NAME_MAX);
  ensureCategories(db, restaurantId);
  const categoryExists = db.select({ id: menuCategories.id }).from(menuCategories).where(and(eq(menuCategories.restaurantId, restaurantId), eq(menuCategories.name, category))).get();
  if (!categoryExists) return fail("Choose a category.");
  const duplicate = db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(
      and(
        eq(menuItems.restaurantId, restaurantId),
        eq(menuItems.archived, false),
        sql`lower(${menuItems.name}) = lower(${name})`,
        excludeId ? ne(menuItems.id, excludeId) : undefined
      )
    )
    .get();
  if (duplicate) return fail(`${name} is already on the menu.`);
  return { ok: true, value: { name, price, station: input.station, category } };
}

export function createItem(db: Db, actor: Actor, input: ItemInput): Result<{ id: string }> {
  if (!canManageMenu(actor.role)) return fail("Only owners and managers can change the menu.");
  const checked = validateItem(db, actor.restaurantId, input);
  if (!checked.ok) return checked;
  const last = db
    .select({ max: sql<number | null>`max(${menuItems.sortOrder})` })
    .from(menuItems)
    .where(and(eq(menuItems.restaurantId, actor.restaurantId), eq(menuItems.category, checked.value.category)))
    .get();
  const id = randomUUID();
  db.insert(menuItems).values({ id, restaurantId: actor.restaurantId, ...checked.value, sortOrder: (last?.max ?? -1) + 1 }).run();
  return { ok: true, id };
}

function findItem(db: Db, restaurantId: string, id: string) {
  return db.select().from(menuItems).where(and(eq(menuItems.id, id), eq(menuItems.restaurantId, restaurantId))).get();
}

/** Edits a dish. Orders already taken keep the name and price they were sold at. */
export function updateItem(db: Db, actor: Actor, id: string, input: ItemInput): Result {
  if (!canManageMenu(actor.role)) return fail("Only owners and managers can change the menu.");
  const item = findItem(db, actor.restaurantId, id);
  if (!item) return fail("That dish no longer exists.");
  const checked = validateItem(db, actor.restaurantId, input, id);
  if (!checked.ok) return checked;
  db.update(menuItems).set(checked.value).where(eq(menuItems.id, id)).run();
  return { ok: true };
}

export function setItemAvailable(db: Db, actor: Actor, id: string, available: boolean): Result {
  if (!canManageMenu(actor.role)) return fail("Only owners and managers can mark dishes sold out.");
  const item = findItem(db, actor.restaurantId, id);
  if (!item || item.archived) return fail("That dish is no longer on the menu.");
  db.update(menuItems).set({ available: available === true }).where(eq(menuItems.id, id)).run();
  return { ok: true };
}

/** Moves a dish one place up (-1) or down (+1) within its category. */
export function moveItem(db: Db, actor: Actor, id: string, direction: -1 | 1): Result {
  if (!canManageMenu(actor.role)) return fail("Only owners and managers can change the menu.");
  const item = findItem(db, actor.restaurantId, id);
  if (!item) return fail("That dish no longer exists.");
  const siblings = listMenuAdmin(db, actor.restaurantId).filter((i) => i.category === item.category && !i.archived);
  const index = siblings.findIndex((i) => i.id === id);
  const swap = index + direction;
  if (index === -1 || swap < 0 || swap >= siblings.length) return { ok: true };
  [siblings[index], siblings[swap]] = [siblings[swap], siblings[index]];
  db.transaction((tx) => siblings.forEach((s, i) => tx.update(menuItems).set({ sortOrder: i }).where(eq(menuItems.id, s.id)).run()));
  return { ok: true };
}

/**
 * Takes a dish off the menu. If it has ever been ordered it's archived (past
 * orders still point at it); otherwise it's deleted outright.
 */
export function removeItem(db: Db, actor: Actor, id: string): Result<{ archived: boolean }> {
  if (!canManageMenu(actor.role)) return fail("Only owners and managers can change the menu.");
  const item = findItem(db, actor.restaurantId, id);
  if (!item) return fail("That dish no longer exists.");
  const ordered = db.select({ id: orderLines.id }).from(orderLines).where(eq(orderLines.menuItemId, id)).limit(1).get();
  if (ordered) {
    db.update(menuItems).set({ archived: true }).where(eq(menuItems.id, id)).run();
    return { ok: true, archived: true };
  }
  db.delete(menuItems).where(eq(menuItems.id, id)).run();
  return { ok: true, archived: false };
}

/** Puts an archived dish back on the menu. */
export function restoreItem(db: Db, actor: Actor, id: string): Result {
  if (!canManageMenu(actor.role)) return fail("Only owners and managers can change the menu.");
  const item = findItem(db, actor.restaurantId, id);
  if (!item) return fail("That dish no longer exists.");
  const clash = db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(and(eq(menuItems.restaurantId, actor.restaurantId), eq(menuItems.archived, false), sql`lower(${menuItems.name}) = lower(${item.name})`, ne(menuItems.id, id)))
    .get();
  if (clash) return fail(`${item.name} is already on the menu.`);
  ensureCategories(db, actor.restaurantId);
  db.update(menuItems).set({ archived: false }).where(eq(menuItems.id, id)).run();
  return { ok: true };
}
