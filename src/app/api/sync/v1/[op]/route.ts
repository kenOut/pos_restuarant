import { notFound } from "next/navigation";
import { isOnline } from "@/db";
import { authenticatePeer, hello, pull, push } from "@/lib/sync/server";
import { getControl, getTenant } from "@/lib/tenancy/context";

export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

/**
 * Two-way sync with a restaurant's computer (ENYO Online only):
 * POST /c/<client>/api/sync/v1/hello | push | pull, with the business's sync key.
 */
export async function POST(request: Request, { params }: { params: Promise<{ op: string }> }) {
  if (!isOnline()) notFound();
  const tenant = await getTenant();
  const control = await getControl();
  const peer = authenticatePeer(control, request.headers.get("authorization"));
  if (!peer) return json(401, { error: "This sync key isn't valid. Make a new one in ENYO Online's head office." });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Send JSON." });
  }
  const { op } = await params;
  if (op !== "hello" && peer.nodeId && body.node !== peer.nodeId) return json(409, { error: "Another restaurant computer is connected to this business." });
  const result = op === "hello" ? hello(tenant, control, peer, body) : op === "push" ? push(tenant, control, body) : op === "pull" ? pull(tenant, control, body) : null;
  if (!result) return json(404, { error: "Unknown sync request." });
  return json(result.status, result.body);
}
