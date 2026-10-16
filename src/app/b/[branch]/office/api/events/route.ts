import { liveStream } from "@/lib/live/stream";
import { getOfficeStaff } from "@/lib/office/session";

export const dynamic = "force-dynamic";

/** Live changes for the back office's live order tracking. */
export async function GET(request: Request) {
  const person = await getOfficeStaff();
  if (!person) return new Response("Sign in first.", { status: 401 });
  return liveStream(request, person.restaurantId);
}
