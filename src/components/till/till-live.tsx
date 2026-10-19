"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useBranch, useBranchPath } from "@/components/tenancy/branch-context";

export const READY_EVENT = "enyo:ready";
export type ReadyDetail = { orderNumber: number; label: string };

/**
 * Switching between the restaurant's main computer and ENYO Online.
 * onlineUrl (on the main computer): this branch's ENYO Online address, offered
 * once the main computer has been out of reach for afterMs.
 * checkBack (on ENYO Online): ask every pollMs whether the main computer is
 * syncing again, and offer to switch back to it.
 */
export type Failover = { onlineUrl?: string | null; checkBack?: boolean; afterMs: number; pollMs: number };

/**
 * Keeps this screen in step with every other till: listens to the server's
 * live events and refetches the page's data when anything changes. Shows a
 * banner if the connection drops; EventSource reconnects on its own. With a
 * failover, also offers ENYO Online when the main computer is down, and the
 * way back once it's up again.
 */
export function TillLive({ eventsPath = "/api/events", failover }: { eventsPath?: string; failover?: Failover }) {
  const router = useRouter();
  const eventsUrl = useBranchPath()(eventsPath);
  const { base } = useBranch();
  const [lostSince, setLostSince] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [backUrl, setBackUrl] = useState<string | null>(null);
  const [stayOnline, setStayOnline] = useState(false);

  useEffect(() => {
    const source = new EventSource(eventsUrl);
    let refreshTimer: number | undefined;
    let lostTimer: number | undefined;
    let wasLost = false;

    // Coalesce bursts (e.g. several bumps) into one refetch.
    const refresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => router.refresh(), 80);
    };

    source.onopen = () => {
      window.clearTimeout(lostTimer);
      lostTimer = undefined;
      setLostSince(null);
      // Catch up on anything missed while disconnected.
      if (wasLost) refresh();
      wasLost = false;
    };
    source.onerror = () => {
      wasLost = true;
      // A refused connection (e.g. signed out elsewhere) won't retry: refetch, which sends us to sign-in.
      if (source.readyState === EventSource.CLOSED) refresh();
      // Counted from the first failure: the browser retries every couple of seconds, and each
      // retry fails again while the server is down, so the timer mustn't restart each time.
      if (lostTimer === undefined) {
        const since = Date.now();
        lostTimer = window.setTimeout(() => setLostSince((s) => s ?? since), 3000);
      }
    };
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as { type: string } & Partial<ReadyDetail>;
      if (event.type === "ready") {
        window.dispatchEvent(new CustomEvent<ReadyDetail>(READY_EVENT, { detail: { orderNumber: event.orderNumber!, label: event.label! } }));
      }
      refresh();
    };

    return () => {
      source.close();
      window.clearTimeout(refreshTimer);
      window.clearTimeout(lostTimer);
    };
  }, [router, eventsUrl]);

  // On the main computer: tick while it's out of reach, to offer ENYO Online in time.
  const onlineUrl = failover?.onlineUrl ?? null;
  useEffect(() => {
    if (lostSince === null || !onlineUrl) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [lostSince, onlineUrl]);

  // On ENYO Online: is the main computer this device came from syncing again?
  const checkBack = failover?.checkBack === true;
  const pollMs = failover?.pollMs ?? 15_000;
  useEffect(() => {
    if (!checkBack) return;
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch(`${base}/api/peer`, { cache: "no-store" });
        const answer = (await response.json()) as { back?: boolean; url?: string | null };
        if (!stopped) setBackUrl(answer.back && answer.url ? answer.url : null);
      } catch {
        // ENYO Online itself unreachable: nothing to offer.
      }
    };
    void poll();
    const timer = window.setInterval(poll, pollMs);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [checkBack, base, pollMs]);

  /** The same screen at another address: /order here → /order there. */
  const samePageAt = (target: string) => `${target}${window.location.pathname.slice(base.length)}${window.location.search}`;
  const bar = "fixed inset-x-0 top-0 z-[70] flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 text-center text-sm font-semibold";
  const link = "inline-flex min-h-11 items-center rounded-lg bg-white px-3 font-semibold text-ink-950 hover:bg-cream";

  if (lostSince !== null && onlineUrl && now - lostSince >= (failover?.afterMs ?? 30_000)) {
    return (
      <div role="alert" className={`${bar} bg-alert text-white`}>
        <span>The main computer is offline. You can carry on with ENYO Online (needs the internet); unsaved changes on this screen stay here.</span>
        <a href={samePageAt(onlineUrl)} className={link}>
          Continue online
        </a>
      </div>
    );
  }
  if (lostSince !== null) {
    return (
      <div role="alert" className={`${bar} bg-alert text-white`}>
        Lost connection to the {checkBack ? "server" : "main computer"}. Reconnecting…
      </div>
    );
  }
  if (backUrl && !stayOnline) {
    return (
      <div role="status" className={`${bar} bg-eating-strong text-white`}>
        <span>The main computer is back. Everything done here has reached it.</span>
        <a href={samePageAt(backUrl)} className={link}>
          Switch back
        </a>
        <button type="button" onClick={() => setStayOnline(true)} className="inline-flex min-h-11 items-center rounded-lg border border-white/60 px-3 hover:bg-white/10">
          Stay online
        </button>
      </div>
    );
  }
  return null;
}
