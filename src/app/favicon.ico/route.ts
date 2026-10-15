import fs from "node:fs";
import path from "node:path";

/** Browsers still ask for /favicon.ico on their own; answer with the app icon (an SVG). */
const icon = fs.readFileSync(path.join(process.cwd(), "src", "app", "icon.svg"));

export function GET() {
  return new Response(icon, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } });
}

export const dynamic = "force-static";
