import fs from "node:fs";
import path from "node:path";
import { getUploadsDir } from "@/db";
import { isLogoFileName } from "@/lib/settings/service";

const TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;

/**
 * Serves the restaurant's logo. Public, because the sign-in screen shows it.
 * The file name contains a hash of the image, so it can be cached for good.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  // Only names this app generates (logo-<hash>.<ext>): no paths, no traversal.
  if (!isLogoFileName(file)) return new Response("Not found", { status: 404 });
  const full = path.join(getUploadsDir(), file);
  if (!fs.existsSync(full)) return new Response("Not found", { status: 404 });
  const ext = file.split(".").pop() as keyof typeof TYPES;
  return new Response(fs.readFileSync(full), {
    headers: {
      "Content-Type": TYPES[ext],
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
