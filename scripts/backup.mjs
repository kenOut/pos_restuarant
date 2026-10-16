// npm run backup            take a backup now (works while the app is running)
// npm run backup -- --list  list the backups
import path from "node:path";
import Database from "better-sqlite3";
import { backupsDirFor, createBackup, listBackups, pruneBackups } from "../src/lib/backups/core.ts";

const dbFile = path.resolve(process.env.DATABASE_PATH ?? path.join("data", "enyo.db"));
const backupsDir = backupsDirFor(dbFile);
const uploadsDir = path.join(path.dirname(dbFile), "uploads");
const when = (t) => new Date(t).toLocaleString("en-GB");

if (process.argv.includes("--list")) {
  const all = listBackups(backupsDir);
  if (all.length === 0) console.log(`No backups in ${backupsDir}`);
  for (const b of all) console.log(`${b.id}  ${when(b.createdAt)}  ${(b.sizeBytes / 1024).toFixed(0)} KB  ${b.integrity === "ok" ? "check passed" : "CHECK FAILED"}`);
  process.exit(0);
}

const source = new Database(dbFile, { fileMustExist: true });
try {
  const info = await createBackup({ source, backupsDir, uploadsDir, kind: "manual" });
  const removed = pruneBackups(backupsDir);
  console.log(`Backup ${info.id} written to ${path.join(backupsDir, info.id)}`);
  console.log(info.integrity === "ok" ? "Integrity check passed." : `INTEGRITY CHECK FAILED: ${info.integrity}`);
  if (removed.length) console.log(`Removed ${removed.length} old backup(s) under the keep rules.`);
  process.exit(info.integrity === "ok" ? 0 : 1);
} finally {
  source.close();
}
