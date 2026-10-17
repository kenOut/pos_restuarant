import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { branchDbFor, controlDbFor, filesFor, getPlatformDb, isOnline, localTenant, tenantFor, type Branch, type ControlDb, type Db, type Tenant } from "@/db";
import { businesses } from "@/db/platform-schema";
import { findBranchBySlug } from "./registry";

/**
 * Which business (tenant) this request is for. On the restaurant's computer
 * there's only one. On ENYO Online the proxy (src/proxy.ts) reads it from the
 * address (/c/mamaakos/…, or mamaakos.yourdomain.com) and passes it in a
 * header it always overwrites, so a browser can't pick another business.
 * Unknown and suspended businesses are "not found".
 */
export const getTenant = cache(async (): Promise<Tenant> => {
  if (!isOnline()) return localTenant();
  const slug = (await headers()).get("x-enyo-business");
  const business = slug ? getPlatformDb().select().from(businesses).where(eq(businesses.slug, slug)).get() : undefined;
  if (!business || !business.active) notFound();
  return tenantFor(business);
});

/** The business's address name on ENYO Online (null on the restaurant's computer). */
export async function businessSlug(): Promise<string | null> {
  return isOnline() ? (await headers()).get("x-enyo-business") : null;
}

/** This request's head office database. */
export async function getControl(): Promise<ControlDb> {
  return controlDbFor(await getTenant());
}

/** A branch database of this request's business (e.g. for head office's figures). */
export async function openBranchDb(branch: Branch): Promise<Db> {
  return branchDbFor(await getTenant(), branch);
}

/** For functions that open other branches of this business, e.g. to copy a menu. */
export async function branchOpener(): Promise<(branch: Branch) => Db> {
  const tenant = await getTenant();
  return (branch) => branchDbFor(tenant, branch);
}

/**
 * Which branch this request is for. The proxy works it out from the
 * subdomain (osu.yourdomain.com) or the path (/b/osu) and passes it in a
 * header it always overwrites. Unknown and deactivated branches are "not found".
 */
export const getBranch = cache(async (): Promise<Branch> => {
  const slug = (await headers()).get("x-enyo-branch");
  const branch = slug ? findBranchBySlug(await getControl(), slug) : undefined;
  if (!branch || !branch.active) notFound();
  return branch;
});

/** This request's branch database. */
export async function getDb(): Promise<Db> {
  return branchDbFor(await getTenant(), await getBranch());
}

/** This request's branch files (uploads, backups). */
export async function getBranchFiles() {
  return filesFor(await getTenant(), await getBranch());
}

/**
 * Prefix for links inside a branch: "" on the branch's own subdomain
 * (osu.yourdomain.com/order), "/b/osu" by path, "/c/mamaakos/b/osu" on ENYO Online.
 */
export async function branchBase(): Promise<string> {
  return (await headers()).get("x-enyo-base") ?? "";
}

export async function branchPath(path: string): Promise<string> {
  return `${await branchBase()}${path}`;
}

/** Prefix for this business's addresses: "" on the restaurant's computer, "/c/mamaakos" on ENYO Online. */
export async function businessBase(): Promise<string> {
  return (await headers()).get("x-enyo-business-base") ?? "";
}

/** Prefix for head office links: "" on hq.yourdomain.com, "/hq" (or "/c/mamaakos/hq") elsewhere. */
export async function hqBase(): Promise<string> {
  return (await headers()).get("x-enyo-hq-base") ?? `${await businessBase()}/hq`;
}

export async function hqPath(path: string): Promise<string> {
  return `${await hqBase()}${path}`;
}

/**
 * Full address of a branch for links from head office: its subdomain when
 * this server is reached through the restaurant's own domain (local mode),
 * otherwise its /b/<slug> path under this business's address.
 */
export async function branchUrl(slug: string): Promise<string> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const [hostname, port] = host.split(":");
  const domain = (process.env.ENYO_BASE_DOMAIN ?? "").toLowerCase();
  if (!isOnline() && domain && (hostname === domain || hostname.endsWith(`.${domain}`))) {
    const protocol = (h.get("x-forwarded-proto") ?? (process.env.ENYO_SECURE_COOKIES === "1" ? "https" : "http")).split(",")[0].trim();
    return `${protocol}://${slug}.${domain}${port ? `:${port}` : ""}`;
  }
  return `${await businessBase()}/b/${slug}`;
}
