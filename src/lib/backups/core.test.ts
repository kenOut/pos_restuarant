import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "@/db/client";
import { restaurants } from "@/db/schema";
import { seedDemoData } from "@/db/seed";
import {
  backupsToKeep,
  checkRestorable,
  copyBackupTo,
  createBackup,
  listBackups,
  pruneBackups,
  restoreFiles,
  type BackupInfo,
} from "./core";

let root: string;
let dbFile: string;
let uploadsDir: string;
let backupsDir: string;
let db: Db;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "enyo-backup-"));
  dbFile = path.join(root, "data", "enyo.db");
  uploadsDir = path.join(root, "data", "uploads");
  backupsDir = path.join(root, "data", "backups");
  db = openDatabase(dbFile);
  seedDemoData(db);
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, "logo-abc.png"), "logo");
});

afterEach(() => {
  db.$client.close();
  fs.rmSync(root, { recursive: true, force: true });
});

const backup = (kind: "manual" | "nightly" = "manual", now?: Date) => createBackup({ source: db.$client, backupsDir, uploadsDir, kind, now });

describe("createBackup", () => {
  it("copies the live database and logo, checks the copy, and records it", async () => {
    const info = await backup("manual", new Date(2026, 9, 15, 23, 30, 5));
    expect(info).toMatchObject({ id: "2026-10-15_233005_manual", kind: "manual", integrity: "ok" });
    expect(info.migrations).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(backupsDir, info.id, "enyo.db"))).toBe(true);
    expect(fs.readFileSync(path.join(backupsDir, info.id, "uploads", "logo-abc.png"), "utf8")).toBe("logo");
    expect(listBackups(backupsDir).map((b) => b.id)).toEqual([info.id]);
    expect(fs.readdirSync(backupsDir).some((n) => n.endsWith(".partial"))).toBe(false);
  });

  it("gives two backups in the same second different names", async () => {
    const now = new Date(2026, 9, 15, 12, 0, 0);
    const a = await backup("manual", now);
    const b = await backup("manual", now);
    expect(b.id).toBe(`${a.id}-2`);
  });
});

describe("retention", () => {
  const fake = (date: Date, i: number): BackupInfo => ({ id: `b${i}`, kind: "nightly", createdAt: date.getTime(), sizeBytes: 1, integrity: "ok", migrations: 1 });

  it("keeps 7 daily, 12 monthly, 5 yearly and the 3 newest", () => {
    // One nightly backup a day for ~3 years, newest first.
    const days: BackupInfo[] = [];
    for (let i = 0; i < 1100; i++) days.push(fake(new Date(2026, 9, 15 - i, 23, 30), i));
    const kept = backupsToKeep(days);
    const keptDates = days.filter((b) => kept.has(b.id)).map((b) => new Date(b.createdAt));
    // 7 most recent days…
    expect(keptDates.slice(0, 7).map((d) => d.getDate())).toEqual([15, 14, 13, 12, 11, 10, 9]);
    // …plus the newest backup of each of the last 12 months, and of each year
    const months = new Set(keptDates.map((d) => `${d.getFullYear()}-${d.getMonth()}`));
    expect(months.size).toBeGreaterThanOrEqual(12);
    const years = new Set(keptDates.map((d) => d.getFullYear()));
    expect([...years].sort()).toEqual([2023, 2024, 2025, 2026]);
    expect(kept.size).toBeLessThan(30);
  });

  it("always keeps the three newest, even several from one day", () => {
    const sameDay = [0, 1, 2, 3].map((i) => fake(new Date(2026, 9, 15, 20 - i), i));
    expect([...backupsToKeep(sameDay)].sort()).toEqual(["b0", "b1", "b2"]);
  });

  it("prunes old backups from disk", async () => {
    for (let i = 0; i < 10; i++) await backup("nightly", new Date(2026, 9, 1 + i, 23, 30));
    const removed = pruneBackups(backupsDir);
    // Oct 4–10 are the 7 daily ones (Oct 10 is also the month's and year's newest); Oct 1–3 go.
    expect(removed.sort()).toEqual(["2026-10-01_233000_nightly", "2026-10-02_233000_nightly", "2026-10-03_233000_nightly"]);
    expect(listBackups(backupsDir)).toHaveLength(7);
  });
});

describe("second copy and restore", () => {
  it("copies a backup to another folder", async () => {
    const info = await backup();
    const usb = path.join(root, "usb");
    copyBackupTo(backupsDir, info.id, usb);
    expect(listBackups(usb).map((b) => b.id)).toEqual([info.id]);
  });

  it("restores the database and logo from a backup", async () => {
    const info = await backup();
    db.update(restaurants).set({ name: "Changed after backup" }).run();
    fs.writeFileSync(path.join(uploadsDir, "logo-new.png"), "new");
    db.$client.close();

    expect(checkRestorable(backupsDir, info.id, 99)).toBeNull();
    restoreFiles({ backupsDir, id: info.id, dbFile, uploadsDir });

    db = openDatabase(dbFile);
    expect(db.select({ name: restaurants.name }).from(restaurants).get()?.name).toBe("Chez Accra");
    expect(fs.readdirSync(uploadsDir)).toEqual(["logo-abc.png"]);
  });

  it("refuses backups from a newer version, broken ones, and unknown ids", async () => {
    const info = await backup();
    expect(checkRestorable(backupsDir, info.id, info.migrations - 1)).toBe("That backup comes from a newer version of ENYO POS. Update this computer first.");
    fs.writeFileSync(path.join(backupsDir, info.id, "enyo.db"), "not a database");
    expect(() => checkRestorable(backupsDir, info.id, 99)).toThrow();
    expect(() => checkRestorable(backupsDir, "../../etc", 99)).toThrow("Not a backup.");
  });
});
