import "server-only";
import { randomUUID } from "node:crypto";
import { branchDbFor, controlDbFor, localTenant, type Tenant } from "@/db";
import { syncLink, type SyncLink } from "@/db/control-schema";
import { publish } from "@/lib/live/bus";
import { listBranches, needsSetup } from "@/lib/tenancy/registry";
import { applyChanges, collectAll, collectChanges, meta, nodeId, pendingCount, pruneOutbox, setMeta, type Change, type FullCursor } from "./engine";
import { branchHooks, controlHooks, findOverpaid, saveConflicts } from "./rules";
import { BRANCH_TABLES, CONTROL_TABLES, type SyncedTable } from "./tables";

// The restaurant computer's side of two-way sync with ENYO Online. It always
// starts the exchange (restaurant networks usually can't be reached from the
// internet): every few seconds it sends its changes and collects ENYO
// Online's. While offline, changes simply wait in each database's outbox.

/** Every few seconds; ENYO_SYNC_INTERVAL_MS shortens it (for tests). */
const INTERVAL_MS = Number(process.env.ENYO_SYNC_INTERVAL_MS) || 5_000;
const TIMEOUT_MS = 20_000;
const globalForSync = globalThis as unknown as { enyoSyncTimer?: NodeJS.Timeout; enyoSyncRunning?: boolean };

type Client = ReturnType<typeof controlDbFor>["$client"];
type Scope = { name: string; db: Client; tables: SyncedTable[]; branchId: string | null };

export class SyncError extends Error {}

/** Calls one of ENYO Online's sync endpoints. */
async function call(link: Pick<SyncLink, "url" | "key">, op: string, body: unknown): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${link.url}/api/sync/v1/${op}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${link.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SyncError("Can't reach ENYO Online. Changes are kept here and sent once the internet is back.");
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new SyncError(typeof data.error === "string" ? data.error : `ENYO Online answered ${response.status}.`);
  return data;
}

/** "https://posrestuarant.up.railway.app/c/mamaakos/" → without the trailing slash; only web addresses. */
export function normaliseUrl(raw: string): string | null {
  try {
    const url = new URL(String(raw ?? "").trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

export function getLink(tenant: Tenant = localTenant()): SyncLink | undefined {
  return controlDbFor(tenant).select().from(syncLink).get();
}

/**
 * Connects this computer to its business on ENYO Online. ENYO Online decides
 * how to start: send everything up (it's empty) or take everything (this
 * computer is new). Nothing is sent until the first cycle.
 */
export async function connect(input: { url: string; key: string }, tenant: Tenant = localTenant()): Promise<{ ok: true; mode: string } | { ok: false; error: string }> {
  const url = normaliseUrl(input?.url);
  const key = String(input?.key ?? "").trim();
  if (!url) return { ok: false, error: "Enter the business's ENYO Online address, e.g. https://posrestuarant.up.railway.app/c/mamaakos." };
  if (!/^enyos_[\w-]{43}$/.test(key)) return { ok: false, error: "That doesn't look like a sync key. Copy it from ENYO Online's head office." };
  const control = controlDbFor(tenant);
  try {
    const answer = await call({ url, key }, "hello", { node: nodeId(control.$client), setUp: !needsSetup(control) });
    control.transaction((tx) => {
      tx.delete(syncLink).run();
      tx.insert(syncLink).values({ id: randomUUID(), url, key, connectedAt: new Date(), lastContactAt: new Date() }).run();
    });
    return { ok: true, mode: String(answer.mode) };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export function disconnect(tenant: Tenant = localTenant()): void {
  controlDbFor(tenant).delete(syncLink).run();
}

/** "Sync everything again": every database sends and takes a full copy on the next cycle. */
export function resyncAll(tenant: Tenant = localTenant()): void {
  for (const scope of scopes(tenant)) setMeta(scope.db, "synced_with", "");
}

function scopes(tenant: Tenant): Scope[] {
  const control = controlDbFor(tenant);
  return [
    { name: "control", db: control.$client, tables: CONTROL_TABLES, branchId: null },
    ...listBranches(control).map((b) => ({ name: b.id, db: branchDbFor(tenant, b).$client, tables: BRANCH_TABLES, branchId: b.id })),
  ];
}
const hooksFor = (scope: Scope) => (scope.branchId ? branchHooks(scope.db) : controlHooks);

function applyFromOnline(scope: Scope, changes: Change[]): number {
  const result = applyChanges(scope.db, scope.tables, changes, hooksFor(scope));
  if (scope.branchId) {
    saveConflicts(scope.db, [...result.conflicts, ...findOverpaid(scope.db, result.touched)]);
    // The tills here show what was done online.
    if (result.applied) publish(scope.branchId, { type: "changed" });
  }
  return result.applied;
}

/** One database: a full copy both ways if it hasn't had one with this link, then just the changes. */
async function syncScope(link: SyncLink, node: string, scope: Scope, remoteEpoch: unknown): Promise<void> {
  const db = scope.db;
  // ENYO Online restored from a backup since last time: send and take everything again.
  if (typeof remoteEpoch === "string" && meta(db, "remote_epoch") && meta(db, "remote_epoch") !== remoteEpoch) setMeta(db, "synced_with", "");
  const fresh = meta(db, "synced_with") !== link.id;

  if (fresh) {
    let cursor: FullCursor | null = { table: 0, after: 0 };
    while (cursor) {
      const page = collectAll(db, scope.tables, cursor);
      if (page.changes.length) await call(link, "push", { node, scope: scope.name, changes: page.changes });
      cursor = page.next;
    }
    let full: FullCursor | null = { table: 0, after: 0 };
    while (full) {
      const page = await call(link, "pull", { node, scope: scope.name, full });
      applyFromOnline(scope, page.changes as Change[]);
      full = (page.next as FullCursor | null) ?? null;
    }
  }

  // This side's new changes.
  for (;;) {
    const after = Number(meta(db, "pushed_seq") ?? 0);
    const page = collectChanges(db, scope.tables, after);
    if (page.changes.length) await call(link, "push", { node, scope: scope.name, changes: page.changes });
    setMeta(db, "pushed_seq", String(page.lastSeq));
    pruneOutbox(db, page.lastSeq);
    if (!page.more) break;
  }
  // ENYO Online's new changes.
  for (;;) {
    const page = await call(link, "pull", { node, scope: scope.name, after: Number(meta(db, "pulled_seq") ?? 0) });
    applyFromOnline(scope, page.changes as Change[]);
    setMeta(db, "pulled_seq", String(page.lastSeq ?? 0));
    if (typeof page.epoch === "string") setMeta(db, "remote_epoch", page.epoch);
    if (!page.more) break;
  }
  if (fresh) setMeta(db, "synced_with", link.id);
}

/** One sync cycle for this computer: head office first (it lists the branches), then each branch. Never two at once. */
export async function syncNow(tenant: Tenant = localTenant()): Promise<{ ok: true } | { ok: false; error: string }> {
  if (globalForSync.enyoSyncRunning) return { ok: true };
  globalForSync.enyoSyncRunning = true;
  try {
    return await cycle(tenant);
  } finally {
    globalForSync.enyoSyncRunning = false;
  }
}

async function cycle(tenant: Tenant): Promise<{ ok: true } | { ok: false; error: string }> {
  const link = getLink(tenant);
  if (!link) return { ok: false, error: "Not connected to ENYO Online." };
  const control = controlDbFor(tenant);
  const node = nodeId(control.$client);
  const setStatus = (values: Partial<SyncLink>) => control.update(syncLink).set(values).run();
  try {
    const answer = await call(link, "hello", { node, setUp: !needsSetup(control) });
    const epochs = (answer.epochs ?? {}) as Record<string, unknown>;
    await syncScope(link, node, scopes(tenant)[0], epochs.control);
    // Branches may have just arrived from ENYO Online.
    for (const scope of scopes(tenant).slice(1)) await syncScope(link, node, scope, epochs[scope.name]);
    setStatus({ lastContactAt: new Date(), lastError: null });
    return { ok: true };
  } catch (error) {
    const message = error instanceof SyncError ? error.message : `Sync stopped: ${(error as Error).message}`;
    setStatus({ lastError: message });
    return { ok: false, error: message };
  }
}

export type SyncStatus = {
  connected: boolean;
  url: string | null;
  connectedAt: number | null;
  lastContactAt: number | null;
  lastError: string | null;
  /** Changes not yet sent, per database. */
  waiting: number;
};

export function getSyncStatus(tenant: Tenant = localTenant()): SyncStatus {
  const link = getLink(tenant);
  if (!link) return { connected: false, url: null, connectedAt: null, lastContactAt: null, lastError: null, waiting: 0 };
  const waiting = scopes(tenant).reduce((n, s) => n + pendingCount(s.db, Number(meta(s.db, "pushed_seq") ?? 0)), 0);
  return { connected: true, url: link.url, connectedAt: link.connectedAt.getTime(), lastContactAt: link.lastContactAt?.getTime() ?? null, lastError: link.lastError, waiting };
}

/** Every few seconds while connected (restaurant computers only; ENYO Online never starts an exchange). */
export function startSyncLoop(): void {
  if (globalForSync.enyoSyncTimer) return;
  globalForSync.enyoSyncTimer = setInterval(() => {
    if (getLink()) void syncNow();
  }, INTERVAL_MS);
  globalForSync.enyoSyncTimer.unref();
}
