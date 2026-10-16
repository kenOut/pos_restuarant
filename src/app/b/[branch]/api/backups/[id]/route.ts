import fs from "node:fs";
import { getCurrentStaff } from "@/lib/auth/session";
import { backupDatabaseFile, isBackupId } from "@/lib/backups/core";
import { backupsDir, canManageBackups } from "@/lib/backups/service";
import { getBranch } from "@/lib/tenancy/context";

/** Downloads a backup's database file. Owners only: it holds every order and the PIN hashes. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const person = await getCurrentStaff();
  if (!person) return new Response("Sign in first.", { status: 401 });
  if (!canManageBackups(person.role)) return new Response("Only an owner can download backups.", { status: 403 });

  const { id } = await params;
  if (!isBackupId(id)) return new Response("Not found", { status: 404 });
  const file = backupDatabaseFile(backupsDir(await getBranch()), id);
  if (!fs.existsSync(file)) return new Response("Not found", { status: 404 });

  return new Response(fs.readFileSync(file), {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="enyo-${id}.db"`,
      "Cache-Control": "no-store",
    },
  });
}
