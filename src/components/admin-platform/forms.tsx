"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { adminLoginAction, adminSetupAction, createBusinessAction, renewSetupLinkAction, setBusinessActiveAction, type AdminFormState } from "@/app/admin/actions";
import { Button, Field, FormError, inputClass } from "@/components/admin/ui";
import { slugify } from "@/lib/tenancy/slug";

function Submit({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  return (
    <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl bg-amber font-semibold text-amber-ink enabled:hover:bg-[#f5b552] disabled:opacity-50">
      {pending ? busy : idle}
    </button>
  );
}

/** The first seller account: needs the server's setup code. */
export function AdminSetupForm() {
  const id = useId();
  const [state, formAction, pending] = useActionState<AdminFormState, FormData>(adminSetupAction, null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  return (
    <form action={formAction} className="mt-8 space-y-4">
      <Field id={`${id}-code`} label="Server setup code" hint="The ENYO_ADMIN_SETUP_CODE set on this server.">
        <input id={`${id}-code`} name="code" type="password" required autoComplete="off" className={inputClass} />
      </Field>
      <Field id={`${id}-name`} label="Your name">
        <input id={`${id}-name`} name="name" required maxLength={60} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </Field>
      <Field id={`${id}-email`} label="Email">
        <input id={`${id}-email`} name="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      </Field>
      <Field id={`${id}-password`} label="Password" hint="At least 12 characters.">
        <input id={`${id}-password`} name="password" type="password" required minLength={12} autoComplete="new-password" className={inputClass} />
      </Field>
      <FormError error={state?.error ?? null} />
      <Submit pending={pending} idle="Create the seller account" busy="Creating…" />
    </form>
  );
}

export function AdminLoginForm() {
  const id = useId();
  const [state, formAction, pending] = useActionState<AdminFormState, FormData>(adminLoginAction, null);
  const [email, setEmail] = useState("");
  return (
    <form action={formAction} className="mt-8 space-y-4">
      <Field id={`${id}-email`} label="Email">
        <input id={`${id}-email`} name="email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      </Field>
      <Field id={`${id}-password`} label="Password">
        <input id={`${id}-password`} name="password" type="password" required autoComplete="current-password" className={inputClass} />
      </Field>
      <FormError error={state?.error ?? null} />
      <Submit pending={pending} idle="Sign in" busy="Signing in…" />
    </form>
  );
}

/** The one-time setup link for a client, with a copy button. */
function SetupLink({ link, onDone }: { link: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="space-y-2 rounded-xl border border-amber bg-amber-soft p-4">
      <p className="font-semibold">Send this setup link to the client. It works once, for 14 days, and won&rsquo;t be shown again.</p>
      <code data-setup-link className="block break-all rounded bg-ink-950 p-3 text-sm">
        {link}
      </code>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}

const linkFor = (slug: string, code: string) => `${window.location.origin}/c/${slug}/hq/setup?code=${encodeURIComponent(code)}`;

export function NewBusinessForm() {
  const id = useId();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      {link ? <SetupLink link={link} onDone={() => setLink(null)} /> : null}
      <form
        className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await createBusinessAction({ name, slug });
            if (!result.ok) return setError(result.error);
            setError(null);
            setLink(linkFor(result.slug, result.setupCode));
            setName("");
            setSlug("");
            setEdited(false);
          });
        }}
      >
        <Field id={`${id}-name`} label="Client's business name">
          <input
            id={`${id}-name`}
            required
            maxLength={60}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!edited) setSlug(slugify(e.target.value));
            }}
            className={inputClass}
          />
        </Field>
        <Field id={`${id}-slug`} label="Address name">
          <input
            id={`${id}-slug`}
            required
            minLength={2}
            maxLength={32}
            autoCapitalize="none"
            spellCheck={false}
            value={slug}
            onChange={(e) => {
              setEdited(true);
              setSlug(e.target.value.toLowerCase());
            }}
            className={inputClass}
          />
        </Field>
        <Button type="submit" variant="primary" disabled={pending}>
          Add client
        </Button>
      </form>
      <FormError error={error} />
    </div>
  );
}

/** Suspend, reactivate and new setup link for one client. */
export function BusinessControls({ business }: { business: { id: string; name: string; active: boolean; setUp: boolean } }) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {!business.setUp ? (
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await renewSetupLinkAction(business.id);
                if (!result.ok) return setError(result.error);
                setError(null);
                setLink(linkFor(result.slug, result.setupCode));
              })
            }
          >
            New setup link
          </Button>
        ) : null}
        <Button
          variant={business.active ? "danger" : "secondary"}
          disabled={pending}
          onClick={() => {
            if (business.active && !window.confirm(`Suspend ${business.name}? Nobody there can use ENYO Online until you reactivate it. Nothing is deleted.`)) return;
            startTransition(async () => {
              const result = await setBusinessActiveAction(business.id, !business.active);
              setError(result.ok ? null : result.error);
            });
          }}
        >
          {business.active ? "Suspend" : "Reactivate"}
        </Button>
      </div>
      {link ? <SetupLink link={link} onDone={() => setLink(null)} /> : null}
      <FormError error={error} />
    </div>
  );
}
