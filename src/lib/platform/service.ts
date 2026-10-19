// ENYO Online's seller side: the client businesses on this server, their
// one-time setup links, and the seller's own sign-ins. No client's sales data
// is read here: only names, addresses, status and branch counts.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, asc, eq, gt, lte, sql } from "drizzle-orm";
import type { ControlDb } from "@/db/control-client";
import { syncPeers } from "@/db/control-schema";
import type { PlatformDb } from "@/db/platform-client";
import { businesses, platformAdmins, platformSessions, type Business } from "@/db/platform-schema";
import { listBranches, needsSetup } from "@/lib/tenancy/registry";
import { isValidSlug, slugify } from "@/lib/tenancy/slug";

export const ADMIN_PASSWORD_MIN = 12;
export const SETUP_LINK_DAYS = 14;
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60 * 1000;
const SESSION_MS = 12 * 60 * 60 * 1000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Addresses ENYO Online uses itself. */
const RESERVED = new Set(["admin", "c", "api", "www", "hq", "app", "login", "setup", "static", "assets", "enyo"]);

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");

export const isBusinessSlug = (slug: string) => isValidSlug(slug) && !RESERVED.has(slug);
export { slugify };

function newSetupCode(now: Date) {
  const code = randomBytes(18).toString("base64url");
  return { code, hash: sha(code), expiresAt: new Date(now.getTime() + SETUP_LINK_DAYS * 86_400_000) };
}

/** Adds a client business. The returned setup code is the only time it's available. */
export function createBusiness(platform: PlatformDb, input: { name: string; slug: string }, now = new Date()): { ok: true; business: Business; setupCode: string } | Fail {
  const name = clean(input?.name, 60);
  const slug = clean(input?.slug, 32).toLowerCase();
  if (!name) return fail("Enter the client's business name.");
  if (!isBusinessSlug(slug)) return fail("Use 2–32 lower-case letters, numbers and dashes for the address, e.g. mamaakos.");
  if (platform.select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, slug)).get()) return fail(`The address ${slug} is already taken.`);
  const id = randomUUID();
  const setup = newSetupCode(now);
  platform.insert(businesses).values({ id, slug, name, setupCodeHash: setup.hash, setupCodeExpiresAt: setup.expiresAt, createdAt: now }).run();
  return { ok: true, business: platform.select().from(businesses).where(eq(businesses.id, id)).get()!, setupCode: setup.code };
}

/** A fresh setup link for a business that hasn't been set up yet (the old one stops working). */
export function renewSetupCode(platform: PlatformDb, businessId: string, isSetUp: boolean, now = new Date()): { ok: true; setupCode: string } | Fail {
  const business = platform.select().from(businesses).where(eq(businesses.id, String(businessId))).get();
  if (!business) return fail("That business no longer exists.");
  if (isSetUp) return fail("This business is already set up. Its owners sign in at its head office.");
  const setup = newSetupCode(now);
  platform.update(businesses).set({ setupCodeHash: setup.hash, setupCodeExpiresAt: setup.expiresAt }).where(eq(businesses.id, business.id)).run();
  return { ok: true, setupCode: setup.code };
}

/** Whether a setup code is the current, unexpired one for this business. */
export function checkSetupCode(platform: PlatformDb, slug: string, code: string, now = new Date()): boolean {
  const business = platform.select().from(businesses).where(eq(businesses.slug, slug)).get();
  if (!business?.setupCodeHash || !business.setupCodeExpiresAt || business.setupCodeExpiresAt <= now || typeof code !== "string" || !code) return false;
  const a = Buffer.from(sha(code));
  const b = Buffer.from(business.setupCodeHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Once a business is set up, its setup link stops working. */
export function clearSetupCode(platform: PlatformDb, slug: string): void {
  platform.update(businesses).set({ setupCodeHash: null, setupCodeExpiresAt: null }).where(eq(businesses.slug, slug)).run();
}

export function setBusinessActive(platform: PlatformDb, businessId: string, active: boolean): { ok: true } | Fail {
  const business = platform.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, String(businessId))).get();
  if (!business) return fail("That business no longer exists.");
  platform.update(businesses).set({ active }).where(eq(businesses.id, business.id)).run();
  return { ok: true };
}

export type BusinessOverview = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  createdAt: number;
  setUp: boolean;
  setupLinkExpiresAt: number | null;
  branches: { name: string; active: boolean }[];
  /** When its restaurant computer last synced; null if none is connected. */
  restaurantComputerContactAt: number | null;
  restaurantComputerPaired: boolean;
};

/** Every business with its status and branch names. `openControl` opens a business's head office database. */
export function listBusinesses(platform: PlatformDb, openControl: (business: Business) => ControlDb): BusinessOverview[] {
  return platform
    .select()
    .from(businesses)
    .orderBy(asc(businesses.name))
    .all()
    .map((b) => {
      const control = openControl(b);
      const peer = control.select().from(syncPeers).get();
      return {
        id: b.id,
        slug: b.slug,
        name: b.name,
        active: b.active,
        createdAt: b.createdAt.getTime(),
        setUp: !needsSetup(control),
        setupLinkExpiresAt: b.setupCodeExpiresAt?.getTime() ?? null,
        branches: listBranches(control).map((x) => ({ name: x.name, active: x.active })),
        restaurantComputerContactAt: peer?.lastContactAt?.getTime() ?? null,
        restaurantComputerPaired: !!peer,
      };
    });
}

// ---------- Seller sign-in

export const hasAdmins = (platform: PlatformDb) => !!platform.select({ id: platformAdmins.id }).from(platformAdmins).limit(1).get();

/**
 * The first seller account. Needs the setup code from the server's settings
 * (ENYO_ADMIN_SETUP_CODE), so the first visitor to a new server can't take it.
 */
export async function createFirstAdmin(
  platform: PlatformDb,
  serverCode: string | undefined,
  input: { code: string; name: string; email: string; password: string }
): Promise<{ ok: true; adminId: string } | Fail> {
  if (hasAdmins(platform)) return fail("The seller account already exists. Sign in instead.");
  if (!serverCode) return fail("Set ENYO_ADMIN_SETUP_CODE in the server's settings first.");
  const a = Buffer.from(sha(String(input?.code ?? "")));
  const b = Buffer.from(sha(serverCode));
  if (!timingSafeEqual(a, b)) return fail("That setup code isn't right.");
  const name = clean(input?.name, 60);
  const email = String(input?.email ?? "").trim().toLowerCase();
  if (!name) return fail("Enter your name.");
  if (!EMAIL.test(email)) return fail("Enter a valid email address.");
  if (typeof input.password !== "string" || input.password.length < ADMIN_PASSWORD_MIN) return fail(`Choose a password of at least ${ADMIN_PASSWORD_MIN} characters.`);
  const adminId = randomUUID();
  platform.insert(platformAdmins).values({ id: adminId, name, email, passwordHash: await hash(input.password) }).run();
  return { ok: true, adminId };
}

export async function checkAdminLogin(platform: PlatformDb, rawEmail: string, password: string, now = new Date()): Promise<{ ok: true; adminId: string } | Fail> {
  const email = String(rawEmail ?? "").trim().toLowerCase();
  const admin = platform.select().from(platformAdmins).where(eq(platformAdmins.email, email)).get();
  const wrong = fail("Wrong email or password.");
  if (!admin) {
    await hash("timing-padding");
    return wrong;
  }
  if (admin.lockedUntil && admin.lockedUntil > now) return fail("Too many wrong passwords. Try again in 15 minutes.");
  if (typeof password === "string" && (await verify(admin.passwordHash, password))) {
    platform.update(platformAdmins).set({ failedAttempts: 0, lockedUntil: null }).where(eq(platformAdmins.id, admin.id)).run();
    return { ok: true, adminId: admin.id };
  }
  const { failed } = platform
    .update(platformAdmins)
    .set({ failedAttempts: admin.lockedUntil ? 1 : sql`${platformAdmins.failedAttempts} + 1`, lockedUntil: null })
    .where(eq(platformAdmins.id, admin.id))
    .returning({ failed: platformAdmins.failedAttempts })
    .get()!;
  if (failed >= LOCK_AFTER) platform.update(platformAdmins).set({ failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MS) }).where(eq(platformAdmins.id, admin.id)).run();
  return wrong;
}

export function createAdminSession(platform: PlatformDb, adminId: string, now = new Date()): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_MS);
  platform.delete(platformSessions).where(lte(platformSessions.expiresAt, now)).run();
  platform.insert(platformSessions).values({ tokenHash: sha(token), adminId, expiresAt }).run();
  return { token, expiresAt };
}

export function findAdmin(platform: PlatformDb, token: string, now = new Date()): { id: string; name: string; email: string } | null {
  return (
    platform
      .select({ id: platformAdmins.id, name: platformAdmins.name, email: platformAdmins.email })
      .from(platformSessions)
      .innerJoin(platformAdmins, eq(platformSessions.adminId, platformAdmins.id))
      .where(and(eq(platformSessions.tokenHash, sha(token)), gt(platformSessions.expiresAt, now)))
      .get() ?? null
  );
}

export function deleteAdminSession(platform: PlatformDb, token: string): void {
  platform.delete(platformSessions).where(eq(platformSessions.tokenHash, sha(token))).run();
}
