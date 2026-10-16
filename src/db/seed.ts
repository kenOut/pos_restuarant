import { randomUUID } from "node:crypto";
import { hashSync } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { CATEGORIES, DEMO_MENU } from "@/data/demo-menu";
import type { Db } from "./client";
import { diningTables, floorAreas, menuCategories, menuItems, restaurants, staff, type StaffRole, type TableShape } from "./schema";

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
export function seedDemoData(db: Db, { restaurantId = DEMO_RESTAURANT_ID, name = "Chez Accra" } = {}): void {
  db.transaction((tx) => {
    const hasRestaurant = tx.select({ id: restaurants.id }).from(restaurants).limit(1).all().length > 0;
    if (!hasRestaurant) {
      tx.insert(restaurants).values({ id: restaurantId, name }).run();
      tx.insert(staff)
        .values(
          DEMO_STAFF.map(({ pin, ...person }) => ({
            ...person,
            restaurantId,
            pinHash: hashSync(pin),
          }))
        )
        .run();
    }

    const demoRestaurant = tx.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.id, restaurantId)).get();
    const hasMenu = tx.select({ id: menuItems.id }).from(menuItems).limit(1).all().length > 0;
    if (demoRestaurant && !hasMenu) insertSampleMenu(tx as unknown as Db, restaurantId, { demo: true });
    const hasFloor = tx.select({ id: floorAreas.id }).from(floorAreas).limit(1).all().length > 0;
    if (demoRestaurant && !hasFloor) insertDemoFloor(tx as unknown as Db, restaurantId);
  });
}

/** The demo floor plan: Main hall T1–T8, Terrace T9–T12, Bar B1–B4. */
const DEMO_FLOOR: { area: string; tables: [label: string, seats: number, shape: TableShape, x: number, y: number][] }[] = [
  {
    area: "Main hall",
    tables: [
      ["T1", 2, "square", 1, 1], ["T2", 4, "square", 5, 1], ["T3", 4, "square", 9, 1], ["T4", 6, "square", 13, 1],
      ["T5", 2, "square", 1, 6], ["T6", 4, "round", 5, 6], ["T7", 4, "round", 9, 6], ["T8", 8, "square", 13, 6],
    ],
  },
  { area: "Terrace", tables: [["T9", 4, "round", 2, 2], ["T10", 4, "round", 7, 2], ["T11", 4, "round", 12, 2], ["T12", 6, "square", 17, 2]] },
  { area: "Bar", tables: [["B1", 2, "round", 2, 3], ["B2", 2, "round", 6, 3], ["B3", 2, "round", 10, 3], ["B4", 2, "round", 14, 3]] },
];

export function insertDemoFloor(db: Db, restaurantId: string): void {
  DEMO_FLOOR.forEach(({ area, tables }, i) => {
    const areaId = randomUUID();
    db.insert(floorAreas).values({ id: areaId, restaurantId, name: area, sortOrder: i }).run();
    db.insert(diningTables)
      .values(tables.map(([label, seats, shape, x, y]) => ({ id: randomUUID(), restaurantId, areaId, label, seats, shape, x, y })))
      .run();
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
