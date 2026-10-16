// Keys for the read-only data API. A key is shown once when it's created;
// only its SHA-256 hash is kept, so a copied database can't be used to call the API.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { apiKeys, restaurants, staff, type StaffRole } from "@/db/schema";

export const KEY_NAME_MAX = 40;
export const MAX_KEYS = 20;
export const canManageApiKeys = (role: StaffRole) => role === "owner";

const hash = (key: string) => createHash("sha256").update(key).digest("hex");
const KEY_PATTERN = /^enyo_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{43}$/;

export type ApiKeyInfo = {
  id: string;
  name: string;
  prefix: string;
  createdBy: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
};

type Actor = { id: string; restaurantId: string; role: StaffRole };
type Fail = { ok: false; error: string };

export function listApiKeys(db: Db, restaurantId: string): ApiKeyInfo[] {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdBy: staff.name,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .innerJoin(staff, eq(apiKeys.createdBy, staff.id))
    .where(eq(apiKeys.restaurantId, restaurantId))
    .orderBy(desc(apiKeys.createdAt))
    .all()
    .map((k) => ({ ...k, createdAt: k.createdAt.getTime(), lastUsedAt: k.lastUsedAt?.getTime() ?? null, revokedAt: k.revokedAt?.getTime() ?? null }));
}

/** Creates a key; the returned `key` is the only time it's ever available. */
export function createApiKey(db: Db, actor: Actor, rawName: string, now = new Date()): { ok: true; key: string; info: ApiKeyInfo } | Fail {
  if (!canManageApiKeys(actor.role)) return { ok: false, error: "Only an owner can create API keys." };
  const name = typeof rawName === "string" ? rawName.trim().replace(/\s+/g, " ").slice(0, KEY_NAME_MAX) : "";
  if (!name) return { ok: false, error: "Name the key after what will use it, e.g. Head office sync." };
  const active = db.select({ id: apiKeys.id }).from(apiKeys).where(and(eq(apiKeys.restaurantId, actor.restaurantId), isNull(apiKeys.revokedAt))).all();
  if (active.length >= MAX_KEYS) return { ok: false, error: `A branch can have up to ${MAX_KEYS} keys. Revoke one you no longer use.` };

  const prefix = `enyo_${randomBytes(6).toString("base64url")}`;
  const key = `${prefix}_${randomBytes(32).toString("base64url")}`;
  const id = randomUUID();
  db.insert(apiKeys).values({ id, restaurantId: actor.restaurantId, name, prefix, keyHash: hash(key), createdBy: actor.id, createdAt: now }).run();
  return { ok: true, key, info: listApiKeys(db, actor.restaurantId).find((k) => k.id === id)! };
}

export function revokeApiKey(db: Db, actor: Actor, id: string, now = new Date()): { ok: true } | Fail {
  if (!canManageApiKeys(actor.role)) return { ok: false, error: "Only an owner can revoke API keys." };
  const key = db.select().from(apiKeys).where(and(eq(apiKeys.id, String(id)), eq(apiKeys.restaurantId, actor.restaurantId))).get();
  if (!key) return { ok: false, error: "That key no longer exists." };
  if (!key.revokedAt) db.update(apiKeys).set({ revokedAt: now }).where(eq(apiKeys.id, key.id)).run();
  return { ok: true };
}

/** The key behind an `Authorization: Bearer …` header, if it's valid and not revoked. Notes when it was used. */
export function authenticateApiKey(db: Db, header: string | null, now = new Date()): { id: string; restaurantId: string } | null {
  const key = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!key || !KEY_PATTERN.test(key)) return null;
  const row = db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash(key))).get();
  if (!row || row.revokedAt) return null;
  // "Last used" to the minute is plenty, and saves a write on every call.
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > 60_000) db.update(apiKeys).set({ lastUsedAt: now }).where(eq(apiKeys.id, row.id)).run();
  return { id: row.id, restaurantId: row.restaurantId };
}

// ---------- Websites allowed to call the API from a browser

const ORIGIN_PATTERN = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/;

export function getAllowedOrigins(db: Db, restaurantId: string): string[] {
  const raw = db.select({ origins: restaurants.apiAllowedOrigins }).from(restaurants).where(eq(restaurants.id, restaurantId)).get()?.origins;
  return raw ? raw.split("\n").filter(Boolean) : [];
}

export function setAllowedOrigins(db: Db, actor: Actor, text: string): { ok: true } | Fail {
  if (!canManageApiKeys(actor.role)) return { ok: false, error: "Only an owner can change API access." };
  const origins = [...new Set(String(text ?? "").split(/[\s,]+/).map((o) => o.trim().toLowerCase().replace(/\/+$/, "")).filter(Boolean))];
  const bad = origins.find((o) => !ORIGIN_PATTERN.test(o));
  if (bad) return { ok: false, error: `${bad} isn't a website address. Use the form https://dashboard.example.com.` };
  if (origins.length > 20) return { ok: false, error: "List up to 20 websites." };
  db.update(restaurants).set({ apiAllowedOrigins: origins.join("\n") || null }).where(eq(restaurants.id, actor.restaurantId)).run();
  return { ok: true };
}
