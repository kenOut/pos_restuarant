// Where a branch keeps its files. No path aliases, so the npm scripts can load it too.
import path from "node:path";

/** Files that belong to a branch: its database, uploaded logo and backups. */
export function branchFiles(dataDir: string, branch: { dbPath: string }) {
  const dbFile = path.join(dataDir, branch.dbPath);
  return {
    dbFile,
    uploadsDir: path.join(path.dirname(dbFile), "uploads"),
    backupsDir: process.env.ENYO_BACKUP_DIR
      ? path.join(/*turbopackIgnore: true*/ process.env.ENYO_BACKUP_DIR, path.basename(path.dirname(dbFile)) || "branch")
      : path.join(path.dirname(dbFile), "backups"),
  };
}
