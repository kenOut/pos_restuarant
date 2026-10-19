"use client";

import { useId, useState, useTransition } from "react";
import { connectOnlineAction, createPairingKeyAction, disconnectOnlineAction, pairFromSetupAction, resyncAction, syncNowAction } from "@/app/hq/actions";
import { Button, Field, FormError, inputClass } from "@/components/admin/ui";

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" });
type Result = { ok: true } | { ok: false; error: string };

/** The address and key to type in at the restaurant's computer, shown once. */
function KeyToCopy({ address, keyValue, onDone }: { address: string; keyValue: string; onDone?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="space-y-2 rounded-xl border border-amber bg-amber-soft p-4 text-sm">
      <p className="font-semibold">On the restaurant&rsquo;s main computer, open Head office › ENYO Online and enter these. The key won&rsquo;t be shown again.</p>
      <p>
        Address: <code data-sync-address className="break-all rounded bg-ink-950 px-1">{address}</code>
      </p>
      <p>
        Key: <code data-sync-key className="break-all rounded bg-ink-950 px-1">{keyValue}</code>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(keyValue);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : "Copy key"}
        </Button>
        {onDone ? <Button onClick={onDone}>Done</Button> : null}
      </div>
    </div>
  );
}

/** ENYO Online's head office: the restaurant computer this business syncs with. */
export function RestaurantComputerPanel({ paired, lastContactAt }: { paired: boolean; lastContactAt: number | null }) {
  const [shown, setShown] = useState<{ key: string; address: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const make = () => {
    if (paired && !window.confirm("A new key disconnects the restaurant computer now syncing until the new key is entered there. Continue?")) return;
    startTransition(async () => {
      const result = await createPairingKeyAction();
      if (!result.ok) return setError(result.error);
      setError(null);
      setShown({ key: result.key, address: result.address });
    });
  };
  return (
    <section aria-labelledby="computer" className="mt-10 rounded-2xl border border-ink-700 bg-ink-850 p-4">
      <h2 id="computer" className="font-display text-xl font-semibold">
        Restaurant computer
      </h2>
      <p className="mt-1 text-sm text-cream-muted">
        {paired
          ? lastContactAt
            ? `In step with the restaurant's main computer. Last contact ${when.format(lastContactAt)}.`
            : "A key has been made; waiting for the restaurant's computer to connect."
          : "Connect the restaurant's main computer, so both keep the same data and either can carry on if the other is down."}
      </p>
      <div className="mt-3 space-y-3">
        {shown ? <KeyToCopy address={shown.address} keyValue={shown.key} onDone={() => setShown(null)} /> : null}
        <Button onClick={make} disabled={pending}>
          {paired ? "Make a new key" : "Connect the restaurant's computer"}
        </Button>
        <FormError error={error} />
      </div>
    </section>
  );
}

/** ENYO Online setup, for a business that already runs ENYO POS on its own computer. */
export function PairFromSetup({ setupCode }: { setupCode: string }) {
  const [shown, setShown] = useState<{ key: string; address: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (shown) return <KeyToCopy address={shown.address} keyValue={shown.key} />;
  return (
    <div className="mt-8 space-y-2 rounded-2xl border border-ink-700 bg-ink-850 p-4">
      <p className="font-semibold">Already using ENYO POS on your restaurant&rsquo;s computer?</p>
      <p className="text-sm text-cream-muted">Connect it instead of setting up here: your menu, staff, sales and head office sign-in come across from it.</p>
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await pairFromSetupAction(setupCode);
            if (!result.ok) return setError(result.error);
            setShown({ key: result.key, address: result.address });
          })
        }
      >
        Connect our restaurant computer
      </Button>
      <FormError error={error} />
    </div>
  );
}

/** The restaurant's computer: connect to ENYO Online (head office, or first-time setup). */
export function ConnectOnlineForm({ fromSetup = false }: { fromSetup?: boolean }) {
  const id = useId();
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await connectOnlineAction({ url, key });
          setError(result && !result.ok ? result.error : null);
          if (result?.ok) setKey("");
        });
      }}
    >
      <Field id={`${id}-url`} label="ENYO Online address" hint="As ENYO Online shows it, e.g. https://posrestuarant.up.railway.app/c/mamaakos">
        <input id={`${id}-url`} name="url" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} />
      </Field>
      <Field id={`${id}-key`} label="Sync key">
        <input id={`${id}-key`} name="key" required autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} className={inputClass} />
      </Field>
      <FormError error={error} />
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? (fromSetup ? "Bringing your business across…" : "Connecting…") : "Connect"}
      </Button>
    </form>
  );
}

type Status = { url: string | null; lastContactAt: number | null; lastError: string | null; waiting: number };

/** The restaurant's head office: sync status and controls. */
export function OnlinePanel({ status }: { status: Status | null }) {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<Result>, done: string) =>
    startTransition(async () => {
      const result = await action();
      setError(result.ok ? null : result.error);
      setMessage(result.ok ? done : null);
    });
  return (
    <section aria-labelledby="online" className="mt-10 rounded-2xl border border-ink-700 bg-ink-850 p-4">
      <h2 id="online" className="font-display text-xl font-semibold">
        ENYO Online
      </h2>
      {status ? (
        <div className="mt-2 space-y-3 text-sm">
          <p>
            Connected to <code className="break-all rounded bg-ink-950 px-1">{status.url}</code>
          </p>
          <dl className="grid gap-2 sm:grid-cols-3">
            <div>
              <dt className="text-cream-muted">Last contact</dt>
              <dd data-sync-contact className="font-semibold">{status.lastContactAt ? when.format(status.lastContactAt) : "Not yet"}</dd>
            </div>
            <div>
              <dt className="text-cream-muted">Changes waiting to send</dt>
              <dd data-sync-waiting className="font-semibold tabular-nums">{status.waiting}</dd>
            </div>
          </dl>
          {status.lastError ? (
            <p role="alert" className="rounded-xl bg-alert-soft px-3 py-2">
              {status.lastError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run(syncNowAction, "In step with ENYO Online.")} disabled={pending}>
              Sync now
            </Button>
            <Button onClick={() => run(resyncAction, "Everything has been sent and collected again.")} disabled={pending}>
              Sync everything again
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => window.confirm("Stop syncing with ENYO Online? Both keep their data; changes made from now on stay on each side.") && run(disconnectOnlineAction, "Disconnected.")}
            >
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-cream-muted">
            Keep this business in step with ENYO Online, so it can be seen and used over the internet, and either side carries on if the other is down. Get the address and key from ENYO Online&rsquo;s head office.
          </p>
          <ConnectOnlineForm />
        </div>
      )}
      <FormError error={error} />
      {message ? (
        <p role="status" className="mt-2 text-sm text-eating-text">
          {message}
        </p>
      ) : null}
    </section>
  );
}
