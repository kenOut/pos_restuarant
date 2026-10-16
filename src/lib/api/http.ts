import "server-only";
import type { Db } from "@/db";
import { getBranch, getDb } from "@/lib/tenancy/context";
import { authenticateApiKey, getAllowedOrigins } from "./keys";

/** Calls per key per minute. */
export const RATE_LIMIT = 120;
const WINDOW_MS = 60_000;

type Window = { start: number; count: number };
const globalForApi = globalThis as unknown as { enyoApiWindows?: Map<string, Window> };
const windows = (globalForApi.enyoApiWindows ??= new Map());

/** Counts a call; returns the seconds to wait if the key is over its limit. */
function overLimit(keyId: string, now = Date.now()): number | null {
  const w = windows.get(keyId);
  if (!w || now - w.start >= WINDOW_MS) {
    windows.set(keyId, { start: now, count: 1 });
    return null;
  }
  w.count++;
  return w.count > RATE_LIMIT ? Math.ceil((w.start + WINDOW_MS - now) / 1000) : null;
}

/** Lets a browser on one of the branch's allowed websites read the response. Servers don't need this. */
function corsHeaders(db: Db, restaurantId: string, origin: string | null): Record<string, string> {
  if (!origin || !getAllowedOrigins(db, restaurantId).includes(origin.toLowerCase())) return { Vary: "Origin" };
  return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

export const apiError = (status: number, code: string, message: string, headers: Record<string, string> = {}) => json({ error: { code, message } }, status, headers);

export type ApiContext = { db: Db; restaurantId: string; params: URLSearchParams };

/**
 * Wraps every data API route: finds the branch from the address, checks the
 * API key (Authorization: Bearer …), applies the per-key limit, and adds
 * browser access for allowed websites.
 */
export async function handleApi(request: Request, handle: (ctx: ApiContext) => Response | Promise<Response>): Promise<Response> {
  const branch = await getBranch();
  const db = await getDb();
  const cors = corsHeaders(db, branch.id, request.headers.get("origin"));
  const key = authenticateApiKey(db, request.headers.get("authorization"));
  if (!key || key.restaurantId !== branch.id) {
    return apiError(401, "unauthorized", "Send a valid API key as: Authorization: Bearer <key>. Owners create keys in the back office, Settings → API access.", {
      ...cors,
      "WWW-Authenticate": 'Bearer realm="ENYO POS"',
    });
  }
  const wait = overLimit(key.id);
  if (wait !== null) return apiError(429, "rate_limited", `Too many requests: up to ${RATE_LIMIT} a minute per key. Try again in ${wait} s.`, { ...cors, "Retry-After": String(wait) });

  const response = await handle({ db, restaurantId: branch.id, params: new URL(request.url).searchParams });
  for (const [name, value] of Object.entries(cors)) response.headers.set(name, value);
  return response;
}

/** Browser preflight for allowed websites. */
export async function handleApiOptions(request: Request): Promise<Response> {
  const branch = await getBranch();
  const cors = corsHeaders(await getDb(), branch.id, request.headers.get("origin"));
  return new Response(null, {
    status: 204,
    headers: { ...cors, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Authorization", "Access-Control-Max-Age": "600" },
  });
}

/** Query parameters as a plain object (missing ones as null). */
export function query(params: URLSearchParams, names: string[]): Record<string, string | null> {
  return Object.fromEntries(names.map((n) => [n, params.get(n)]));
}
