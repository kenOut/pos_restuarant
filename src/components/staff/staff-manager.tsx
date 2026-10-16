"use client";

import { useId, useState, useTransition } from "react";
import { createStaffAction, resetPinAction, setStaffActiveAction, unlockStaffAction, updateStaffAction } from "@/app/b/[branch]/(till)/staff/actions";
import { Button, Dialog, Field, FormError, PageHeader, inputClass } from "@/components/admin/ui";
import type { StaffRole } from "@/db/enums";
import { ROLE_LABELS } from "@/lib/auth/roles";
import type { StaffMember } from "@/lib/staff/service";

type Props = { staff: StaffMember[]; me: string; myRole: StaffRole; assignable: StaffRole[] };

type Editing =
  | { kind: "add"; name: string; initials: string; role: StaffRole; jobTitle: string; pin: string; confirm: string }
  | { kind: "edit"; id: string; name: string; initials: string; role: StaffRole; jobTitle: string }
  | { kind: "pin"; id: string; name: string; pin: string; confirm: string };

const pinInput = `${inputClass} tracking-[0.5em]`;

export function StaffManager({ staff, me, myRole, assignable }: Props) {
  const id = useId();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // useState with a lazy initialiser: the clock is read once, not during every render.
  const [now] = useState(() => Date.now());

  const canManage = (role: StaffRole) => assignable.includes(role);

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, message: string, close = true) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return setError(result.error ?? "Something went wrong.");
      setError(null);
      setNotice(message);
      if (close) setEditing(null);
    });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    if ((editing.kind === "add" || editing.kind === "pin") && editing.pin !== editing.confirm) return setError("The two PINs don't match.");
    if (editing.kind === "add") {
      run(() => createStaffAction({ name: editing.name, initials: editing.initials, role: editing.role, jobTitle: editing.jobTitle }, editing.pin), `${editing.name.trim()} added. They can sign in now.`);
    } else if (editing.kind === "edit") {
      run(() => updateStaffAction(editing.id, { name: editing.name, initials: editing.initials, role: editing.role, jobTitle: editing.jobTitle }), "Changes saved.");
    } else {
      run(() => resetPinAction(editing.id, editing.pin), `New PIN set for ${editing.name}.`);
    }
  };

  const active = staff.filter((s) => s.active);
  const inactive = staff.filter((s) => !s.active);

  const row = (s: StaffMember) => {
    const locked = s.lockedUntil !== null && s.lockedUntil > now;
    const manageable = canManage(s.role);
    return (
      <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 p-3">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-ink-700 font-bold text-amber">
          {s.initials}
        </span>
        <div className="min-w-40 flex-1">
          <p className="font-semibold">
            {s.name}
            {s.id === me ? <span className="text-cream-faint"> (you)</span> : null}
          </p>
          <p className="text-sm text-cream-muted">
            {ROLE_LABELS[s.role]}
            {s.jobTitle ? ` · ${s.jobTitle}` : ""}
          </p>
        </div>
        {locked ? <span className="rounded-full bg-alert-soft px-2.5 py-1 text-xs font-semibold text-alert">Locked out</span> : null}
        {!s.active ? <span className="rounded-full bg-ink-700 px-2.5 py-1 text-xs font-semibold">Inactive</span> : null}
        {manageable || s.id === me ? (
          <div className="flex flex-wrap gap-2">
            {locked && manageable ? (
              <Button disabled={pending} onClick={() => run(() => unlockStaffAction(s.id), `${s.name} can sign in again.`, false)}>
                Unlock
              </Button>
            ) : null}
            {manageable ? (
              <Button
                onClick={() => {
                  setError(null);
                  setEditing({ kind: "edit", id: s.id, name: s.name, initials: s.initials, role: s.role, jobTitle: s.jobTitle ?? "" });
                }}
              >
                Edit
              </Button>
            ) : null}
            <Button
              onClick={() => {
                setError(null);
                setEditing({ kind: "pin", id: s.id, name: s.name, pin: "", confirm: "" });
              }}
            >
              {s.id === me ? "Change my PIN" : "Reset PIN"}
            </Button>
            {manageable && s.id !== me ? (
              s.active ? (
                <Button
                  variant="danger"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`Deactivate ${s.name}? They'll be signed out on every till.`)) return;
                    run(() => setStaffActiveAction(s.id, false), `${s.name} deactivated and signed out.`, false);
                  }}
                >
                  Deactivate
                </Button>
              ) : (
                <Button disabled={pending} onClick={() => run(() => setStaffActiveAction(s.id, true), `${s.name} reactivated.`, false)}>
                  Reactivate
                </Button>
              )
            ) : null}
          </div>
        ) : null}
      </li>
    );
  };

  const roleSelect = (value: StaffRole, onChange: (role: StaffRole) => void) => (
    <Field id={`${id}-role`} label="Role" hint={myRole === "manager" ? "Managers can add cashiers, servers, bartenders and kitchen staff." : undefined}>
      <select id={`${id}-role`} value={value} onChange={(e) => onChange(e.target.value as StaffRole)} className={inputClass}>
        {assignable.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Staff"
        description="Everyone who can sign in on this restaurant's tills."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setError(null);
              setEditing({ kind: "add", name: "", initials: "", role: assignable.includes("server") ? "server" : assignable[0], jobTitle: "", pin: "", confirm: "" });
            }}
          >
            + Add staff
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <div aria-live="polite" className="mb-2">
          {!editing ? <FormError error={error} /> : null}
          {notice ? <p className="text-sm text-eating-text">{notice}</p> : null}
        </div>
        <h2 className="text-sm font-semibold text-cream-muted">Active · {active.length}</h2>
        <ul className="mt-2 space-y-2">{active.map(row)}</ul>
        {inactive.length ? (
          <>
            <h2 className="mt-6 text-sm font-semibold text-cream-muted">Inactive · {inactive.length}</h2>
            <ul className="mt-2 space-y-2">{inactive.map(row)}</ul>
          </>
        ) : null}
      </div>

      <Dialog
        open={editing !== null}
        title={editing?.kind === "add" ? "Add staff" : editing?.kind === "edit" ? "Edit staff" : `New PIN for ${editing?.name ?? ""}`}
        onClose={() => setEditing(null)}
      >
        {editing ? (
          <form onSubmit={submit} className="space-y-3">
            {editing.kind !== "pin" ? (
              <>
                <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
                  <Field id={`${id}-name`} label="Name">
                    <input id={`${id}-name`} required autoFocus maxLength={40} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputClass} />
                  </Field>
                  <Field id={`${id}-initials`} label="Initials" hint="Optional">
                    <input id={`${id}-initials`} maxLength={3} value={editing.initials} onChange={(e) => setEditing({ ...editing, initials: e.target.value.toUpperCase() })} className={inputClass} />
                  </Field>
                </div>
                {roleSelect(editing.role, (role) => setEditing({ ...editing, role }))}
                <Field id={`${id}-job`} label="Job title (optional)" hint="Shown under their name on the sign-in screen, e.g. Grill cook.">
                  <input id={`${id}-job`} maxLength={30} value={editing.jobTitle} onChange={(e) => setEditing({ ...editing, jobTitle: e.target.value })} className={inputClass} />
                </Field>
              </>
            ) : null}
            {editing.kind !== "edit" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id={`${id}-pin`} label={editing.kind === "add" ? "4-digit PIN" : "New 4-digit PIN"}>
                  <input id={`${id}-pin`} type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="new-password" value={editing.pin} onChange={(e) => setEditing({ ...editing, pin: e.target.value.replace(/\D/g, "") })} className={pinInput} />
                </Field>
                <Field id={`${id}-confirm`} label="PIN again">
                  <input id={`${id}-confirm`} type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="new-password" value={editing.confirm} onChange={(e) => setEditing({ ...editing, confirm: e.target.value.replace(/\D/g, "") })} className={pinInput} />
                </Field>
              </div>
            ) : null}
            {editing.kind === "pin" ? <p className="text-sm text-cream-muted">Setting a new PIN also clears a lockout from wrong PINs.</p> : null}
            <FormError error={error} />
            <Button type="submit" variant="primary" className="w-full" disabled={pending}>
              {pending ? "Saving…" : editing.kind === "add" ? "Add staff" : editing.kind === "edit" ? "Save changes" : "Set PIN"}
            </Button>
          </form>
        ) : null}
      </Dialog>
    </div>
  );
}
