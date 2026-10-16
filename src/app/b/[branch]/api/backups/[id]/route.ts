import { getCurrentStaff } from "@/lib/auth/session";
import { downloadBackup } from "@/lib/backups/download";

/** Downloads a backup from the till's Settings. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return downloadBackup(await getCurrentStaff(), (await params).id);
}
