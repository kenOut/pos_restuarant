// Phase 8 rules: menu, staff, settings and first-time setup.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "@/db/client";
import { menuItems, sessions } from "@/db/schema";
import { DEMO_RESTAURANT_ID, seedDemoData } from "@/db/seed";
import { checkPin, createSession, findSessionStaff, listSignInTiles } from "@/lib/auth/service";
import { cedis } from "@/lib/money";
import {
  createCategory,
  createItem,
  deleteCategory,
  listCategories,
  listMenuAdmin,
  moveCategory,
  removeItem,
  renameCategory,
  restoreItem,
  setItemAvailable,
  updateItem,
} from "@/lib/menu/service";
import { listMenu, listOpenOrders, saveOrder } from "@/lib/orders/service";
import { getPaymentView, setDiscount, takePayment } from "@/lib/payments/service";
import { getSettings, removeLogo, setLogo, updateBusiness, updateDiscountApproval, updateTaxes } from "@/lib/settings/service";
import { createStaff, listStaff, resetPin, setStaffActive, unlockStaff, updateStaff } from "@/lib/staff/service";
import { DEFAULT_TAX_CONFIG } from "@/lib/tax-config";

const R = DEMO_RESTAURANT_ID;
const OWNER = { id: "staff-ama", restaurantId: R, role: "owner" as const };
const MANAGER = { id: "staff-kwame", restaurantId: R, role: "manager" as const };
const CASHIER = { id: "staff-efua", restaurantId: R, role: "cashier" as const };
let db: Db;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDemoData(db);
});

function order(lines: { menuItemId: string; quantity: number }[], send = true) {
  const result = saveOrder(db, CASHIER, {
    orderId: null,
    version: null,
    type: "takeaway",
    tableLabel: "",
    customerName: "",
    lines: lines.map((l) => ({ ...l, note: "" })),
    send,
  });
  if (!result.ok) throw new Error(result.error);
  return result.order;
}

describe("menu", () => {
  it("has the demo's five categories in order", () => {
    expect(listCategories(db, R).map((c) => [c.name, c.itemCount])).toEqual([
      ["Starters", 3],
      ["Mains", 5],
      ["Grills", 2],
      ["Drinks", 5],
      ["Desserts", 1],
    ]);
  });

  it("adds a dish to a category and shows it on the till", () => {
    const result = createItem(db, MANAGER, { name: " Kontomire  stew ", category: "Mains", station: "Kitchen", price: cedis(75) });
    expect(result.ok).toBe(true);
    const till = listMenu(db, R);
    const stew = till.find((m) => m.name === "Kontomire stew")!;
    expect(stew).toMatchObject({ category: "Mains", price: cedis(75), available: true });
    // Mains come before Grills on the till
    expect(till.findIndex((m) => m.name === "Kontomire stew")).toBeLessThan(till.findIndex((m) => m.name === "Beef suya"));
  });

  it("checks names, prices, stations, categories and duplicates", () => {
    const base = { name: "Tea", category: "Drinks", station: "Bar" as const, price: cedis(5) };
    expect(createItem(db, MANAGER, { ...base, name: " " }).ok).toBe(false);
    expect(createItem(db, MANAGER, { ...base, price: 0 }).ok).toBe(false);
    expect(createItem(db, MANAGER, { ...base, price: 1.5 }).ok).toBe(false);
    expect(createItem(db, MANAGER, { ...base, station: "Oven" as never }).ok).toBe(false);
    expect(createItem(db, MANAGER, { ...base, category: "Breakfast" }).ok).toBe(false);
    expect(createItem(db, MANAGER, { ...base, name: "sobolo" })).toEqual({ ok: false, error: "sobolo is already on the menu." });
  });

  it("is managed by owners and managers only", () => {
    expect(createItem(db, CASHIER, { name: "Tea", category: "Drinks", station: "Bar", price: cedis(5) })).toEqual({
      ok: false,
      error: "Only owners and managers can change the menu.",
    });
    expect(setItemAvailable(db, CASHIER, "sobolo", false).ok).toBe(false);
  });

  it("edits a dish without changing orders already taken", () => {
    const taken = order([{ menuItemId: "sobolo", quantity: 2 }]);
    expect(updateItem(db, MANAGER, "sobolo", { name: "Sobolo (large)", category: "Drinks", station: "Bar", price: cedis(25) }).ok).toBe(true);
    expect(listMenu(db, R).find((m) => m.id === "sobolo")).toMatchObject({ name: "Sobolo (large)", price: cedis(25) });
    expect(getPaymentView(db, R, taken.id)!.lines[0]).toMatchObject({ name: "Sobolo", unitPrice: cedis(20) });
  });

  it("marks dishes sold out and back", () => {
    expect(setItemAvailable(db, MANAGER, "kelewele", false).ok).toBe(true);
    expect(saveOrder(db, CASHIER, { orderId: null, version: null, type: "takeaway", tableLabel: "", customerName: "", lines: [{ menuItemId: "kelewele", quantity: 1, note: "" }], send: false })).toEqual({
      ok: false,
      error: "Kelewele is sold out.",
    });
    setItemAvailable(db, MANAGER, "kelewele", true);
    expect(listMenu(db, R).find((m) => m.id === "kelewele")?.available).toBe(true);
  });

  it("deletes a dish nobody has ordered, and archives one that has been", () => {
    const tea = createItem(db, MANAGER, { name: "Tea", category: "Drinks", station: "Bar", price: cedis(5) });
    if (!tea.ok) throw new Error(tea.error);
    expect(removeItem(db, MANAGER, tea.id)).toEqual({ ok: true, archived: false });
    expect(db.select().from(menuItems).where(eq(menuItems.id, tea.id)).get()).toBeUndefined();

    const taken = order([{ menuItemId: "malt", quantity: 1 }]);
    expect(removeItem(db, MANAGER, "malt")).toEqual({ ok: true, archived: true });
    expect(listMenu(db, R).some((m) => m.id === "malt")).toBe(false);
    expect(getPaymentView(db, R, taken.id)!.lines[0].name).toBe("Malt drink");
    expect(saveOrder(db, CASHIER, { orderId: null, version: null, type: "takeaway", tableLabel: "", customerName: "", lines: [{ menuItemId: "malt", quantity: 1, note: "" }], send: false }).ok).toBe(false);

    expect(restoreItem(db, MANAGER, "malt").ok).toBe(true);
    expect(listMenu(db, R).some((m) => m.id === "malt")).toBe(true);
  });

  it("renames, reorders and removes categories", () => {
    expect(createCategory(db, MANAGER, "Breakfast").ok).toBe(true);
    expect(createCategory(db, MANAGER, "Breakfast")).toEqual({ ok: false, error: "There's already a category called Breakfast." });

    const drinks = listCategories(db, R).find((c) => c.name === "Drinks")!;
    expect(renameCategory(db, MANAGER, drinks.id, "Drinks & juices").ok).toBe(true);
    expect(listMenuAdmin(db, R).find((i) => i.id === "sobolo")?.category).toBe("Drinks & juices");

    moveCategory(db, MANAGER, drinks.id, -1);
    expect(listCategories(db, R).map((c) => c.name).slice(0, 4)).toEqual(["Starters", "Mains", "Drinks & juices", "Grills"]);

    expect(deleteCategory(db, MANAGER, drinks.id)).toEqual({ ok: false, error: "Move or remove the dishes in this category first." });
    const breakfast = listCategories(db, R).find((c) => c.name === "Breakfast")!;
    expect(deleteCategory(db, MANAGER, breakfast.id).ok).toBe(true);
  });
});

describe("staff", () => {
  it("adds someone who can then sign in with their PIN", async () => {
    const result = await createStaff(db, MANAGER, { name: "Esi Mensah", role: "server", jobTitle: "Head server" }, "9090");
    if (!result.ok) throw new Error(result.error);
    expect(listSignInTiles(db).find((t) => t.id === result.id)).toMatchObject({ name: "Esi Mensah", initials: "EM", label: "Head server" });
    expect((await checkPin(db, result.id, "9090")).ok).toBe(true);
  });

  it("lets managers manage front-of-house and kitchen staff, but not owners or other managers", async () => {
    expect((await createStaff(db, MANAGER, { name: "New Boss", role: "manager" }, "1212")).ok).toBe(false);
    expect((await createStaff(db, MANAGER, { name: "Cook", role: "kitchen" }, "1212")).ok).toBe(true);
    expect(updateStaff(db, MANAGER, "staff-ama", { name: "Ama", role: "owner" }).ok).toBe(false);
    expect(updateStaff(db, MANAGER, "staff-efua", { name: "Efua M.", role: "manager" }).ok).toBe(false);
    expect((await createStaff(db, OWNER, { name: "New Boss", role: "manager" }, "1212")).ok).toBe(true);
    expect((await createStaff(db, CASHIER, { name: "Friend", role: "server" }, "1212")).ok).toBe(false);
  });

  it("checks the PIN and the name", async () => {
    expect(await createStaff(db, OWNER, { name: "Pat", role: "server" }, "12")).toEqual({ ok: false, error: "The PIN must be 4 digits." });
    expect((await createStaff(db, OWNER, { name: " ", role: "server" }, "1234")).ok).toBe(false);
  });

  it("deactivating someone signs them out everywhere and hides them from sign-in", () => {
    const { token } = createSession(db, "staff-kofi");
    expect(setStaffActive(db, MANAGER, "staff-kofi", false).ok).toBe(true);
    expect(findSessionStaff(db, token)).toBeNull();
    expect(db.select().from(sessions).where(eq(sessions.staffId, "staff-kofi")).all()).toHaveLength(0);
    expect(listSignInTiles(db).some((t) => t.id === "staff-kofi")).toBe(false);
    expect(setStaffActive(db, MANAGER, "staff-kofi", true).ok).toBe(true);
  });

  it("never leaves the restaurant without an owner, and nobody deactivates themselves", () => {
    expect(setStaffActive(db, OWNER, "staff-ama", false)).toEqual({ ok: false, error: "You can't deactivate yourself." });
    expect(updateStaff(db, OWNER, "staff-ama", { name: "Ama Owner", role: "manager" })).toEqual({ ok: false, error: "This is the only owner. Add another owner first." });
  });

  it("resets a PIN, which also clears a lockout; unlock clears it without a new PIN", async () => {
    for (let i = 0; i < 5; i++) await checkPin(db, "staff-efua", "0000");
    expect(listStaff(db, R).find((s) => s.id === "staff-efua")?.lockedUntil).not.toBeNull();
    expect(unlockStaff(db, MANAGER, "staff-efua").ok).toBe(true);
    expect((await checkPin(db, "staff-efua", "4444")).ok).toBe(true);

    expect((await resetPin(db, MANAGER, "staff-efua", "5050")).ok).toBe(true);
    expect((await checkPin(db, "staff-efua", "4444")).ok).toBe(false);
    expect((await checkPin(db, "staff-efua", "5050")).ok).toBe(true);
  });
});

describe("settings", () => {
  it("changes the name and receipt footer (owners and managers)", () => {
    expect(updateBusiness(db, MANAGER, { name: "Chez Accra Osu", receiptFooter: "Akwaaba! Come again." }).ok).toBe(true);
    expect(getSettings(db, R)).toMatchObject({ name: "Chez Accra Osu", receiptFooter: "Akwaaba! Come again." });
    expect(updateBusiness(db, CASHIER, { name: "Mine", receiptFooter: "" }).ok).toBe(false);
  });

  it("lets only owners change taxes, and new orders use them", () => {
    const config = { ...DEFAULT_TAX_CONFIG, taxes: DEFAULT_TAX_CONFIG.taxes.map((t) => (t.id === "getfund" ? { ...t, charge: false } : t)) };
    expect(updateTaxes(db, MANAGER, config)).toEqual({ ok: false, error: "Only an owner can change taxes." });
    expect(updateTaxes(db, OWNER, config).ok).toBe(true);
    order([{ menuItemId: "sobolo", quantity: 5 }]); // 100.00 + 15% + 2.5%
    expect(listOpenOrders(db, R)[0].total).toBe(cedis(117.5));
  });

  it("rejects silly tax rates", () => {
    const config = { ...DEFAULT_TAX_CONFIG, taxes: DEFAULT_TAX_CONFIG.taxes.map((t) => (t.id === "vat" ? { ...t, rateBp: 9000 } : t)) };
    expect(updateTaxes(db, OWNER, config).ok).toBe(false);
  });

  it("keeps a paid order's taxes when the rates change later", () => {
    const paid = order([{ menuItemId: "sobolo", quantity: 5 }]);
    takePayment(db, CASHIER, paid.id, { method: "card", amount: cedis(120) });
    updateTaxes(db, OWNER, { ...DEFAULT_TAX_CONFIG, vatRegistered: false });
    const view = getPaymentView(db, R, paid.id)!;
    expect(view.bill.total).toBe(cedis(120));
    expect(view.bill.taxes.map((t) => t.amount)).toEqual([cedis(15), cedis(2.5), cedis(2.5)]);
  });

  it("can let cashiers give discounts without a manager", async () => {
    const o = order([{ menuItemId: "sobolo", quantity: 5 }]);
    const discount = { kind: "amount" as const, value: cedis(10), reason: "Regular" };
    expect((await setDiscount(db, CASHIER, o.id, discount, null)).ok).toBe(false);
    updateDiscountApproval(db, MANAGER, false);
    expect((await setDiscount(db, CASHIER, o.id, discount, null)).ok).toBe(true);
  });

  it("accepts PNG, JPEG and WebP logos by their contents, and nothing else", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "enyo-logo-"));
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    expect(setLogo(db, MANAGER, dir, png).ok).toBe(true);
    const first = getSettings(db, R)!.logoFile!;
    expect(first).toMatch(/^logo-[0-9a-f]{16}\.png$/);
    expect(fs.existsSync(path.join(dir, first))).toBe(true);

    const svg = new TextEncoder().encode("<svg onload=alert(1)></svg>");
    expect(setLogo(db, MANAGER, dir, svg)).toEqual({ ok: false, error: "The logo must be a PNG, JPEG or WebP image." });
    expect(setLogo(db, MANAGER, dir, new Uint8Array(2 * 1024 * 1024).fill(0xff)).ok).toBe(false);

    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9]);
    expect(setLogo(db, MANAGER, dir, jpeg).ok).toBe(true);
    expect(fs.existsSync(path.join(dir, first))).toBe(false); // old one removed
    expect(removeLogo(db, MANAGER, dir).ok).toBe(true);
    expect(getSettings(db, R)!.logoFile).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
