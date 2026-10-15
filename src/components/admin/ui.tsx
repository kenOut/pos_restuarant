"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "@/components/icons";

/** Shared look for the management screens (menu, staff, settings, setup). */

export const inputClass =
  "mt-1 h-12 w-full rounded-xl border border-ink-600 bg-ink-900 px-3 text-cream placeholder:text-cream-faint/70 focus:border-amber focus:outline-none disabled:opacity-60";

const BUTTON = {
  primary: "bg-amber text-amber-ink enabled:hover:bg-[#f5b552]",
  secondary: "border border-ink-600 bg-ink-850 text-cream enabled:hover:bg-ink-800",
  danger: "border border-alert/60 text-alert enabled:hover:bg-alert-soft",
} as const;

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold whitespace-nowrap enabled:active:scale-[0.98] disabled:opacity-40 ${BUTTON[variant]} ${className}`}
    />
  );
}

/** Square icon button with an accessible name. */
export function IconButton({ label, icon, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: Parameters<typeof Icon>[0]["name"] }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={`grid size-11 shrink-0 place-items-center rounded-xl border border-ink-700 text-cream-muted enabled:hover:bg-ink-800 enabled:hover:text-cream disabled:opacity-30 ${className}`}
    >
      <Icon name={icon} className="size-5" />
    </button>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-ink-700 p-3 sm:p-4">
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        {description ? <p className="text-sm text-cream-muted">{description}</p> : null}
      </div>
      {actions}
    </header>
  );
}

export function Field({ label, hint, children, id }: { label: string; hint?: string; children: ReactNode; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm text-cream-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-cream-faint">{hint}</p> : null}
    </div>
  );
}

/** Message area for a form's last error (announced to screen readers). */
export function FormError({ error }: { error: string | null }) {
  return (
    <p role="alert" className="min-h-5 text-sm text-alert">
      {error}
    </p>
  );
}

/** Modal dialog that opens while `open` is true. Escape and the ✕ call onClose. */
export function Dialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto max-h-[90dvh] w-[min(32rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-ink-700 bg-ink-900 p-0 text-cream backdrop:bg-black/60"
    >
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-display text-xl font-bold">
            {title}
          </h2>
          <IconButton label="Close" icon="plus" className="[&_svg]:rotate-45" onClick={onClose} />
        </div>
        {open ? <div className="mt-3">{children}</div> : null}
      </div>
    </dialog>
  );
}
