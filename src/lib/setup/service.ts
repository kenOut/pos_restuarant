import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import type { Db } from "@/db/client";
import { restaurants, staff } from "@/db/schema";
import { insertSampleMenu } from "@/db/seed";
import { PIN_PATTERN } from "@/lib/auth/service";
import { NAME_MAX } from "@/lib/settings/service";
import { initialsFor, STAFF_NAME_MAX } from "@/lib/staff/service";

export type SetupInput = { restaurantName: string; ownerName: string; pin: string; sampleMenu: boolean };
export type SetupResult = { ok: true; ownerId: string } | { ok: false; error: string };

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");

/** A brand-new main computer has no restaurant yet. */
export function needsSetup(db: Db): boolean {
  return db.select({ id: restaurants.id }).from(restaurants).limit(1).all().length === 0;
}

/**
 * Creates the restaurant and its first owner. Only works on an empty
 * database, so it can't be used to take over a till that's already set up.
 */
export async function runSetup(db: Db, input: SetupInput): Promise<SetupResult> {
  const restaurantName = clean(input?.restaurantName, NAME_MAX);
  const ownerName = clean(input?.ownerName, STAFF_NAME_MAX);
  if (!restaurantName) return { ok: false, error: "Enter the restaurant's name." };
  if (!ownerName) return { ok: false, error: "Enter your name." };
  if (typeof input.pin !== "string" || !PIN_PATTERN.test(input.pin)) return { ok: false, error: "Choose a 4-digit PIN." };

  const pinHash = await hash(input.pin);
  return db.transaction((tx) => {
    if (!needsSetup(tx as unknown as Db)) return { ok: false, error: "This till is already set up. Sign in instead." } as const;
    const restaurantId = randomUUID();
    const ownerId = randomUUID();
    tx.insert(restaurants).values({ id: restaurantId, name: restaurantName }).run();
    tx.insert(staff)
      .values({ id: ownerId, restaurantId, name: ownerName, initials: initialsFor(ownerName), role: "owner", jobTitle: null, pinHash })
      .run();
    if (input.sampleMenu === true) insertSampleMenu(tx as unknown as Db, restaurantId);
    return { ok: true, ownerId } as const;
  });
}
