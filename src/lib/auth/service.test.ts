import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "@/db/client";
import { staff } from "@/db/schema";
import { seedDemoData } from "@/db/seed";
import {
  MAX_PIN_ATTEMPTS,
  PIN_LOCK_MS,
  SESSION_MS,
  checkPin,
  createSession,
  deleteSession,
  findSessionStaff,
  listSignInTiles,
} from "./service";

const KWAME = "staff-kwame"; // demo PIN 2222
let db: Db;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDemoData(db);
});

describe("listSignInTiles", () => {
  it("lists active staff with their job title or role, and no PIN data", () => {
    const tiles = listSignInTiles(db);
    expect(tiles).toHaveLength(7);
    expect(tiles.find((t) => t.id === "staff-yaw")?.label).toBe("Grill cook");
    expect(tiles.find((t) => t.id === KWAME)?.label).toBe("Manager");
    expect(Object.keys(tiles[0])).toEqual(["id", "name", "initials", "label"]);
  });

  it("hides deactivated staff", () => {
    db.update(staff).set({ active: false }).where(eq(staff.id, KWAME)).run();
    expect(listSignInTiles(db).some((t) => t.id === KWAME)).toBe(false);
  });
});

describe("checkPin", () => {
  it("accepts the right PIN", async () => {
    const result = await checkPin(db, KWAME, "2222");
    expect(result.ok).toBe(true);
  });

  it("rejects a wrong or malformed PIN and counts down attempts", async () => {
    expect(await checkPin(db, KWAME, "1234")).toEqual({ ok: false, reason: "invalid", attemptsLeft: 4 });
    expect(await checkPin(db, KWAME, "22")).toEqual({ ok: false, reason: "invalid", attemptsLeft: 3 });
  });

  it("locks after too many wrong PINs, even for the right PIN, until the lock expires", async () => {
    const now = new Date("2026-10-04T15:10:00Z");
    for (let i = 1; i < MAX_PIN_ATTEMPTS; i++) await checkPin(db, KWAME, "0000", now);
    const locked = await checkPin(db, KWAME, "0000", now);
    expect(locked).toMatchObject({ ok: false, reason: "locked" });

    expect(await checkPin(db, KWAME, "2222", new Date(now.getTime() + 60_000))).toMatchObject({ reason: "locked" });

    const later = new Date(now.getTime() + PIN_LOCK_MS + 1);
    expect((await checkPin(db, KWAME, "2222", later)).ok).toBe(true);
  });

  it("starts a fresh count after a lock expires", async () => {
    const now = new Date("2026-10-04T15:10:00Z");
    for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) await checkPin(db, KWAME, "0000", now);
    const later = new Date(now.getTime() + PIN_LOCK_MS + 1);
    expect(await checkPin(db, KWAME, "0000", later)).toEqual({ ok: false, reason: "invalid", attemptsLeft: 4 });
  });

  it("resets the count after a correct PIN", async () => {
    await checkPin(db, KWAME, "0000");
    await checkPin(db, KWAME, "0000");
    await checkPin(db, KWAME, "2222");
    expect(await checkPin(db, KWAME, "0000")).toMatchObject({ attemptsLeft: 4 });
  });

  it("refuses unknown and deactivated staff", async () => {
    expect(await checkPin(db, "nobody", "2222")).toEqual({ ok: false, reason: "unknown" });
    db.update(staff).set({ active: false }).where(eq(staff.id, KWAME)).run();
    expect(await checkPin(db, KWAME, "2222")).toEqual({ ok: false, reason: "unknown" });
  });

  it("never stores the PIN itself", () => {
    const row = db.select().from(staff).where(eq(staff.id, KWAME)).get()!;
    expect(row.pinHash).not.toContain("2222");
    expect(row.pinHash.startsWith("$argon2id$")).toBe(true);
  });
});

describe("sessions", () => {
  it("finds the signed-in person until the session expires", () => {
    const now = new Date("2026-10-04T15:10:00Z");
    const { token } = createSession(db, KWAME, now);
    expect(findSessionStaff(db, token, now)?.name).toBe("Kwame B.");
    expect(findSessionStaff(db, token, new Date(now.getTime() + SESSION_MS + 1))).toBeNull();
  });

  it("ends on lock / sign-out", () => {
    const { token } = createSession(db, KWAME);
    deleteSession(db, token);
    expect(findSessionStaff(db, token)).toBeNull();
  });

  it("ends when the person is deactivated, and ignores made-up tokens", () => {
    const { token } = createSession(db, KWAME);
    expect(findSessionStaff(db, "not-a-real-token")).toBeNull();
    db.update(staff).set({ active: false }).where(eq(staff.id, KWAME)).run();
    expect(findSessionStaff(db, token)).toBeNull();
  });
});
