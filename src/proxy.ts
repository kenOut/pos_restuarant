import { NextResponse, type NextRequest } from "next/server";

/**
 * Works out which business, branch (or head office) a request is for, before any page runs.
 *
 * On the restaurant's computer (one business):
 *   osu.yourdomain.com/order  → branch "osu" (internally /b/osu/order)
 *   hq.yourdomain.com/        → head office (internally /hq)
 *   anything/b/osu/order      → branch "osu" by path: for a local network
 *                               address, localhost, or the Railway address
 *
 * On ENYO Online (ENYO_MODE=online, many businesses):
 *   /c/mamaakos/b/osu/order   → business "mamaakos", branch "osu" (internally /b/osu/order)
 *   /c/mamaakos/hq            → that business's head office (internally /hq)
 *   mamaakos.yourdomain.com/… → the same, when ENYO_BASE_DOMAIN is set
 *   /admin                    → the seller's page
 *
 * ENYO_BASE_DOMAIN (e.g. "yourdomain.com") turns subdomains on. The choice is
 * passed to the app in x-enyo-* request headers, which are always cleared
 * first so a browser can't set them itself.
 */
const NAME = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;
const HEADERS = ["x-enyo-business", "x-enyo-business-base", "x-enyo-branch", "x-enyo-base", "x-enyo-hq-base"];

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  for (const name of HEADERS) headers.delete(name);

  const url = request.nextUrl.clone();
  // The address the browser used. Next keeps it in x-forwarded-host when it fetches a page for
  // itself (after a server action redirects), and so do hosting proxies such as Railway's.
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0].trim();
  const hostname = host.split(":")[0].toLowerCase();
  const domain = (process.env.ENYO_BASE_DOMAIN ?? "").toLowerCase();
  const sub = domain && hostname.endsWith(`.${domain}`) ? hostname.slice(0, -(domain.length + 1)) : null;

  if (sub === "www") {
    url.host = host.replace(/^www\./i, "");
    return NextResponse.redirect(url, 308);
  }

  if (process.env.ENYO_MODE === "online") return online(url, headers, sub);

  const rest = url.pathname === "/" ? "" : url.pathname;
  if (sub === "hq") {
    headers.set("x-enyo-hq-base", "");
    if (!url.pathname.startsWith("/hq")) url.pathname = `/hq${rest}`;
    return NextResponse.rewrite(url, { request: { headers } });
  }

  if (sub) {
    // Unknown or reserved names fall through to the branch lookup, which answers "not found".
    const slug = NAME.test(sub) ? sub : "-";
    headers.set("x-enyo-branch", slug);
    headers.set("x-enyo-base", "");
    // Head office lives on its own subdomain, so links to it from here need the full address.
    const port = host.split(":")[1];
    const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
    headers.set("x-enyo-hq-base", `${protocol}://hq.${domain}${port ? `:${port}` : ""}`);
    url.pathname = `/b/${slug}${rest}`;
    return NextResponse.rewrite(url, { request: { headers } });
  }

  markBranchAndHq(url.pathname, "", headers);
  return NextResponse.next({ request: { headers } });
}

/** /b/<slug>… and /hq… under a business's prefix ("" or "/c/mamaakos"). */
function markBranchAndHq(inner: string, prefix: string, headers: Headers) {
  const byPath = /^\/b\/([^/]+)/.exec(inner);
  if (byPath) {
    headers.set("x-enyo-branch", byPath[1].toLowerCase());
    headers.set("x-enyo-base", `${prefix}/b/${byPath[1]}`);
  }
  if (inner === "/hq" || inner.startsWith("/hq/")) headers.set("x-enyo-hq-base", `${prefix}/hq`);
}

function online(url: NextRequest["nextUrl"], headers: Headers, sub: string | null) {
  // mamaakos.yourdomain.com: the business is the subdomain; its addresses have no prefix.
  let business: string | null = null;
  let prefix = "";
  let inner = url.pathname;
  if (sub && sub !== "admin") business = sub;
  else {
    const byPath = /^\/c\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (byPath) {
      business = byPath[1].toLowerCase();
      prefix = `/c/${byPath[1]}`;
      inner = byPath[2] ?? "/";
    }
  }
  if (!business) return NextResponse.next({ request: { headers } });

  if (!NAME.test(business) || inner === "/admin" || inner.startsWith("/admin/") || inner.startsWith("/c/")) {
    url.pathname = "/not-found";
    return NextResponse.rewrite(url);
  }
  // A business's own address opens its sign-in (pick a branch, or head office).
  if (inner === "/") {
    url.pathname = `${prefix}/login`;
    return NextResponse.redirect(url);
  }
  headers.set("x-enyo-business", business);
  headers.set("x-enyo-business-base", prefix);
  markBranchAndHq(inner, prefix, headers);
  url.pathname = inner;
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  // Everything except Next's own files and the app icons.
  matcher: ["/((?!_next/|favicon\\.ico|icon\\.svg).*)"],
};
