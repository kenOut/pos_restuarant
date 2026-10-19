/**
 * Runs once when the server starts: automatic backups (ENYO_BACKUPS=0 turns
 * them off) and, on a restaurant computer, sync with ENYO Online once connected.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.ENYO_BACKUPS !== "0") {
    const { startBackupScheduler } = await import("./lib/backups/scheduler");
    startBackupScheduler();
  }
  if (process.env.ENYO_MODE !== "online" && process.env.ENYO_SYNC !== "0") {
    const { startSyncLoop } = await import("./lib/sync/client");
    startSyncLoop();
  }
}
