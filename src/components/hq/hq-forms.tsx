"use client";

import { useActionState, useId, useState, type ReactNode } from "react";
import {
  claimAction,
  createBranchAction,
  loginAction,
  setupAction,
  type HqFormState,
} from "@/app/hq/actions";
import { Field, FormError, inputClass } from "@/components/admin/ui";
import { slugify } from "@/lib/tenancy/slug";

// Fields are controlled so a failed attempt doesn't wipe what was typed
// (React resets uncontrolled fields after a form action). Passwords and PINs
// are re-entered on purpose.

function useText(initial = "") {
  const [value, setValue] = useState(initial);
  return { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value), set: setValue };
}

function Submit({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-12 w-full rounded-xl bg-amber font-semibold text-amber-ink enabled:hover:bg-[#f5b552] disabled:opacity-50"
    >
      {pending ? busy : idle}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-2xl border border-ink-700 bg-ink-850/60 p-4">
      <legend className="px-1 font-display text-lg font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function PinFields({ id, label }: { id: string; label: string }) {
  const pin = `${inputClass} tracking-[0.5em]`;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id={`${id}-pin`} label={label}>
        <input id={`${id}-pin`} name="pin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="new-password" className={pin} />
      </Field>
      <Field id={`${id}-confirm`} label="PIN again">
        <input id={`${id}-confirm`} name="confirmPin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="new-password" className={pin} />
      </Field>
    </div>
  );
}

/** Branch name plus its address, which follows the name until edited by hand. */
function BranchNameFields({ id, addressHint }: { id: string; addressHint: string }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  return (
    <>
      <Field id={`${id}-branch`} label="Branch name" hint="For example Chez Accra Osu.">
        <input
          id={`${id}-branch`}
          name="branchName"
          required
          maxLength={60}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugEdited) setSlug(slugify(e.target.value));
          }}
          className={inputClass}
        />
      </Field>
      <Field id={`${id}-slug`} label="Branch address" hint={addressHint}>
        <input
          id={`${id}-slug`}
          name="branchSlug"
          required
          minLength={2}
          maxLength={32}
          pattern="[a-z0-9][a-z0-9\-]*[a-z0-9]"
          autoCapitalize="none"
          spellCheck={false}
          value={slug}
          onChange={(e) => {
            setSlugEdited(true);
            setSlug(e.target.value.toLowerCase());
          }}
          className={inputClass}
        />
      </Field>
    </>
  );
}

const ADDRESS_HINT = "Lower-case letters, numbers and dashes. With your own domain it becomes osu.yourdomain.com.";

/** setupCode: on ENYO Online, the code from the business's one-time setup link. */
export function HqSetupForm({ setupCode }: { setupCode?: string }) {
  const id = useId();
  const [state, formAction, pending] = useActionState<HqFormState, FormData>(setupAction, null);
  const business = useText();
  const name = useText();
  const email = useText();
  const [sampleMenu, setSampleMenu] = useState(true);

  return (
    <form action={formAction} className="mt-8 space-y-6">
      {setupCode ? <input type="hidden" name="setupCode" value={setupCode} /> : null}
      <Section title="Your business">
        <Field id={`${id}-business`} label="Business name" hint="The name over all your branches.">
          <input id={`${id}-business`} name="businessName" required maxLength={60} autoComplete="organization" {...business} className={inputClass} />
        </Field>
      </Section>
      <Section title="Head office sign-in">
        <Field id={`${id}-name`} label="Your name">
          <input id={`${id}-name`} name="name" required maxLength={60} autoComplete="name" {...name} className={inputClass} />
        </Field>
        <Field id={`${id}-email`} label="Email">
          <input id={`${id}-email`} name="email" type="email" required autoComplete="email" {...email} className={inputClass} />
        </Field>
        <Field id={`${id}-password`} label="Password" hint="At least 10 characters.">
          <input id={`${id}-password`} name="password" type="password" required minLength={10} autoComplete="new-password" className={inputClass} />
        </Field>
      </Section>
      <Section title="First branch">
        <BranchNameFields id={id} addressHint={ADDRESS_HINT} />
        <PinFields id={id} label="Your 4-digit PIN at this branch" />
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-ink-700 bg-ink-850 p-4">
          <input type="checkbox" name="sampleMenu" checked={sampleMenu} onChange={(e) => setSampleMenu(e.target.checked)} className="mt-1 size-5 accent-amber" />
          <span>
            <span className="font-semibold">Start with the sample menu</span>
            <span className="block text-sm text-cream-muted">16 Ghanaian dishes and drinks in five categories. Edit, remove or replace them any time.</span>
          </span>
        </label>
      </Section>
      <FormError error={state?.error ?? null} />
      <Submit pending={pending} idle="Set up and sign in" busy="Setting up…" />
    </form>
  );
}

export function HqLoginForm() {
  const id = useId();
  const [state, formAction, pending] = useActionState<HqFormState, FormData>(loginAction, null);
  const email = useText();
  return (
    <form action={formAction} className="mt-8 space-y-4">
      <Field id={`${id}-email`} label="Email">
        <input id={`${id}-email`} name="email" type="email" required autoComplete="username" {...email} className={inputClass} />
      </Field>
      <Field id={`${id}-password`} label="Password">
        <input id={`${id}-password`} name="password" type="password" required autoComplete="current-password" className={inputClass} />
      </Field>
      <FormError error={state?.error ?? null} />
      <Submit pending={pending} idle="Sign in" busy="Signing in…" />
    </form>
  );
}

export type ClaimOwner = { value: string; label: string };

export function HqClaimForm({ owners }: { owners: ClaimOwner[] }) {
  const id = useId();
  const [state, formAction, pending] = useActionState<HqFormState, FormData>(claimAction, null);
  const [owner, setOwner] = useState(owners[0]?.value ?? "");
  const name = useText();
  const email = useText();
  return (
    <form action={formAction} className="mt-8 space-y-6">
      <Section title="Prove you're an owner">
        <Field id={`${id}-owner`} label="Owner">
          <select id={`${id}-owner`} name="owner" required value={owner} onChange={(e) => setOwner(e.target.value)} className={inputClass}>
            {owners.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id={`${id}-pin`} label="Their PIN">
          <input id={`${id}-pin`} name="pin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="off" className={`${inputClass} tracking-[0.5em]`} />
        </Field>
      </Section>
      <Section title="Head office sign-in">
        <Field id={`${id}-name`} label="Your name">
          <input id={`${id}-name`} name="name" required maxLength={60} autoComplete="name" {...name} className={inputClass} />
        </Field>
        <Field id={`${id}-email`} label="Email">
          <input id={`${id}-email`} name="email" type="email" required autoComplete="email" {...email} className={inputClass} />
        </Field>
        <Field id={`${id}-password`} label="Password" hint="At least 10 characters.">
          <input id={`${id}-password`} name="password" type="password" required minLength={10} autoComplete="new-password" className={inputClass} />
        </Field>
      </Section>
      <FormError error={state?.error ?? null} />
      <Submit pending={pending} idle="Create head office sign-in" busy="Creating…" />
    </form>
  );
}

export function NewBranchForm({ branches }: { branches: { id: string; name: string }[] }) {
  const id = useId();
  const [state, formAction, pending] = useActionState<HqFormState, FormData>(createBranchAction, null);
  const lead = useText();
  const [menu, setMenu] = useState(branches[0] ? `copy:${branches[0].id}` : "sample");

  const options = [
    ...branches.map((b) => ({ value: `copy:${b.id}`, label: `Copy the menu from ${b.name}`, hint: "Categories, dishes and prices. Change them at the new branch afterwards." })),
    { value: "sample", label: "Sample menu", hint: "16 Ghanaian dishes and drinks." },
    { value: "empty", label: "Empty menu", hint: "Build it from scratch at the branch." },
  ];

  return (
    <form action={formAction} className="mt-8 space-y-6">
      <Section title="Branch">
        <BranchNameFields id={id} addressHint={ADDRESS_HINT} />
      </Section>
      <Section title="Who runs it">
        <Field id={`${id}-lead`} label="Branch lead's name" hint="They become the branch's owner and can add its staff.">
          <input id={`${id}-lead`} name="leadName" required maxLength={40} {...lead} className={inputClass} />
        </Field>
        <PinFields id={id} label="Their 4-digit PIN" />
      </Section>
      <fieldset className="space-y-2 rounded-2xl border border-ink-700 bg-ink-850/60 p-4">
        <legend className="px-1 font-display text-lg font-semibold">Menu</legend>
        {options.map((o) => (
          <label key={o.value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-ink-700 bg-ink-850 p-3">
            <input type="radio" name="menu" value={o.value} checked={menu === o.value} onChange={() => setMenu(o.value)} className="mt-1 size-5 accent-amber" />
            <span>
              <span className="font-semibold">{o.label}</span>
              <span className="block text-sm text-cream-muted">{o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <FormError error={state?.error ?? null} />
      <Submit pending={pending} idle="Create branch" busy="Creating…" />
    </form>
  );
}
