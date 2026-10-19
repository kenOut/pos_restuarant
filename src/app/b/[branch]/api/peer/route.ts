import { isOnline } from "@/db";
import { getCurrentStaff } from "@/lib/auth/session";
import { getPeer } from "@/lib/sync/server";
import { getBranch, getControl } from "@/lib/tenancy/context";

export const dynamic = "force-dynamic";

/** How recently the main computer must have synced to count as back (it syncs every few seconds). */
const BACK_WITHIN_MS = 20_000;

/**
 * ENYO Online: is this branch's main computer syncing again, and what's its
 * address on the restaurant's network? Signed-in staff only.
 */
export async function GET() {
  if (!isOnline() || !(await getCurrentStaff())) return Response.json({ back: false }, { status: 401 });
  const peer = getPeer(await getControl());
  const url = peer?.addresses?.[(await getBranch()).id] ?? null;
  const back = !!url && Date.now() - (peer?.lastContactAt?.getTime() ?? 0) < BACK_WITHIN_MS;
  return Response.json({ back, url: back ? url : null }, { headers: { "Cache-Control": "no-store" } });
}
