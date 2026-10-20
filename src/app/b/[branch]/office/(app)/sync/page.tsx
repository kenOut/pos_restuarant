import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable, OfficeHeader } from "@/components/office/parts";
import { ResolveButton } from "@/components/office/resolve-button";
import { isOnline } from "@/db";
import { requireOffice } from "@/lib/office/session";
import { getLink, getSyncStatus } from "@/lib/sync/client";
import { CONFLICT_ADVICE, listChangeLog, listConflicts } from "@/lib/sync/review";
import { getPeer } from "@/lib/sync/server";
import { branchPath, getControl, getDb } from "@/lib/tenancy/context";

export const metadata: Metadata = { title: "Sync" };

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" });

/** What sync between the restaurant computer and ENYO Online flagged, and what clashes replaced. */
export default async function SyncPage() {
  await requireOffice();
  const online = isOnline();
  const peer = online ? getPeer(await getControl()) : undefined;
  if (online ? !peer : !getLink()) notFound();
  const db = (await getDb()).$client;
  const open = listConflicts(db, { open: true });
  const done = listConflicts(db, { open: false }, 20);
  const log = listChangeLog(db);
  const status = online ? null : getSyncStatus();
  const here = online ? "ENYO Online" : "this computer";
  const there = online ? "the restaurant computer" : "ENYO Online";
  const ordersPath = await branchPath("/office/orders");

  return (
    <div>
      <OfficeHeader
        title="Sync"
        description={
          online
            ? peer?.lastContactAt
              ? `In step with the restaurant computer. Last contact ${when.format(peer.lastContactAt)}.`
              : "Waiting for the restaurant computer to connect."
            : status?.lastError
              ? status.lastError
              : `In step with ENYO Online. Last contact ${status?.lastContactAt ? when.format(status.lastContactAt) : "not yet"}; ${status?.waiting ?? 0} change${status?.waiting === 1 ? "" : "s"} waiting.`
        }
      />
      <div className="space-y-10 p-3 sm:p-4">
        <section aria-labelledby="needs-look" className="space-y-3">
          <h2 id="needs-look" className="font-display text-xl font-semibold">
            Needs a look
          </h2>
          {open.length === 0 ? (
            <p className="rounded-2xl border border-ink-700 bg-ink-850 p-6 text-center text-cream-muted">Nothing to deal with: both sides agree.</p>
          ) : (
            <ul className="space-y-3">
              {open.map((c) => (
                <li key={c.id} data-conflict={c.kind} className="rounded-2xl border border-alert bg-ink-850 p-4">
                  <p className="font-semibold">{c.detail}</p>
                  {CONFLICT_ADVICE[c.kind] ? <p className="mt-1 text-sm text-cream-muted">{CONFLICT_ADVICE[c.kind]}</p> : null}
                  <p className="mt-1 text-xs text-cream-faint">Found {when.format(c.createdAt)}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {c.orderId ? (
                      <Link href={`${ordersPath}/${c.orderId}`} className="inline-flex min-h-11 items-center rounded-xl border border-ink-600 px-4 text-sm font-semibold hover:bg-ink-800">
                        Open the order
                      </Link>
                    ) : null}
                    <ResolveButton id={c.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {done.length ? (
            <details className="rounded-2xl border border-ink-700 bg-ink-850 p-4">
              <summary className="min-h-11 cursor-pointer content-center font-semibold">Dealt with ({done.length})</summary>
              <ul className="mt-2 space-y-2 text-sm">
                {done.map((c) => (
                  <li key={c.id} className="text-cream-muted">
                    {c.detail} <span className="text-cream-faint">· {c.resolvedBy} · {c.resolvedAt ? when.format(c.resolvedAt) : ""}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <section aria-labelledby="change-log" className="space-y-3">
          <div>
            <h2 id="change-log" className="font-display text-xl font-semibold">
              Change log
            </h2>
            <p className="text-sm text-cream-muted">
              When {here} and {there} both changed the same thing before hearing from each other, the later change was kept. What it replaced is kept here for 180 days.
            </p>
          </div>
          {log.length === 0 ? (
            <p className="rounded-2xl border border-ink-700 bg-ink-850 p-6 text-center text-cream-muted">No clashes so far.</p>
          ) : (
            <DataTable caption="Change log">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">What</th>
                  <th scope="col">Kept</th>
                  <th scope="col">What changed</th>
                </tr>
              </thead>
              <tbody>
                {log.map((e) => (
                  <tr key={e.id} data-change={e.what}>
                    <td className="tabular-nums">{when.format(e.at)}</td>
                    <td>{e.what}</td>
                    <td>{e.kept === "this side" ? `The change made on ${here}` : `The change made on ${there}`}</td>
                    <td>
                      {e.deleted === "kept" ? (
                        "It was removed; the other change was dropped."
                      ) : e.deleted === "lost" ? (
                        "Kept, though the other side had removed it."
                      ) : (
                        <ul className="space-y-0.5">
                          {e.differences.map((d) => (
                            <li key={d.field}>
                              {d.field}: <span className="font-semibold">{d.kept}</span> <span className="text-cream-faint">(replaced {d.lost})</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </section>
      </div>
    </div>
  );
}
