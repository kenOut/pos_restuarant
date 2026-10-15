"use client";

import { useActionState, useId, useState } from "react";
import { setupAction, type SetupState } from "@/app/setup/actions";
import { Field, FormError, inputClass } from "@/components/admin/ui";

export function SetupForm() {
  const id = useId();
  const [state, formAction, pending] = useActionState<SetupState, FormData>(setupAction, null);
  // Controlled so a failed attempt (e.g. PINs that don't match) doesn't wipe what was typed:
  // React resets uncontrolled fields after a form action. The PINs are re-entered on purpose.
  const [restaurantName, setRestaurantName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [sampleMenu, setSampleMenu] = useState(true);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <Field id={`${id}-restaurant`} label="Restaurant name">
        <input id={`${id}-restaurant`} name="restaurantName" required maxLength={60} autoComplete="organization" value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} className={inputClass} />
      </Field>
      <Field id={`${id}-owner`} label="Your name" hint="Shown on the sign-in screen and on receipts you serve.">
        <input id={`${id}-owner`} name="ownerName" required maxLength={40} autoComplete="name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputClass} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-pin`} label="Your 4-digit PIN">
          <input id={`${id}-pin`} name="pin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="new-password" className={`${inputClass} tracking-[0.5em]`} />
        </Field>
        <Field id={`${id}-confirm`} label="PIN again">
          <input id={`${id}-confirm`} name="confirmPin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="new-password" className={`${inputClass} tracking-[0.5em]`} />
        </Field>
      </div>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-ink-700 bg-ink-850 p-4">
        <input type="checkbox" name="sampleMenu" checked={sampleMenu} onChange={(e) => setSampleMenu(e.target.checked)} className="mt-1 size-5 accent-amber" />
        <span>
          <span className="font-semibold">Start with the sample menu</span>
          <span className="block text-sm text-cream-muted">16 Ghanaian dishes and drinks in five categories. Edit, remove or replace them any time.</span>
        </span>
      </label>
      <FormError error={state?.error ?? null} />
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-xl bg-amber font-semibold text-amber-ink enabled:hover:bg-[#f5b552] disabled:opacity-50"
      >
        {pending ? "Setting up…" : "Set up and sign in"}
      </button>
    </form>
  );
}
