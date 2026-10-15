import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { and, asc, eq, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { STAFF_ROLES, sessions, staff, type StaffRole } from "@/db/schema";
import { PIN_PATTERN } from "@/lib/auth/service";

export const STAFF_NAME_MAX = 40;
export const JOB_TITLE_MAX = 30;

export type StaffMember = {
  id: string;
  name: string;
  initials: string;
  role: StaffRole;
  jobTitle: string | null;
  active: boolean;
  /** Locked out after too many wrong PINs, until this time (Unix ms). */
  lockedUntil: number | null;
};

export type StaffInput = { name: string; initials?: string; role: StaffRole; jobTitle?: string };

type Actor = { id: string; restaurantId: string; role: StaffRole };
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });
const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");

/** Owners manage everyone; managers manage everyone except owners and other managers. */
export function canManageRole(actor: StaffRole, target: StaffRole): boolean {
  if (actor === "owner") return true;
  if (actor === "manager") return target !== "owner" && target !== "manager";
  return false;
}

/** Roles this person may give to someone. */
export function assignableRoles(actor: StaffRole): StaffRole[] {
  return STAFF_ROLES.filter((r) => canManageRole(actor, r));
}

/** "Ama Owner" → "AO", "Kofi" → "KO". */
export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return letters.toUpperCase();
}

export function listStaff(db: Db, restaurantId: string): StaffMember[] {
  return db
    .select({
      id: staff.id,
      name: staff.name,
      initials: staff.initials,
      role: staff.role,
      jobTitle: staff.jobTitle,
      active: staff.active,
      lockedUntil: staff.lockedUntil,
    })
    .from(staff)
    .where(eq(staff.restaurantId, restaurantId))
    .orderBy(asc(staff.name))
    .all()
    .map((s) => ({ ...s, lockedUntil: s.lockedUntil ? s.lockedUntil.getTime() : null }));
}

function validate(input: StaffInput): { ok: false; error: string } | { ok: true; value: { name: string; initials: string; role: StaffRole; jobTitle: string | null } } {
  const name = clean(input?.name, STAFF_NAME_MAX);
  if (!name) return fail("Enter the person's name.");
  if (!STAFF_ROLES.includes(input?.role)) return fail("Choose a role.");
  const initials = (clean(input.initials, 3) || initialsFor(name)).toUpperCase();
  if (!/^[\p{L}\p{N}]{1,3}$/u.test(initials)) return fail("Initials can be up to 3 letters.");
  return { ok: true, value: { name, initials, role: input.role, jobTitle: clean(input.jobTitle, JOB_TITLE_MAX) || null } };
}

const pinError = (pin: unknown) => (typeof pin === "string" && PIN_PATTERN.test(pin) ? null : "The PIN must be 4 digits.");

function findMember(db: Db, restaurantId: string, id: string) {
  return db.select().from(staff).where(and(eq(staff.id, id), eq(staff.restaurantId, restaurantId))).get();
}

function otherActiveOwners(db: Db, restaurantId: string, exceptId: string): number {
  return db
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.restaurantId, restaurantId), eq(staff.role, "owner"), eq(staff.active, true), ne(staff.id, exceptId)))
    .all().length;
}

export async function createStaff(db: Db, actor: Actor, input: StaffInput, pin: string): Promise<Result<{ id: string }>> {
  const checked = validate(input);
  if (!checked.ok) return checked;
  if (!canManageRole(actor.role, checked.value.role)) return fail("You can't add someone with that role.");
  const badPin = pinError(pin);
  if (badPin) return fail(badPin);
  const id = randomUUID();
  db.insert(staff)
    .values({ id, restaurantId: actor.restaurantId, ...checked.value, pinHash: await hash(pin) })
    .run();
  return { ok: true, id };
}

export function updateStaff(db: Db, actor: Actor, id: string, input: StaffInput): Result {
  const member = findMember(db, actor.restaurantId, id);
  if (!member) return fail("That person no longer exists.");
  const checked = validate(input);
  if (!checked.ok) return checked;
  if (!canManageRole(actor.role, member.role) || !canManageRole(actor.role, checked.value.role)) return fail("You can't change someone with that role.");
  if (member.role === "owner" && checked.value.role !== "owner" && member.active && otherActiveOwners(db, actor.restaurantId, id) === 0) {
    return fail("This is the only owner. Add another owner first.");
  }
  db.update(staff).set(checked.value).where(eq(staff.id, id)).run();
  return { ok: true };
}

/** Sets a new PIN and clears any wrong-PIN lockout. */
export async function resetPin(db: Db, actor: Actor, id: string, pin: string): Promise<Result> {
  const member = findMember(db, actor.restaurantId, id);
  if (!member) return fail("That person no longer exists.");
  if (member.id !== actor.id && !canManageRole(actor.role, member.role)) return fail("You can't change that person's PIN.");
  const badPin = pinError(pin);
  if (badPin) return fail(badPin);
  db.update(staff).set({ pinHash: await hash(pin), failedPinAttempts: 0, lockedUntil: null }).where(eq(staff.id, id)).run();
  return { ok: true };
}

export function unlockStaff(db: Db, actor: Actor, id: string): Result {
  const member = findMember(db, actor.restaurantId, id);
  if (!member) return fail("That person no longer exists.");
  if (!canManageRole(actor.role, member.role)) return fail("You can't unlock someone with that role.");
  db.update(staff).set({ failedPinAttempts: 0, lockedUntil: null }).where(eq(staff.id, id)).run();
  return { ok: true };
}

/** Deactivating removes them from the sign-in screen and ends their sessions at once. */
export function setStaffActive(db: Db, actor: Actor, id: string, active: boolean): Result {
  const member = findMember(db, actor.restaurantId, id);
  if (!member) return fail("That person no longer exists.");
  if (!canManageRole(actor.role, member.role)) return fail("You can't change someone with that role.");
  if (!active && member.id === actor.id) return fail("You can't deactivate yourself.");
  if (!active && member.role === "owner" && otherActiveOwners(db, actor.restaurantId, id) === 0) {
    return fail("This is the only owner. Add another owner first.");
  }
  db.transaction((tx) => {
    tx.update(staff).set({ active: active === true }).where(eq(staff.id, id)).run();
    if (!active) tx.delete(sessions).where(eq(sessions.staffId, id)).run();
  });
  return { ok: true };
}
