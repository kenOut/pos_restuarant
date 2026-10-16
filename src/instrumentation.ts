/** Runs once when the server starts: begin automatic backups (set ENYO_BACKUPS=0 to turn them off). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.ENYO_BACKUPS === "0") return;
  const { startBackupScheduler } = await import("./lib/backups/scheduler");
  startBackupScheduler();
}
