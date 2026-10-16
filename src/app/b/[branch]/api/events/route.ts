import { getCurrentStaff } from "@/lib/auth/session";
import { liveStream } from "@/lib/live/stream";

export const dynamic = "force-dynamic";

/** Live changes for the till of the signed-in person's restaurant. */
export async function GET(request: Request) {
  const person = await getCurrentStaff();
  if (!person) return new Response("Sign in first.", { status: 401 });
  return liveStream(request, person.restaurantId);
}
