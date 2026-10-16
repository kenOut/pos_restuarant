// npm run restore                  list backups you can restore
// npm run restore -- <backup id>   restore that backup (stop the app first)
// npm run restore -- latest        restore the newest backup
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { backupsDirFor, checkRestorable, createBackup, listBackups, restoreFiles } from "../src/lib/backups/core.ts";

const dbFile = path.resolve(process.env.DATABASE_PATH ?? path.join("data", "enyo.db"));
const backupsDir = backupsDirFor(dbFile);
const uploadsDir = path.join(path.dirname(dbFile), "uploads");
const appMigrations = JSON.parse(fs.readFileSync(path.join("drizzle", "meta", "_journal.json"), "utf8")).entries.length;
const all = listBackups(backupsDir);
const when = (t) => new Date(t).toLocaleString("en-GB");

const arg = process.argv[2];
if (!arg) {
  console.log(`Backups in ${backupsDir} (newest first):`);
  for (const b of all) console.log(`  ${b.id}  ${when(b.createdAt)}  ${b.integrity === "ok" ? "" : "CHECK FAILED"}`);
  console.log("\nStop the app, then run:  npm run restore -- <backup id>   (or: npm run restore -- latest)");
  process.exit(0);
}

const id = arg === "latest" ? all[0]?.id : arg;
if (!id) {
  console.error("There are no backups to restore.");
  process.exit(1);
}
let problem;
try {
  problem = checkRestorable(backupsDir, id, appMigrations);
} catch {
  problem = "That backup can't be read.";
}
if (problem) {
  console.error(problem);
  process.exit(1);
}

console.log("Make sure ENYO POS is stopped on this computer before restoring.");
// Safety net: back up what's there now, so this can be undone.
if (fs.existsSync(dbFile)) {
  const current = new Database(dbFile);
  try {
    const safety = await createBackup({ source: current, backupsDir, uploadsDir, kind: "before-restore" });
    console.log(`Current data saved first as ${safety.id}`);
  } finally {
    current.close();
  }
}

restoreFiles({ backupsDir, id, dbFile, uploadsDir });
// Old sessions don't carry over: everyone signs in again.
const restored = new Database(dbFile);
restored.prepare("DELETE FROM sessions").run();
restored.close();
console.log(`Restored ${id}. Start the app again (npm start); everyone will need to sign in.`);
