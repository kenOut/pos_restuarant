// Head office accounts (email + password), their sessions, first-time setup of
// a new business, and the daily figures head office sees for each branch.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { ControlDb } from "@/db/control-client";
import { hqSessions, hqUsers, organisation } from "@/db/control-schema";
import { orders, staff } from "@/db/schema";
import { checkPin } from "@/lib/auth/service";
import { createBranch, needsSetup, type Branch } from "@/lib/tenancy/registry";

export const PASSWORD_MIN = 10;
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;
export const HQ_SESSION_MS = 12 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });
const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");
const normaliseEmail = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function validAccount(input: { name: string; email: string; password: string }): Fail | { ok: true; name: string; email: string } {
  const name = clean(input?.name, 60);
  const email = normaliseEmail(input?.email);
  if (!name) return fail("Enter your name.");
  if (!EMAIL_PATTERN.test(email)) return fail("Enter a valid email address.");
  if (typeof input.password !== "string" || input.password.length < PASSWORD_MIN) return fail(`Choose a password of at least ${PASSWORD_MIN} characters.`);
  return { ok: true, name, email };
}

export const hasHqUsers = (control: ControlDb) => !!control.select({ id: hqUsers.id }).from(hqUsers).limit(1).get();

export type HqLogin = { ok: true; userId: string } | { ok: false; reason: "invalid" | "locked"; error: string };

/**
 * Checks an email and password. Five wrong passwords in a row lock the
 * account for 15 minutes. Unknown emails get the same answer as wrong
 * passwords, so the form can't be used to find out who has an account.
 */
export async function checkHqLogin(control: ControlDb, rawEmail: string, password: string, now = new Date()): Promise<HqLogin> {
  const user = control.select().from(hqUsers).where(and(eq(hqUsers.email, normaliseEmail(rawEmail)), eq(hqUsers.active, true))).get();
  const wrong: HqLogin = { ok: false, reason: "invalid", error: "Wrong email or password." };
  if (!user) {
    await hash("timing-padding"); // take about as long as a real check
    return wrong;
  }
  if (user.lockedUntil && user.lockedUntil > now) {
    return { ok: false, reason: "locked", error: "Too many wrong passwords. Try again in 15 minutes." };
  }
  if (typeof password === "string" && (await verify(user.passwordHash, password))) {
    control.update(hqUsers).set({ failedAttempts: 0, lockedUntil: null }).where(eq(hqUsers.id, user.id)).run();
    return { ok: true, userId: user.id };
  }
  const { failed } = control
    .update(hqUsers)
    .set({ failedAttempts: user.lockedUntil ? 1 : sql`${hqUsers.failedAttempts} + 1`, lockedUntil: null })
    .where(eq(hqUsers.id, user.id))
    .returning({ failed: hqUsers.failedAttempts })
    .get()!;
  if (failed >= MAX_LOGIN_ATTEMPTS) {
    control.update(hqUsers).set({ failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOGIN_LOCK_MS) }).where(eq(hqUsers.id, user.id)).run();
    return { ok: false, reason: "locked", error: "Too many wrong passwords. Try again in 15 minutes." };
  }
  return wrong;
}

export function createHqSession(control: ControlDb, userId: string, now = new Date()): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + HQ_SESSION_MS);
  control.delete(hqSessions).where(lte(hqSessions.expiresAt, now)).run();
  control.insert(hqSessions).values({ tokenHash: hashToken(token), userId, expiresAt }).run();
  return { token, expiresAt };
}

export type HqSessionUser = { id: string; name: string; email: string };

export function findHqSessionUser(control: ControlDb, token: string, now = new Date()): HqSessionUser | null {
  return (
    control
      .select({ id: hqUsers.id, name: hqUsers.name, email: hqUsers.email })
      .from(hqSessions)
      .innerJoin(hqUsers, eq(hqSessions.userId, hqUsers.id))
      .where(and(eq(hqSessions.tokenHash, hashToken(token)), gt(hqSessions.expiresAt, now), eq(hqUsers.active, true)))
      .get() ?? null
  );
}

export function deleteHqSession(control: ControlDb, token: string): void {
  control.delete(hqSessions).where(eq(hqSessions.tokenHash, hashToken(token))).run();
}

export type BusinessSetupInput = {
  businessName: string;
  name: string;
  email: string;
  password: string;
  branchName: string;
  branchSlug: string;
  pin: string;
  sampleMenu: boolean;
};

/**
 * First-time setup of a brand-new install: the business, the first head
 * office login, and the first branch (with the same person as its branch
 * owner, signing in there with their PIN). Only works while nothing exists.
 */
export async function setupBusiness(
  control: ControlDb,
  dataDir: string,
  input: BusinessSetupInput,
  openBranch: (branch: Branch) => Db
): Promise<{ ok: true; userId: string; branch: Branch } | Fail> {
  if (!needsSetup(control)) return fail("This ENYO POS is already set up. Sign in instead.");
  const businessName = clean(input?.businessName, 60);
  if (!businessName) return fail("Enter the business name.");
  const account = validAccount(input);
  if (!account.ok) return account;

  const passwordHash = await hash(input.password);
  const created = await createBranch(
    control,
    dataDir,
    { name: input.branchName, slug: input.branchSlug, leadName: account.name, pin: input.pin, menu: { kind: input.sampleMenu ? "sample" : "empty" } },
    openBranch
  );
  if (!created.ok) return created;

  const userId = randomUUID();
  control.transaction((tx) => {
    tx.insert(organisation).values({ id: randomUUID(), name: businessName }).run();
    tx.insert(hqUsers).values({ id: userId, name: account.name, email: account.email, passwordHash }).run();
  });
  return { ok: true, userId, branch: created.branch };
}

/**
 * An install upgraded from a single restaurant has branches but no head office
 * login yet. Whoever creates it must prove they're an owner of a branch by
 * entering that owner's PIN; it only works while no head office login exists.
 */
export async function claimHeadOffice(
  control: ControlDb,
  branchDb: Db,
  input: { ownerStaffId: string; pin: string; name: string; email: string; password: string }
): Promise<{ ok: true; userId: string } | Fail> {
  if (hasHqUsers(control)) return fail("Head office already has a login. Sign in instead.");
  const account = validAccount(input);
  if (!account.ok) return account;
  const owner = branchDb.select({ role: staff.role }).from(staff).where(and(eq(staff.id, String(input.ownerStaffId)), eq(staff.active, true))).get();
  if (!owner || owner.role !== "owner") return fail("Choose one of the branch's owners.");
  const check = await checkPin(branchDb, String(input.ownerStaffId), String(input.pin ?? ""));
  if (!check.ok) return fail(check.reason === "locked" ? "That owner is locked out after too many wrong PINs." : "Wrong PIN.");

  const userId = randomUUID();
  control.insert(hqUsers).values({ id: userId, name: account.name, email: account.email, passwordHash: await hash(input.password) }).run();
  return { ok: true, userId };
}

export type BranchDay = { ordersToday: number; salesToday: number; openOrders: number; activeStaff: number };

/** Today's figures for a branch, read from its own database. */
export function branchDay(db: Db, restaurantId: string, now = new Date()): BranchDay {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const paid = db
    .select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${orders.total}), 0)` })
    .from(orders)
    .where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "paid"), gte(orders.paidAt, start)))
    .get();
  const open = db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(and(eq(orders.restaurantId, restaurantId), inArray(orders.status, ["held", "open"])))
    .get();
  const people = db.select({ n: sql<number>`count(*)` }).from(staff).where(and(eq(staff.restaurantId, restaurantId), eq(staff.active, true))).get();
  return { ordersToday: paid?.n ?? 0, salesToday: paid?.total ?? 0, openOrders: open?.n ?? 0, activeStaff: people?.n ?? 0 };
}

