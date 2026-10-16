"use client";

import { forwardRef, useId, useState, useTransition } from "react";
import { setDiscountAction } from "@/app/b/[branch]/(till)/pay/actions";
import { Icon } from "@/components/icons";
import { parseCedis, percentOf } from "@/lib/payments/bill";
import { QUICK_DISCOUNT_REASONS } from "@/lib/payments/labels";
import { formatCedis } from "@/lib/money";

type Props = {
  orderId: string;
  subtotal: number;
  /** Owners and managers approve their own discounts. */
  canApprove: boolean;
  approvers: { id: string; name: string }[];
  onClose: () => void;
};

const field =
  "mt-1 h-12 w-full rounded-xl border border-ink-600 bg-ink-900 px-3 text-cream placeholder:text-cream-faint/70 focus:border-amber focus:outline-none";

/** Discount with a reason; a cashier or server needs an owner or manager to enter their PIN. */
export const DiscountDialog = forwardRef<HTMLDialogElement, Props>(function DiscountDialog(
  { orderId, subtotal, canApprove, approvers, onClose },
  ref
) {
  const id = useId();
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [approverId, setApproverId] = useState(approvers[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const numeric = kind === "percent" ? Number(value) : parseCedis(value);
  const preview = value && numeric !== null && Number.isFinite(numeric) ? (kind === "percent" ? percentOf(subtotal, numeric) : numeric) : null;

  const close = () => {
    setPin("");
    setError(null);
    onClose();
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (preview === null) return setError("Enter the discount.");
    startTransition(async () => {
      const result = await setDiscountAction(
        orderId,
        { kind, value: kind === "percent" ? Number(value) : preview, reason },
        canApprove ? null : { staffId: approverId, pin }
      );
      if (!result.ok) {
        setError(result.error);
        setPin("");
        return;
      }
      setValue("");
      setReason("");
      close();
    });
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      onClose={close}
      className="m-auto w-[min(30rem,calc(100%-2rem))] rounded-2xl border border-ink-700 bg-ink-900 p-0 text-cream backdrop:bg-black/60"
    >
      <form onSubmit={submit} className="p-5">
        <div className="flex items-center justify-between">
          <h2 id={`${id}-title`} className="font-display text-xl font-bold">
            Add discount
          </h2>
          <button type="button" onClick={close} aria-label="Close" className="grid size-11 place-items-center rounded-xl hover:bg-ink-800">
            <Icon name="plus" className="size-5 rotate-45" />
          </button>
        </div>
        <p className="text-sm text-cream-muted">Taken off before tax, on a subtotal of {formatCedis(subtotal)}.</p>

        <div role="radiogroup" aria-label="Discount type" className="mt-4 grid grid-cols-2 rounded-xl bg-ink-950 p-1">
          {(["percent", "amount"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`min-h-11 rounded-lg text-sm font-medium ${kind === k ? "bg-ink-700 text-cream" : "text-cream-muted"}`}
            >
              {k === "percent" ? "Percentage" : "Amount (GH₵)"}
            </button>
          ))}
        </div>

        <label className="mt-3 block text-sm text-cream-muted" htmlFor={`${id}-value`}>
          {kind === "percent" ? "Percentage off" : "Amount off (GH₵)"}
        </label>
        <input
          id={`${id}-value`}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={kind === "percent" ? "e.g. 10" : "e.g. 40.00"}
          className={field}
        />
        {preview !== null ? <p className="mt-1 text-sm text-eating-text">−{formatCedis(Math.min(preview, subtotal))} before tax</p> : null}

        <label className="mt-3 block text-sm text-cream-muted" htmlFor={`${id}-reason`}>
          Reason
        </label>
        <input id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={80} autoComplete="off" className={field} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_DISCOUNT_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className="min-h-11 rounded-full border border-ink-600 px-3.5 text-sm text-cream-muted hover:border-amber hover:text-cream"
            >
              {r}
            </button>
          ))}
        </div>

        {!canApprove ? (
          <fieldset className="mt-4 rounded-xl border border-ink-700 p-3">
            <legend className="px-1 text-sm font-semibold">Manager approval</legend>
            <label className="block text-sm text-cream-muted" htmlFor={`${id}-approver`}>
              Manager
            </label>
            <select id={`${id}-approver`} value={approverId} onChange={(e) => setApproverId(e.target.value)} className={field}>
              {approvers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <label className="mt-2 block text-sm text-cream-muted" htmlFor={`${id}-pin`}>
              Their PIN
            </label>
            <input
              id={`${id}-pin`}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className={`${field} tracking-[0.5em]`}
            />
          </fieldset>
        ) : null}

        <p role="alert" className="mt-3 min-h-5 text-sm text-alert">
          {error}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="mt-1 min-h-12 w-full rounded-xl bg-amber font-semibold text-amber-ink enabled:hover:bg-[#f5b552] disabled:opacity-50"
        >
          {pending ? "Applying…" : "Apply discount"}
        </button>
      </form>
    </dialog>
  );
});
