// Branches of the business: where each one's database lives, how a new branch
// is created, and how an older single-restaurant install becomes the first
// branch. Pure functions over the head office database (no request context),
// so they can be tested and used by the backup scheduler.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { hash, hashSync } from "@node-rs/argon2";
import { and, asc, eq } from "drizzle-orm";
import { openDatabase, type Db } from "@/db/client";
import type { ControlDb } from "@/db/control-client";
import { branches, hqUsers, organisation, type Branch } from "@/db/control-schema";
import { menuCategories, menuItems, restaurants, staff } from "@/db/schema";
import { insertSampleMenu, seedDemoData } from "@/db/seed";
import { PIN_PATTERN } from "@/lib/auth/service";
import { initialsFor } from "@/lib/staff/service";

export type { Branch };

export { RESERVED_SLUGS, isValidSlug, slugify } from "./slug";
import { branchFiles } from "./files";
import { isValidSlug, slugify } from "./slug";

export function listBranches(control: ControlDb, { includeInactive = true } = {}): Branch[] {
  return control
    .select()
    .from(branches)
    .where(includeInactive ? undefined : eq(branches.active, true))
    .orderBy(asc(branches.sortOrder), asc(branches.name))
    .all();
}

export function findBranchBySlug(control: ControlDb, slug: string): Branch | undefined {
  return control.select().from(branches).where(eq(branches.slug, slug)).get();
}

export function findBranchById(control: ControlDb, id: string): Branch | undefined {
  return control.select().from(branches).where(eq(branches.id, id)).get();
}

export function organisationName(control: ControlDb): string | null {
  return control.select({ name: organisation.name }).from(organisation).get()?.name ?? null;
}

/** A new install with no business yet goes to first-time setup. */
export function needsSetup(control: ControlDb): boolean {
  return !control.select({ id: organisation.id }).from(organisation).get();
}

export { branchFiles } from "./files";

const newBranchPath = (id: string) => path.join("branches", id, "enyo.db");

/** Demo head office login (development only; listed in the README). */
export const DEMO_HQ = { email: "owner@chezaccra.test", password: "enyo-demo-2026", name: "Ama Owner" };
export const DEMO_BRANCHES = [
  { id: "chez-accra", slug: "osu", name: "Chez Accra Osu" },
  { id: "chez-accra-mall", slug: "accra-mall", name: "Chez Accra Mall" },
] as const;

/**
 * Runs when the head office database is first opened:
 *  1. Already set up: nothing to do.
 *  2. An older single-restaurant install (legacyDbFile exists and has a
 *     restaurant): it becomes the first branch where it is — no files move.
 *  3. Development with demo data: a demo business with two branches.
 *  4. Otherwise: left empty for first-time setup.
 */
export function initialiseControl(control: ControlDb, dataDir: string, opts: { legacyDbFile: string; seedDemo: boolean }): "ready" | "adopted" | "demo" | "needs-setup" {
  if (!needsSetup(control)) return "ready";

  if (fs.existsSync(opts.legacyDbFile)) {
    const legacy = openDatabase(opts.legacyDbFile);
    try {
      const restaurant = legacy.select({ id: restaurants.id, name: restaurants.name }).from(restaurants).get();
      if (restaurant) {
        const slug = isValidSlug(slugify(restaurant.name)) ? slugify(restaurant.name) : "main";
        control.transaction((tx) => {
          tx.insert(organisation).values({ id: randomUUID(), name: restaurant.name }).run();
          tx.insert(branches).values({ id: restaurant.id, slug, name: restaurant.name, dbPath: path.relative(dataDir, opts.legacyDbFile) }).run();
        });
        return "adopted";
      }
    } finally {
      legacy.$client.close();
    }
  }

  if (opts.seedDemo) {
    control.transaction((tx) => {
      tx.insert(organisation).values({ id: randomUUID(), name: "Chez Accra Group" }).run();
      tx.insert(hqUsers).values({ id: randomUUID(), name: DEMO_HQ.name, email: DEMO_HQ.email, passwordHash: hashSync(DEMO_HQ.password) }).run();
      DEMO_BRANCHES.forEach((b, i) => tx.insert(branches).values({ ...b, dbPath: newBranchPath(b.id), sortOrder: i }).run());
    });
    for (const b of DEMO_BRANCHES) {
      const db = openDatabase(branchFiles(dataDir, { dbPath: newBranchPath(b.id) }).dbFile);
      seedDemoData(db, { restaurantId: b.id, name: b.name });
      db.$client.close();
    }
    return "demo";
  }
  return "needs-setup";
}

export type MenuStart = { kind: "empty" } | { kind: "sample" } | { kind: "copy"; fromBranchId: string };
export type NewBranchInput = { name: string; slug: string; leadName: string; pin: string; menu: MenuStart };
export type NewBranchResult = { ok: true; branch: Branch } | { ok: false; error: string };

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");

/**
 * Creates a branch: its own database (fully migrated), its first person (a
 * branch owner, with full access to that branch) and its menu, then lists it
 * in the head office database. `openBranch` gives a connection to another
 * branch when copying its menu.
 */
export async function createBranch(
  control: ControlDb,
  dataDir: string,
  input: NewBranchInput,
  openBranch: (branch: Branch) => Db
): Promise<NewBranchResult> {
  const name = clean(input?.name, 60);
  const slug = clean(input?.slug, 32).toLowerCase();
  const leadName = clean(input?.leadName, 40);
  if (!name) return { ok: false, error: "Enter the branch's name." };
  if (!isValidSlug(slug)) return { ok: false, error: "Use 2–32 lower-case letters, numbers and dashes for the address, e.g. osu." };
  if (findBranchBySlug(control, slug)) return { ok: false, error: `The address ${slug} is already used by another branch.` };
  if (!leadName) return { ok: false, error: "Enter the name of the person running the branch." };
  if (typeof input.pin !== "string" || !PIN_PATTERN.test(input.pin)) return { ok: false, error: "Choose a 4-digit PIN for them." };

  let copyFrom: Branch | undefined;
  if (input.menu?.kind === "copy") {
    copyFrom = findBranchById(control, input.menu.fromBranchId);
    if (!copyFrom) return { ok: false, error: "Choose the branch to copy the menu from." };
  }

  const id = randomUUID();
  const dbPath = newBranchPath(id);
  const pinHash = await hash(input.pin);
  const db = openDatabase(branchFiles(dataDir, { dbPath }).dbFile);
  try {
    db.transaction((tx) => {
      tx.insert(restaurants).values({ id, name }).run();
      tx.insert(staff).values({ id: randomUUID(), restaurantId: id, name: leadName, initials: initialsFor(leadName), role: "owner", jobTitle: "Branch lead", pinHash }).run();
      if (input.menu?.kind === "sample") insertSampleMenu(tx as unknown as Db, id);
    });
    if (copyFrom) copyMenu(openBranch(copyFrom), db, id);
  } finally {
    db.$client.close();
  }

  const sortOrder = listBranches(control).length;
  control.insert(branches).values({ id, slug, name, dbPath, sortOrder }).run();
  return { ok: true, branch: findBranchById(control, id)! };
}

/** Copies categories and the dishes on the menu (not archived ones) into another branch's database. */
export function copyMenu(from: Db, to: Db, toRestaurantId: string): void {
  const categories = from.select().from(menuCategories).orderBy(asc(menuCategories.sortOrder)).all();
  const items = from.select().from(menuItems).where(eq(menuItems.archived, false)).orderBy(asc(menuItems.sortOrder)).all();
  to.transaction((tx) => {
    for (const c of categories) tx.insert(menuCategories).values({ ...c, id: randomUUID(), restaurantId: toRestaurantId }).onConflictDoNothing().run();
    for (const i of items) tx.insert(menuItems).values({ ...i, id: randomUUID(), restaurantId: toRestaurantId }).run();
  });
}

export function renameBranch(control: ControlDb, id: string, rawName: string, branchDb: Db): { ok: true } | { ok: false; error: string } {
  const name = clean(rawName, 60);
  if (!name) return { ok: false, error: "Enter the branch's name." };
  control.update(branches).set({ name }).where(eq(branches.id, id)).run();
  branchDb.update(restaurants).set({ name }).where(eq(restaurants.id, id)).run();
  return { ok: true };
}

/** Deactivated branches can't be opened; nothing is deleted. The last active branch stays open. */
export function setBranchActive(control: ControlDb, id: string, active: boolean): { ok: true } | { ok: false; error: string } {
  if (!active) {
    const others = control.select({ id: branches.id }).from(branches).where(and(eq(branches.active, true))).all().filter((b) => b.id !== id);
    if (others.length === 0) return { ok: false, error: "This is the only open branch." };
  }
  control.update(branches).set({ active }).where(eq(branches.id, id)).run();
  return { ok: true };
}
