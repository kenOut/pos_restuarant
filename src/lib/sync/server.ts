import "server-only";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { ControlDb, Db, Tenant } from "@/db";
import { branchDbFor } from "@/db";
import { syncPeers, type SyncPeer } from "@/db/control-schema";
import { publish } from "@/lib/live/bus";
import { findBranchById, listBranches, needsSetup, organisationName } from "@/lib/tenancy/registry";
import { applyChanges, collectAll, collectChanges, epoch, type Change, type FullCursor } from "./engine";
import { branchHooks, controlHooks, findOverpaid, saveConflicts } from "./rules";
import { BRANCH_TABLES, CONTROL_TABLES } from "./tables";

// ENYO Online's side of two-way sync: the restaurant computer allowed to sync
// with a business, and what it sends and asks for.

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const KEY = /^enyos_[\w-]{43}$/;

/**
 * A key for connecting the restaurant's computer, shown once. Only one
 * restaurant computer syncs with a business; a new key replaces the old one
 * (and lets a different computer connect).
 */
export function createPairingKey(control: ControlDb): string {
  const key = `enyos_${randomBytes(32).toString("base64url")}`;
  control.transaction((tx) => {
    tx.delete(syncPeers).run();
    tx.insert(syncPeers).values({ id: randomUUID(), keyHash: sha(key) }).run();
  });
  return key;
}

export function getPeer(control: ControlDb): SyncPeer | undefined {
  return control.select().from(syncPeers).get();
}

/** The paired restaurant computer behind an `Authorization: Bearer …` header. */
export function authenticatePeer(control: ControlDb, header: string | null): SyncPeer | null {
  const key = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const peer = getPeer(control);
  if (!key || !KEY.test(key) || !peer) return null;
  const a = Buffer.from(sha(key));
  const b = Buffer.from(peer.keyHash);
  return a.length === b.length && timingSafeEqual(a, b) ? peer : null;
}

type Scope = { db: Db["$client"]; tables: typeof BRANCH_TABLES; hooks: ReturnType<typeof branchHooks>; branchId: string | null };

/** The database a sync request is about: head office ("control") or one of this business's branches. */
function scopeFor(tenant: Tenant, control: ControlDb, scope: unknown): Scope | null {
  if (scope === "control") return { db: control.$client, tables: CONTROL_TABLES, hooks: controlHooks, branchId: null };
  const branch = typeof scope === "string" ? findBranchById(control, scope) : undefined;
  if (!branch) return null;
  const db = branchDbFor(tenant, branch).$client;
  return { db, tables: BRANCH_TABLES, hooks: branchHooks(db), branchId: branch.id };
}

export type SyncResponse = { status: number; body: unknown };
const fail = (status: number, error: string): SyncResponse => ({ status, body: { error } });

/**
 * First contact and every cycle: binds the restaurant computer on first use
 * and says how to start. "upload": ENYO Online is empty, send everything.
 * "download": the restaurant computer is new, take everything. "continue":
 * already in step.
 */
export function hello(tenant: Tenant, control: ControlDb, peer: SyncPeer, body: { node?: unknown; setUp?: unknown }): SyncResponse {
  const node = typeof body?.node === "string" && /^[0-9a-f]{32}$/.test(body.node) ? body.node : null;
  if (!node) return fail(400, "Missing the restaurant computer's sync id.");
  const onlineSetUp = !needsSetup(control);
  let mode: "upload" | "download" | "continue" = "continue";
  if (peer.nodeId && peer.nodeId !== node) return fail(409, "Another restaurant computer is connected to this business. Make a new key in ENYO Online's head office to connect this one instead.");
  if (!peer.nodeId) {
    const localSetUp = body.setUp === true;
    if (onlineSetUp && localSetUp) return fail(409, "Both this computer and ENYO Online already have data for this business. Connect a new, empty computer, or ask ENYO to start the online business afresh.");
    if (!onlineSetUp && !localSetUp) return fail(409, "Neither side has been set up yet. Set up the business on one of them first.");
    mode = onlineSetUp ? "download" : "upload";
    control.update(syncPeers).set({ nodeId: node }).where(eq(syncPeers.id, peer.id)).run();
  }
  control.update(syncPeers).set({ lastContactAt: new Date() }).where(eq(syncPeers.id, peer.id)).run();
  const branches = listBranches(control);
  return {
    status: 200,
    body: {
      mode,
      business: organisationName(control),
      epochs: { control: epoch(control.$client), ...Object.fromEntries(branches.map((b) => [b.id, epoch(branchDbFor(tenant, b).$client)])) },
    },
  };
}

/** The restaurant computer's changes for one database. */
export function push(tenant: Tenant, control: ControlDb, body: { scope?: unknown; changes?: unknown }): SyncResponse {
  const scope = scopeFor(tenant, control, body?.scope);
  if (!scope) return fail(404, "Unknown branch: send head office's changes first.");
  if (!Array.isArray(body.changes) || body.changes.length > 1000) return fail(400, "Send up to 1,000 changes at a time.");
  const result = applyChanges(scope.db, scope.tables, body.changes as Change[], scope.hooks);
  if (scope.branchId) {
    saveConflicts(scope.db, [...result.conflicts, ...findOverpaid(scope.db, result.touched)]);
    // Screens on ENYO Online show what the restaurant just did.
    if (result.applied) publish(scope.branchId, { type: "changed" });
  }
  return { status: 200, body: { applied: result.applied, epoch: epoch(scope.db) } };
}

/** ENYO Online's changes for one database, after a point; or everything, for a full copy. */
export function pull(tenant: Tenant, control: ControlDb, body: { scope?: unknown; after?: unknown; full?: unknown }): SyncResponse {
  const scope = scopeFor(tenant, control, body?.scope);
  if (!scope) return fail(404, "Unknown branch.");
  if (body.full) {
    const cursor = body.full as Partial<FullCursor>;
    const page = collectAll(scope.db, scope.tables, { table: Number(cursor.table) || 0, after: Number(cursor.after) || 0 });
    return { status: 200, body: { changes: page.changes, next: page.next, epoch: epoch(scope.db) } };
  }
  const page = collectChanges(scope.db, scope.tables, Number(body.after) || 0);
  return { status: 200, body: { changes: page.changes, lastSeq: page.lastSeq, more: page.more, epoch: epoch(scope.db) } };
}

