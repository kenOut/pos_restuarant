"use client";

import { Icon } from "@/components/icons";

/** Shown in place of a till screen if it fails, keeping the sidebar so staff can move on or lock. */
export default function TillError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="grid h-full place-items-center px-4 py-16 text-center">
      <div className="max-w-md">
        <Icon name="wifiOff" className="mx-auto size-10 text-alert" />
        <h1 className="mt-4 font-display text-2xl font-bold">This screen couldn&rsquo;t load</h1>
        <p className="mt-2 text-cream-muted">
          Nothing you&rsquo;ve already sent or held is lost. Try again; if it keeps happening, check that the main computer is
          switched on and connected.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-amber px-6 font-semibold text-amber-ink hover:bg-[#f5b552]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
