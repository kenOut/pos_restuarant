import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { filesFor, getBranchDb, getControlDb, type Branch, type Db } from "@/db";
import { findBranchBySlug } from "./registry";

/**
 * Which branch this request is for. The proxy (src/proxy.ts) works it out
 * from the subdomain (osu.yourdomain.com) or the path (/b/osu) and passes it
 * in a header it always overwrites, so a browser can't choose another branch
 * by sending its own. Unknown and deactivated branches are "not found".
 */
export const getBranch = cache(async (): Promise<Branch> => {
  const slug = (await headers()).get("x-enyo-branch");
  const branch = slug ? findBranchBySlug(getControlDb(), slug) : undefined;
  if (!branch || !branch.active) notFound();
  return branch;
});

/** This request's branch database. */
export async function getDb(): Promise<Db> {
  return getBranchDb(await getBranch());
}

/** This request's branch files (uploads, backups). */
export async function getBranchFiles() {
  return filesFor(await getBranch());
}

/**
 * Prefix for links inside a branch: "" on the branch's own subdomain
 * (osu.yourdomain.com/order), "/b/osu" everywhere else (/b/osu/order).
 */
export async function branchBase(): Promise<string> {
  return (await headers()).get("x-enyo-base") ?? "";
}

export async function branchPath(path: string): Promise<string> {
  return `${await branchBase()}${path}`;
}

/** Prefix for head office links: "" on hq.yourdomain.com, "/hq" elsewhere. */
export async function hqBase(): Promise<string> {
  return (await headers()).get("x-enyo-hq-base") ?? "/hq";
}

export async function hqPath(path: string): Promise<string> {
  return `${await hqBase()}${path}`;
}

/**
 * Full address of a branch for links from head office: its subdomain when
 * this server is reached through the business's own domain, otherwise its
 * /b/<slug> path on the current address.
 */
export async function branchUrl(slug: string): Promise<string> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const [hostname, port] = host.split(":");
  const domain = (process.env.ENYO_BASE_DOMAIN ?? "").toLowerCase();
  if (domain && (hostname === domain || hostname.endsWith(`.${domain}`))) {
    const protocol = (h.get("x-forwarded-proto") ?? (process.env.ENYO_SECURE_COOKIES === "1" ? "https" : "http")).split(",")[0].trim();
    return `${protocol}://${slug}.${domain}${port ? `:${port}` : ""}`;
  }
  return `/b/${slug}`;
}
