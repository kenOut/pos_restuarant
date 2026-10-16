"use client";

import { useId, useState, useTransition } from "react";
import { backupNowAction, restoreBackupAction, updateBackupSettingsAction } from "@/app/(till)/settings/backup-actions";
import { Button, Dialog, Field, FormError, inputClass } from "@/components/admin/ui";
import type { BackupInfo } from "@/lib/backups/core";
import type { BackupStatus } from "@/lib/backups/service";

const KIND_LABELS: Record<BackupInfo["kind"], string> = {
  nightly: "Nightly",
  startup: "On start-up",
  manual: "Backed up by hand",
  "before-restore": "Before a restore",
};

// Ghana is on GMT all year; fixed so server and browser render the same text.
const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" });
const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** Settings → Server and backups (owners). */
export function BackupsPanel({ status }: { status: BackupStatus }) {
  const id = useId();
  const [time, setTime] = useState(status.time);
  const [copyDir, setCopyDir] = useState(status.copyDir ?? "");
  const [restoring, setRestoring] = useState<BackupInfo | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const latest = status.backups[0];
  const run = (action: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    startTransition(async () => {
      const result = await action();
      setMessage(result.ok ? { ok: true, text: ok } : { ok: false, text: result.error ?? "Something went wrong." });
    });

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-2xl border border-ink-700 bg-ink-850 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="font-display text-xl font-bold">
            Server and backups
          </h2>
          <p className="text-sm text-cream-muted">
            {latest
              ? `Last backup ${dateTime.format(latest.createdAt)} · ${latest.integrity === "ok" ? "check passed" : "check FAILED"}`
              : "No backups yet."}{" "}
            · Next nightly backup {dateTime.format(status.nextRunAt)}
          </p>
        </div>
        <Button variant="primary" disabled={pending || status.running} onClick={() => run(backupNowAction, "Backup taken and checked.")}>
          {pending ? "Working…" : "Back up now"}
        </Button>
      </div>

      {status.lastError ? <p role="alert" className="mt-3 rounded-xl bg-alert-soft px-4 py-3 text-sm">The last backup failed: {status.lastError}</p> : null}
      {status.lastCopyError ? <p role="alert" className="mt-3 rounded-xl bg-amber-soft px-4 py-3 text-sm text-amber">{status.lastCopyError}</p> : null}
      <p aria-live="polite" className={`mt-2 min-h-5 text-sm ${message?.ok ? "text-eating-text" : "text-alert"}`}>
        {message?.text}
      </p>

      <form
        className="mt-2 grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updateBackupSettingsAction({ time, copyDir }), "Backup settings saved.");
        }}
      >
        <Field id={`${id}-time`} label="Nightly backup at">
          <input id={`${id}-time`} type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
        </Field>
        <Field id={`${id}-copy`} label="Also copy to (optional)" hint="A folder on a USB drive or another disk, so a backup survives if this computer fails.">
          <input id={`${id}-copy`} value={copyDir} onChange={(e) => setCopyDir(e.target.value)} placeholder="e.g. E:\ENYO backups" className={inputClass} />
        </Field>
        <Button type="submit" disabled={pending} className="sm:mb-5">
          Save
        </Button>
      </form>
      <p className="mt-1 text-xs text-cream-faint">
        Backups are kept in {status.folder}: the last 7 days, 12 months and 5 years, and always the 3 newest.
      </p>

      <h3 className="mt-5 text-sm font-semibold text-cream-muted">Backups · {status.backups.length}</h3>
      {status.backups.length === 0 ? (
        <p className="mt-2 text-sm text-cream-muted">The first backup is taken shortly after the app starts.</p>
      ) : (
        <ul className="mt-2 divide-y divide-ink-700 rounded-xl border border-ink-700">
          {status.backups.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <div className="min-w-48 flex-1">
                <p className="font-medium">{dateTime.format(b.createdAt)}</p>
                <p className="text-sm text-cream-muted">
                  {KIND_LABELS[b.kind]} · {size(b.sizeBytes)} ·{" "}
                  {b.integrity === "ok" ? <span className="text-eating-text">check passed</span> : <span className="text-alert">check failed</span>}
                </p>
              </div>
              <a
                href={`/api/backups/${b.id}`}
                download
                className="inline-flex min-h-11 items-center rounded-xl border border-ink-600 px-4 text-sm font-semibold hover:bg-ink-800"
              >
                Download
              </a>
              <Button
                variant="danger"
                disabled={pending || b.integrity !== "ok"}
                onClick={() => {
                  setConfirmed(false);
                  setMessage(null);
                  setRestoring(b);
                }}
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={restoring !== null} title="Restore this backup?" onClose={() => setRestoring(null)}>
        {restoring ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await restoreBackupAction(restoring.id);
                // Only reached on failure; success goes to the sign-in screen.
                setMessage({ ok: false, text: result.error });
                setRestoring(null);
              });
            }}
          >
            <p>
              Everything — orders, menu, staff and settings — goes back to how it was on <strong>{dateTime.format(restoring.createdAt)}</strong>. Anything
              recorded since then will be gone from the till.
            </p>
            <p className="text-sm text-cream-muted">
              A backup of how things are right now is taken first, so you can undo this. Everyone, you included, will need to sign in again.
            </p>
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="size-5 accent-alert" />I understand
            </label>
            <FormError error={null} />
            <Button type="submit" variant="danger" className="w-full" disabled={!confirmed || pending}>
              {pending ? "Restoring…" : "Restore backup"}
            </Button>
          </form>
        ) : null}
      </Dialog>
    </section>
  );
}
