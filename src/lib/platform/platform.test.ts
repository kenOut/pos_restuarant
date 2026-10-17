import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/db/client";
import { openControlDatabase, type ControlDb } from "@/db/control-client";
import { openPlatformDatabase, type PlatformDb } from "@/db/platform-client";
import { businesses, platformAdmins } from "@/db/platform-schema";
import { setupBusiness } from "@/lib/hq/service";
import { branchFiles, initialiseControl, type Branch } from "@/lib/tenancy/registry";
import {
  checkAdminLogin,
  checkSetupCode,
  clearSetupCode,
  createAdminSession,
  createBusiness,
  createFirstAdmin,
  deleteAdminSession,
  findAdmin,
  hasAdmins,
  isBusinessSlug,
  listBusinesses,
  renewSetupCode,
  setBusinessActive,
} from "./service";

let dir: string;
let platform: PlatformDb;
const controls = new Map<string, ControlDb>();

/** Each business in its own folder, as on ENYO Online. */
function controlFor(businessId: string): ControlDb {
  if (!controls.has(businessId)) {
    const tenantDir = path.join(dir, "businesses", businessId);
    fs.mkdirSync(tenantDir, { recursive: true });
    const control = openControlDatabase(path.join(tenantDir, "control.db"));
    initialiseControl(control, tenantDir, { legacyDbFile: null, seedDemo: false });
    controls.set(businessId, control);
  }
  return controls.get(businessId)!;
}
const openBranchIn = (businessId: string) => (b: Branch) => openDatabase(branchFiles(path.join(dir, "businesses", businessId), b).dbFile);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "enyo-platform-"));
  platform = openPlatformDatabase(path.join(dir, "platform.db"));
});
afterEach(() => {
  for (const c of controls.values()) c.$client.close();
  controls.clear();
  platform.$client.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("client businesses", () => {
  it("are added with an address and a one-time setup code", () => {
    const result = createBusiness(platform, { name: "Mama Akos Grill", slug: "mamaakos" });
    if (!result.ok) throw new Error(result.error);
    expect(result.setupCode).toMatch(/^[\w-]{24}$/);
    const row = platform.select().from(businesses).get()!;
    expect(JSON.stringify(row)).not.toContain(result.setupCode); // only a hash is kept
    expect(createBusiness(platform, { name: "Copy", slug: "mamaakos" })).toEqual({ ok: false, error: "The address mamaakos is already taken." });
  });

  it("refuse addresses ENYO Online uses itself", () => {
    for (const slug of ["admin", "c", "api", "hq", "a", "-x", "Upper"]) expect(isBusinessSlug(slug)).toBe(false);
    expect(isBusinessSlug("kofi-chop-bar")).toBe(true);
  });

  it("check setup codes, which expire, can be renewed, and stop once used", () => {
    const now = new Date("2026-10-17T09:00:00Z");
    const created = createBusiness(platform, { name: "Buka", slug: "buka" }, now);
    if (!created.ok) throw new Error(created.error);
    expect(checkSetupCode(platform, "buka", created.setupCode, now)).toBe(true);
    expect(checkSetupCode(platform, "buka", "wrong", now)).toBe(false);
    expect(checkSetupCode(platform, "other", created.setupCode, now)).toBe(false);
    expect(checkSetupCode(platform, "buka", created.setupCode, new Date("2026-11-01T09:00:00Z"))).toBe(false); // after 14 days

    const renewed = renewSetupCode(platform, created.business.id, false, now);
    if (!renewed.ok) throw new Error(renewed.error);
    expect(checkSetupCode(platform, "buka", created.setupCode, now)).toBe(false); // the old link stops
    expect(checkSetupCode(platform, "buka", renewed.setupCode, now)).toBe(true);
    expect(renewSetupCode(platform, created.business.id, true).ok).toBe(false); // already set up

    clearSetupCode(platform, "buka");
    expect(checkSetupCode(platform, "buka", renewed.setupCode, now)).toBe(false);
  });

  it("are listed with status and branch names only, each from its own folder", async () => {
    const a = createBusiness(platform, { name: "Mama Akos", slug: "mamaakos" });
    const b = createBusiness(platform, { name: "Buka", slug: "buka" });
    if (!a.ok || !b.ok) throw new Error("create");
    const setup = await setupBusiness(
      controlFor(a.business.id),
      path.join(dir, "businesses", a.business.id),
      { businessName: "Mama Akos", name: "Ama", email: "ama@akos.test", password: "long-enough-pw", branchName: "Spintex", branchSlug: "spintex", pin: "2468", sampleMenu: false },
      openBranchIn(a.business.id)
    );
    expect(setup.ok).toBe(true);
    const list = listBusinesses(platform, (x) => controlFor(x.id));
    expect(list.map((x) => [x.slug, x.setUp, x.branches.map((br) => br.name)])).toEqual([
      ["buka", false, []],
      ["mamaakos", true, ["Spintex"]],
    ]);
    // Each business's branches live in its own folder.
    expect(fs.existsSync(path.join(dir, "businesses", a.business.id, "control.db"))).toBe(true);
    expect(fs.readdirSync(path.join(dir, "businesses", b.business.id))).not.toContain("branches");
  });

  it("can be suspended and reactivated", () => {
    const created = createBusiness(platform, { name: "Buka", slug: "buka" });
    if (!created.ok) throw new Error(created.error);
    expect(setBusinessActive(platform, created.business.id, false)).toEqual({ ok: true });
    expect(platform.select({ active: businesses.active }).from(businesses).where(eq(businesses.id, created.business.id)).get()?.active).toBe(false);
    expect(setBusinessActive(platform, "nope", true).ok).toBe(false);
  });
});

describe("the seller's sign-in", () => {
  it("is created once, only with the server's setup code", async () => {
    const input = { code: "server-secret", name: "Nelikem", email: "seller@enyo.test", password: "a-long-password" };
    expect((await createFirstAdmin(platform, undefined, input)).ok).toBe(false);
    expect((await createFirstAdmin(platform, "server-secret", { ...input, code: "guess" })).ok).toBe(false);
    expect((await createFirstAdmin(platform, "server-secret", { ...input, password: "short" })).ok).toBe(false);
    expect((await createFirstAdmin(platform, "server-secret", input)).ok).toBe(true);
    expect(hasAdmins(platform)).toBe(true);
    expect((await createFirstAdmin(platform, "server-secret", input)).ok).toBe(false);
    expect(JSON.stringify(platform.select().from(platformAdmins).get())).not.toContain("a-long-password");
  });

  it("checks passwords, locks after five wrong ones, and runs sessions", async () => {
    await createFirstAdmin(platform, "s", { code: "s", name: "N", email: "seller@enyo.test", password: "a-long-password" });
    const now = new Date();
    expect((await checkAdminLogin(platform, "SELLER@enyo.test", "a-long-password", now)).ok).toBe(true);
    expect((await checkAdminLogin(platform, "nobody@enyo.test", "a-long-password", now)).ok).toBe(false);
    for (let i = 0; i < 5; i++) await checkAdminLogin(platform, "seller@enyo.test", "wrong-password", now);
    expect(await checkAdminLogin(platform, "seller@enyo.test", "a-long-password", now)).toEqual({ ok: false, error: "Too many wrong passwords. Try again in 15 minutes." });

    const adminId = platform.select().from(platformAdmins).get()!.id;
    const { token } = createAdminSession(platform, adminId);
    expect(findAdmin(platform, token)?.email).toBe("seller@enyo.test");
    deleteAdminSession(platform, token);
    expect(findAdmin(platform, token)).toBeNull();
  });
});
