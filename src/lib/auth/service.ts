import { createHash, randomBytes } from "node:crypto";
import { verify } from "@node-rs/argon2";
import { and, asc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { restaurants, sessions, staff, type SessionKind, type Staff, type StaffRole } from "@/db/schema";
import { ROLE_LABELS } from "./roles";

export const PIN_PATTERN = /^\d{4}$/;
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_MS = 5 * 60 * 1000;
/** Sessions last one long shift. Lock or sign out ends them sooner. */
export const SESSION_MS = 12 * 60 * 60 * 1000;
/** The back office signs out after 30 minutes without use. */
export const OFFICE_IDLE_MS = 30 * 60 * 1000;
const SESSION_LENGTH: Record<SessionKind, number> = { till: SESSION_MS, office: OFFICE_IDLE_MS };

export type SignInTile = { id: string; name: string; initials: string; label: string };

export function getRestaurantName(db: Db): string | null {
  return db.select({ name: restaurants.name }).from(restaurants).limit(1).get()?.name ?? null;
}

/** Active staff for the "Who's signing in?" grid, A–Z, optionally only some roles. Never includes PIN data. */
export function listSignInTiles(db: Db, roles?: readonly StaffRole[]): SignInTile[] {
  return db
    .select({ id: staff.id, name: staff.name, initials: staff.initials, role: staff.role, jobTitle: staff.jobTitle })
    .from(staff)
    .where(and(eq(staff.active, true), roles ? inArray(staff.role, [...roles]) : undefined))
    .orderBy(asc(staff.name))
    .all()
    .map((s) => ({ id: s.id, name: s.name, initials: s.initials, label: s.jobTitle ?? ROLE_LABELS[s.role] }));
}

export type PinCheck =
  | { ok: true; staff: Staff }
  | { ok: false; reason: "invalid"; attemptsLeft: number }
  | { ok: false; reason: "locked"; lockedUntil: Date }
  | { ok: false; reason: "unknown" };

/**
 * Checks a PIN for one person. After MAX_PIN_ATTEMPTS wrong tries in a row the
 * person is locked out for PIN_LOCK_MS; a correct PIN resets the count.
 */
export async function checkPin(db: Db, staffId: string, pin: string, now = new Date()): Promise<PinCheck> {
  const person = db
    .select()
    .from(staff)
    .where(and(eq(staff.id, staffId), eq(staff.active, true)))
    .get();
  if (!person) return { ok: false, reason: "unknown" };

  if (person.lockedUntil && person.lockedUntil > now) {
    return { ok: false, reason: "locked", lockedUntil: person.lockedUntil };
  }

  const correct = PIN_PATTERN.test(pin) && (await verify(person.pinHash, pin));

  if (correct) {
    db.update(staff).set({ failedPinAttempts: 0, lockedUntil: null }).where(eq(staff.id, person.id)).run();
    return { ok: true, staff: person };
  }

  // Count in the database so simultaneous wrong attempts can't undercount.
  // An expired lock starts a fresh count.
  const { failed } = db
    .update(staff)
    .set({ failedPinAttempts: person.lockedUntil ? 1 : sql`${staff.failedPinAttempts} + 1`, lockedUntil: null })
    .where(eq(staff.id, person.id))
    .returning({ failed: staff.failedPinAttempts })
    .get()!;

  if (failed >= MAX_PIN_ATTEMPTS) {
    const lockedUntil = new Date(now.getTime() + PIN_LOCK_MS);
    db.update(staff).set({ failedPinAttempts: 0, lockedUntil }).where(eq(staff.id, person.id)).run();
    return { ok: false, reason: "locked", lockedUntil };
  }
  return { ok: false, reason: "invalid", attemptsLeft: MAX_PIN_ATTEMPTS - failed };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates a session and returns the token for the cookie. Only its hash is stored. */
export function createSession(db: Db, staffId: string, now = new Date(), kind: SessionKind = "till"): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_LENGTH[kind]);
  db.delete(sessions).where(lte(sessions.expiresAt, now)).run();
  db.insert(sessions).values({ tokenHash: hashToken(token), staffId, expiresAt, kind }).run();
  return { token, expiresAt };
}

export type SessionStaff = Pick<Staff, "id" | "restaurantId" | "name" | "initials" | "role" | "jobTitle">;

/**
 * The signed-in person for a session token, or null if it's missing, expired,
 * of the other kind (a till token never opens the back office) or they were
 * deactivated. Back office sessions are kept alive by use: each visit moves
 * the 30-minute limit on.
 */
export function findSessionStaff(db: Db, token: string, now = new Date(), kind: SessionKind = "till"): SessionStaff | null {
  const tokenHash = hashToken(token);
  const row = db
    .select({ id: staff.id, restaurantId: staff.restaurantId, name: staff.name, initials: staff.initials, role: staff.role, jobTitle: staff.jobTitle, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(staff, eq(sessions.staffId, staff.id))
    .where(and(eq(sessions.tokenHash, tokenHash), eq(sessions.kind, kind), gt(sessions.expiresAt, now), eq(staff.active, true)))
    .get();
  if (!row) return null;
  const { expiresAt, ...person } = row;
  // At most one write a minute per session.
  if (kind === "office" && expiresAt.getTime() - now.getTime() < OFFICE_IDLE_MS - 60_000) {
    db.update(sessions).set({ expiresAt: new Date(now.getTime() + OFFICE_IDLE_MS) }).where(eq(sessions.tokenHash, tokenHash)).run();
  }
  return person;
}

export function deleteSession(db: Db, token: string): void {
  db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token))).run();
}
