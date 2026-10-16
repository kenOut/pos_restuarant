"use client";

import { useId, useState, useTransition } from "react";
import { createApiKeyAction, revokeApiKeyAction, saveAllowedOriginsAction } from "@/app/b/[branch]/office/actions";
import { Button, Field, FormError, inputClass } from "@/components/admin/ui";
import type { ApiKeyInfo } from "@/lib/api/keys";

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" });

type Props = { keys: ApiKeyInfo[]; origins: string[]; apiBase: string; canManage: boolean };

/** Settings → API access: keys for the read-only data API, and websites allowed to call it from a browser. */
export function ApiAccess({ keys, origins, apiBase, canManage }: Props) {
  const id = useId();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [originsText, setOriginsText] = useState(origins.join("\n"));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    startTransition(async () => {
      const result = await action();
      setError(result.ok ? null : (result.error ?? "Something went wrong."));
      setMessage(result.ok ? done : null);
    });

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5 rounded-2xl border border-ink-700 bg-ink-850 p-4 sm:p-5">
      <div>
        <h2 id={`${id}-title`} className="font-display text-xl font-semibold">
          API access
        </h2>
        <p className="mt-1 text-sm text-cream-muted">
          Lets your central system read this branch&rsquo;s orders, payments and receipts. It can&rsquo;t change anything. Send the key with each request as{" "}
          <code className="rounded bg-ink-900 px-1">Authorization: Bearer &lt;key&gt;</code>.
        </p>
        <p className="mt-2 text-sm">
          Address: <code className="break-all rounded bg-ink-900 px-1">{apiBase}</code>
        </p>
      </div>

      {created ? (
        <div role="status" className="space-y-2 rounded-xl border border-amber bg-amber-soft p-4">
          <p className="font-semibold">Key for {created.name}: copy it now. It won&rsquo;t be shown again.</p>
          <code data-api-key className="block break-all rounded bg-ink-950 p-3 text-sm">
            {created.key}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(created.key);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy key"}
            </Button>
            <Button onClick={() => setCreated(null)}>Done</Button>
          </div>
        </div>
      ) : null}

      {canManage ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await createApiKeyAction(name);
              if (!result.ok) return setError(result.error);
              setError(null);
              setMessage(null);
              setCopied(false);
              setCreated({ name: result.info.name, key: result.key });
              setName("");
            });
          }}
        >
          <div className="min-w-56 flex-1">
            <Field id={`${id}-name`} label="New key for" hint="What will use it, e.g. Head office sync.">
              <input id={`${id}-name`} required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Button type="submit" variant="primary" disabled={pending}>
            Create key
          </Button>
        </form>
      ) : (
        <p className="text-sm text-cream-muted">Only an owner can create or revoke keys.</p>
      )}

      {keys.length ? (
        <ul className="divide-y divide-ink-700 rounded-xl border border-ink-700">
          {keys.map((k) => (
            <li key={k.id} data-key-name={k.name} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {k.name}
                  {k.revokedAt ? <span className="ml-2 rounded-full bg-ink-700 px-2 py-0.5 text-xs">Revoked</span> : null}
                </p>
                <p className="text-cream-muted">
                  <code>{k.prefix}…</code> · created {when.format(k.createdAt)} by {k.createdBy} · {k.lastUsedAt ? `last used ${when.format(k.lastUsedAt)}` : "not used yet"}
                </p>
              </div>
              {canManage && !k.revokedAt ? (
                <Button variant="danger" disabled={pending} onClick={() => window.confirm(`Revoke the key for ${k.name}? Anything using it stops working at once.`) && run(() => revokeApiKeyAction(k.id), `Key for ${k.name} revoked.`)}>
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-cream-muted">No keys yet.</p>
      )}

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveAllowedOriginsAction(originsText), "Websites saved.");
        }}
      >
        <Field id={`${id}-origins`} label="Websites that may call the API from a browser (optional)" hint="One per line, e.g. https://dashboard.example.com. Servers calling the API don't need to be listed.">
          <textarea id={`${id}-origins`} rows={3} value={originsText} onChange={(e) => setOriginsText(e.target.value)} disabled={!canManage} className={`${inputClass} h-auto py-2`} />
        </Field>
        {canManage ? (
          <Button type="submit" disabled={pending}>
            Save websites
          </Button>
        ) : null}
      </form>

      <FormError error={error} />
      {message ? <p role="status" className="text-sm text-eating-text">{message}</p> : null}
    </section>
  );
}
