// Multi-branch: registry, adoption of an older install, branch creation, head office logins.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "@/db/client";
import { openControlDatabase, type ControlDb } from "@/db/control-client";
import { menuItems, orders, restaurants } from "@/db/schema";
import { seedDemoData } from "@/db/seed";
import { checkPin, listSignInTiles } from "@/lib/auth/service";
import { branchDay, checkHqLogin, claimHeadOffice, createHqSession, deleteHqSession, findHqSessionUser, hasHqUsers, setupBusiness } from "@/lib/hq/service";
import { cedis } from "@/lib/money";
import { saveOrder } from "@/lib/orders/service";
import { takePayment } from "@/lib/payments/service";
import {
  DEMO_HQ,
  branchFiles,
  createBranch,
  initialiseControl,
  isValidSlug,
  listBranches,
  needsSetup,
  setBranchActive,
  slugify,
  type Branch,
} from "./registry";

let dataDir: string;
let control: ControlDb;
const open = new Map<string, Db>();
const openBranch = (b: Branch) => {
  if (!open.has(b.id)) open.set(b.id, openDatabase(branchFiles(dataDir, b).dbFile));
  return open.get(b.id)!;
};

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "enyo-tenancy-"));
  control = openControlDatabase(path.join(dataDir, "control.db"));
});

afterEach(() => {
  for (const db of open.values()) db.$client.close();
  open.clear();
  control.$client.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("addresses", () => {
  it("turns names into branch addresses and refuses reserved ones", () => {
    expect(slugify("Chez Accra – Osu!")).toBe("chez-accra-osu");
    expect(slugify("Kɔkɔɔ Café")).toBe("k-k-cafe");
    expect(isValidSlug("osu")).toBe(true);
    for (const bad of ["hq", "www", "-osu", "osu-", "Osu", "o", "a".repeat(33), "osu_east"]) expect(isValidSlug(bad)).toBe(false);
  });
});

describe("first start-up", () => {
  it("adopts an older single-restaurant database as the first branch, without moving it", () => {
    const legacyFile = path.join(dataDir, "enyo.db");
    const legacy = openDatabase(legacyFile);
    seedDemoData(legacy);
    legacy.$client.close();

    expect(initialiseControl(control, dataDir, { legacyDbFile: legacyFile, seedDemo: false })).toBe("adopted");
    const [branch] = listBranches(control);
    expect(branch).toMatchObject({ id: "chez-accra", slug: "chez-accra", name: "Chez Accra", dbPath: "enyo.db", active: true });
    expect(branchFiles(dataDir, branch).dbFile).toBe(legacyFile);
    expect(listSignInTiles(openBranch(branch))).toHaveLength(7); // staff and PINs untouched
    expect(hasHqUsers(control)).toBe(false); // the owner claims head office later
    expect(initialiseControl(control, dataDir, { legacyDbFile: legacyFile, seedDemo: false })).toBe("ready");
  });

  it("creates the demo business with two branches, each with its own database", () => {
    expect(initialiseControl(control, dataDir, { legacyDbFile: path.join(dataDir, "none.db"), seedDemo: true })).toBe("demo");
    const all = listBranches(control);
    expect(all.map((b) => b.slug)).toEqual(["osu", "accra-mall"]);
    expect(new Set(all.map((b) => branchFiles(dataDir, b).dbFile)).size).toBe(2);
    expect(listSignInTiles(openBranch(all[1]))).toHaveLength(7);
  });

  it("leaves a brand-new install empty for setup", () => {
    expect(initialiseControl(control, dataDir, { legacyDbFile: path.join(dataDir, "none.db"), seedDemo: false })).toBe("needs-setup");
    expect(needsSetup(control)).toBe(true);
  });
});

describe("branches are separate", () => {
  it("keeps each branch's orders, staff and menu in its own database", () => {
    initialiseControl(control, dataDir, { legacyDbFile: "", seedDemo: true });
    const [osu, mall] = listBranches(control).map(openBranch);
    const sale = saveOrder(osu, { id: "staff-efua", restaurantId: "chez-accra" }, {
      orderId: null,
      version: null,
      type: "takeaway",
      tableLabel: "",
      customerName: "",
      lines: [{ menuItemId: "sobolo", quantity: 2, note: "" }],
      send: true,
    });
    expect(sale.ok).toBe(true);
    expect(osu.select().from(orders).all()).toHaveLength(1);
    expect(mall.select().from(orders).all()).toHaveLength(0);
    mall.update(menuItems).set({ price: cedis(25) }).where(eq(menuItems.id, "sobolo")).run();
    expect(osu.select({ price: menuItems.price }).from(menuItems).where(eq(menuItems.id, "sobolo")).get()?.price).toBe(cedis(20));
  });
});

describe("creating a branch", () => {
  beforeEach(() => {
    initialiseControl(control, dataDir, { legacyDbFile: "", seedDemo: true });
  });

  it("makes a new database with its branch owner, and lists it", async () => {
    const result = await createBranch(control, dataDir, { name: "Chez Accra Tema", slug: "tema", leadName: "Kojo Mensah", pin: "8080", menu: { kind: "empty" } }, openBranch);
    if (!result.ok) throw new Error(result.error);
    const db = openBranch(result.branch);
    expect(db.select({ id: restaurants.id, name: restaurants.name }).from(restaurants).get()).toEqual({ id: result.branch.id, name: "Chez Accra Tema" });
    const [lead] = listSignInTiles(db);
    expect(lead).toMatchObject({ name: "Kojo Mensah", label: "Branch lead" });
    expect((await checkPin(db, lead.id, "8080")).ok).toBe(true);
    expect(db.select().from(menuItems).all()).toHaveLength(0);
    expect(listBranches(control).map((b) => b.slug)).toEqual(["osu", "accra-mall", "tema"]);
  });

  it("can start from the sample menu or copy another branch's menu", async () => {
    const osu = listBranches(control)[0];
    openBranch(osu).update(menuItems).set({ archived: true }).where(eq(menuItems.id, "malt")).run();
    const copy = await createBranch(control, dataDir, { name: "Tema", slug: "tema", leadName: "Kojo", pin: "8080", menu: { kind: "copy", fromBranchId: osu.id } }, openBranch);
    if (!copy.ok) throw new Error(copy.error);
    const copied = openBranch(copy.branch).select().from(menuItems).all();
    expect(copied).toHaveLength(15); // archived Malt drink isn't copied
    expect(copied.every((i) => i.restaurantId === copy.branch.id)).toBe(true);

    const sample = await createBranch(control, dataDir, { name: "Kumasi", slug: "kumasi", leadName: "Yaa", pin: "8080", menu: { kind: "sample" } }, openBranch);
    expect(sample.ok && openBranch(sample.branch).select().from(menuItems).all().length).toBe(16);
  });

  it("checks the name, address and PIN", async () => {
    const base = { name: "Tema", slug: "tema", leadName: "Kojo", pin: "8080", menu: { kind: "empty" as const } };
    expect((await createBranch(control, dataDir, { ...base, slug: "osu" }, openBranch)).ok).toBe(false);
    expect((await createBranch(control, dataDir, { ...base, slug: "hq" }, openBranch)).ok).toBe(false);
    expect((await createBranch(control, dataDir, { ...base, pin: "12" }, openBranch)).ok).toBe(false);
    expect((await createBranch(control, dataDir, { ...base, name: " " }, openBranch)).ok).toBe(false);
  });

  it("deactivates branches but never the last open one", () => {
    const [osu, mall] = listBranches(control);
    expect(setBranchActive(control, osu.id, false).ok).toBe(true);
    expect(setBranchActive(control, mall.id, false)).toEqual({ ok: false, error: "This is the only open branch." });
  });
});

describe("head office logins", () => {
  beforeEach(() => {
    initialiseControl(control, dataDir, { legacyDbFile: "", seedDemo: true });
  });

  it("signs in with email and password, any capitalisation of the email", async () => {
    const result = await checkHqLogin(control, "  OWNER@ChezAccra.test ", DEMO_HQ.password);
    expect(result.ok).toBe(true);
    const { token } = createHqSession(control, (result as { userId: string }).userId);
    expect(findHqSessionUser(control, token)?.email).toBe(DEMO_HQ.email);
    deleteHqSession(control, token);
    expect(findHqSessionUser(control, token)).toBeNull();
  });

  it("gives unknown emails and wrong passwords the same answer, and locks after 5 wrong tries", async () => {
    expect(await checkHqLogin(control, "nobody@example.com", "whatever-password")).toMatchObject({ ok: false, error: "Wrong email or password." });
    const now = new Date("2026-10-16T09:00:00Z");
    for (let i = 0; i < 4; i++) expect((await checkHqLogin(control, DEMO_HQ.email, "wrong-password", now)).ok).toBe(false);
    expect(await checkHqLogin(control, DEMO_HQ.email, "wrong-password", now)).toMatchObject({ reason: "locked" });
    expect(await checkHqLogin(control, DEMO_HQ.email, DEMO_HQ.password, new Date(now.getTime() + 60_000))).toMatchObject({ reason: "locked" });
    expect((await checkHqLogin(control, DEMO_HQ.email, DEMO_HQ.password, new Date(now.getTime() + 16 * 60_000))).ok).toBe(true);
  });

  it("shows head office each branch's day, from that branch's own database", () => {
    const osu = openBranch(listBranches(control)[0]);
    const sale = saveOrder(osu, { id: "staff-efua", restaurantId: "chez-accra" }, {
      orderId: null,
      version: null,
      type: "takeaway",
      tableLabel: "",
      customerName: "",
      lines: [{ menuItemId: "jollof-chicken", quantity: 1, note: "" }],
      send: true,
    });
    if (!sale.ok) throw new Error(sale.error);
    takePayment(osu, { id: "staff-efua", restaurantId: "chez-accra", role: "cashier" }, sale.order.id, { method: "card", amount: cedis(108) });
    expect(branchDay(osu, "chez-accra")).toEqual({ ordersToday: 1, salesToday: cedis(108), openOrders: 0, activeStaff: 7 });
    expect(branchDay(openBranch(listBranches(control)[1]), "chez-accra-mall").ordersToday).toBe(0);
  });
});

describe("setting up and claiming head office", () => {
  it("sets up a new business, its login and first branch", async () => {
    const result = await setupBusiness(
      control,
      dataDir,
      { businessName: "Buka Group", name: "Yaa Asantewaa", email: "yaa@buka.test", password: "long-enough-pw", branchName: "Buka East Legon", branchSlug: "east-legon", pin: "2468", sampleMenu: true },
      openBranch
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.branch.slug).toBe("east-legon");
    expect(listSignInTiles(openBranch(result.branch))[0]).toMatchObject({ name: "Yaa Asantewaa" });
    expect((await checkHqLogin(control, "yaa@buka.test", "long-enough-pw")).ok).toBe(true);
    expect((await setupBusiness(control, dataDir, { businessName: "Again", name: "X", email: "x@x.test", password: "long-enough-pw", branchName: "Y", branchSlug: "yy", pin: "1111", sampleMenu: false }, openBranch)).ok).toBe(false);
  });

  it("insists on a proper email and a long enough password", async () => {
    const input = { businessName: "Buka", name: "Yaa", email: "not-an-email", password: "long-enough-pw", branchName: "East", branchSlug: "east", pin: "2468", sampleMenu: false };
    expect((await setupBusiness(control, dataDir, input, openBranch)).ok).toBe(false);
    expect((await setupBusiness(control, dataDir, { ...input, email: "y@b.test", password: "short" }, openBranch)).ok).toBe(false);
  });

  it("lets an upgraded install's owner create the head office login with their PIN, once", async () => {
    const legacyFile = path.join(dataDir, "enyo.db");
    const legacy = openDatabase(legacyFile);
    seedDemoData(legacy);
    legacy.$client.close();
    initialiseControl(control, dataDir, { legacyDbFile: legacyFile, seedDemo: false });
    const db = openBranch(listBranches(control)[0]);
    const input = { ownerStaffId: "staff-ama", pin: "1111", name: "Ama Owner", email: "ama@chez.test", password: "long-enough-pw" };

    expect(await claimHeadOffice(control, db, { ...input, ownerStaffId: "staff-kwame", pin: "2222" })).toEqual({ ok: false, error: "Choose one of the branch's owners." });
    expect(await claimHeadOffice(control, db, { ...input, pin: "0000" })).toEqual({ ok: false, error: "Wrong PIN." });
    expect((await claimHeadOffice(control, db, input)).ok).toBe(true);
    expect((await claimHeadOffice(control, db, { ...input, email: "other@chez.test" })).ok).toBe(false);
  });
});
