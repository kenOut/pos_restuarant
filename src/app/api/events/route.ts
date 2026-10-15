import { getCurrentStaff } from "@/lib/auth/session";
import { subscribe, type LiveEvent } from "@/lib/live/bus";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

/** Server-Sent Events stream of live changes for the signed-in person's restaurant. */
export async function GET(request: Request) {
  const person = await getCurrentStaff();
  if (!person) return new Response("Sign in first.", { status: 401 });

  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup(); // the browser has gone
        }
      };
      const send = (event: LiveEvent) => write(`data: ${JSON.stringify(event)}\n\n`);

      const unsubscribe = subscribe(person.restaurantId, send);
      // A comment every 25 s keeps idle connections (and proxies) from timing out.
      const keepAlive = setInterval(() => write(": keep-alive\n\n"), 25_000);
      cleanup = () => {
        clearInterval(keepAlive);
        unsubscribe();
      };
      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });

      write("retry: 2000\n\n"); // reconnect after 2 s if the main computer restarts
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform stops the server's gzip from buffering the stream.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
