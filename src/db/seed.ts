import { randomUUID } from "node:crypto";
import { hashSync } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { CATEGORIES, DEMO_MENU } from "@/data/demo-menu";
import type { Db } from "./client";
import { menuCategories, menuItems, restaurants, staff, type StaffRole } from "./schema";

export const DEMO_RESTAURANT_ID = "chez-accra";

/**
 * Demonstration staff from the ENYO POS deck. The PINs are for local testing
 * only and are listed in the README; never seed these on a real till.
 */
export const DEMO_STAFF: { id: string; name: string; initials: string; role: StaffRole; jobTitle?: string; pin: string }[] = [
  { id: "staff-kwame", name: "Kwame B.", initials: "KB", role: "manager", pin: "2222" },
  { id: "staff-kofi", name: "Kofi A.", initials: "KA", role: "server", pin: "3333" },
  { id: "staff-efua", name: "Efua M.", initials: "EM", role: "cashier", pin: "4444" },
  { id: "staff-abena", name: "Abena O.", initials: "AO", role: "bartender", pin: "5555" },
  { id: "staff-yaw", name: "Yaw D.", initials: "YD", role: "kitchen", jobTitle: "Grill cook", pin: "6666" },
  { id: "staff-akosua", name: "Akosua T.", initials: "AT", role: "kitchen", jobTitle: "Line cook", pin: "7777" },
  { id: "staff-ama", name: "Ama Owner", initials: "AO", role: "owner", pin: "1111" },
];

/** Shown as sold out in the demo, so the greyed-out state is visible. */
const DEMO_SOLD_OUT = new Set(["pineapple-sorbet"]);

/**
 * Fills in whatever demo data is missing: the restaurant and staff on a new
 * database, and the menu on a database created before the menu existed.
 */
export function seedDemoData(db: Db): void {
  db.transaction((tx) => {
    const hasRestaurant = tx.select({ id: restaurants.id }).from(restaurants).limit(1).all().length > 0;
    if (!hasRestaurant) {
      tx.insert(restaurants).values({ id: DEMO_RESTAURANT_ID, name: "Chez Accra" }).run();
      tx.insert(staff)
        .values(
          DEMO_STAFF.map(({ pin, ...person }) => ({
            ...person,
            restaurantId: DEMO_RESTAURANT_ID,
            pinHash: hashSync(pin),
          }))
        )
        .run();
    }

    const demoRestaurant = tx.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.id, DEMO_RESTAURANT_ID)).get();
    const hasMenu = tx.select({ id: menuItems.id }).from(menuItems).limit(1).all().length > 0;
    if (demoRestaurant && !hasMenu) insertSampleMenu(tx as unknown as Db, DEMO_RESTAURANT_ID, { demo: true });
  });
}

/**
 * The deck's 16-dish menu and its five categories. The demo restaurant keeps
 * the fixed dish ids (and its sold-out sorbet) that the tests rely on; a real
 * restaurant starting from the sample gets fresh ids, everything available.
 */
export function insertSampleMenu(db: Db, restaurantId: string, { demo = false } = {}): void {
  db.insert(menuCategories)
    .values(CATEGORIES.map((name, i) => ({ id: randomUUID(), restaurantId, name, sortOrder: i })))
    .onConflictDoNothing()
    .run();
  db.insert(menuItems)
    .values(
      DEMO_MENU.map((item, i) => ({
        ...item,
        id: demo ? item.id : randomUUID(),
        restaurantId,
        available: !(demo && DEMO_SOLD_OUT.has(item.id)),
        sortOrder: i,
      }))
    )
    .run();
}
