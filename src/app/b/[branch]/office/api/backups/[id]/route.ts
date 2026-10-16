import { downloadBackup } from "@/lib/backups/download";
import { getOfficeStaff } from "@/lib/office/session";

/** Downloads a backup from the back office's Settings (the office sign-in cookie only reaches /office). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return downloadBackup(await getOfficeStaff(), (await params).id);
}
