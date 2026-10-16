import { NextResponse, type NextRequest } from "next/server";

/**
 * Works out which branch (or head office) a request is for, before any page runs.
 *
 *   osu.yourdomain.com/order  → branch "osu" (internally /b/osu/order)
 *   hq.yourdomain.com/        → head office (internally /hq)
 *   anything/b/osu/order      → branch "osu" by path: for a local network
 *                               address, localhost, or the Railway address
 *
 * ENYO_BASE_DOMAIN (e.g. "yourdomain.com") turns subdomains on. The branch is
 * passed to the app in x-enyo-* request headers, which are always cleared
 * first so a browser can't set them itself.
 */
const SUBDOMAIN = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  for (const name of ["x-enyo-branch", "x-enyo-base", "x-enyo-hq-base"]) headers.delete(name);

  const url = request.nextUrl.clone();
  // The address the browser used. Next keeps it in x-forwarded-host when it fetches a page for
  // itself (after a server action redirects), and so do hosting proxies such as Railway's.
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0].trim();
  const hostname = host.split(":")[0].toLowerCase();
  const domain = (process.env.ENYO_BASE_DOMAIN ?? "").toLowerCase();
  const sub = domain && hostname.endsWith(`.${domain}`) ? hostname.slice(0, -(domain.length + 1)) : null;
  const rest = url.pathname === "/" ? "" : url.pathname;

  if (sub === "www") {
    url.host = host.replace(/^www\./i, "");
    return NextResponse.redirect(url, 308);
  }

  if (sub === "hq") {
    headers.set("x-enyo-hq-base", "");
    if (!url.pathname.startsWith("/hq")) url.pathname = `/hq${rest}`;
    return NextResponse.rewrite(url, { request: { headers } });
  }

  if (sub) {
    // Unknown or reserved names fall through to the branch lookup, which answers "not found".
    const slug = SUBDOMAIN.test(sub) ? sub : "-";
    headers.set("x-enyo-branch", slug);
    headers.set("x-enyo-base", "");
    // Head office lives on its own subdomain, so links to it from here need the full address.
    const port = host.split(":")[1];
    const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
    headers.set("x-enyo-hq-base", `${protocol}://hq.${domain}${port ? `:${port}` : ""}`);
    url.pathname = `/b/${slug}${rest}`;
    return NextResponse.rewrite(url, { request: { headers } });
  }

  const byPath = /^\/b\/([^/]+)/.exec(url.pathname);
  if (byPath) {
    headers.set("x-enyo-branch", byPath[1].toLowerCase());
    headers.set("x-enyo-base", `/b/${byPath[1]}`);
  }
  if (url.pathname === "/hq" || url.pathname.startsWith("/hq/")) headers.set("x-enyo-hq-base", "/hq");
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Everything except Next's own files and the app icons.
  matcher: ["/((?!_next/|favicon\\.ico|icon\\.svg).*)"],
};
