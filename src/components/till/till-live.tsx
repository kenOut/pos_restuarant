"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export const READY_EVENT = "enyo:ready";
export type ReadyDetail = { orderNumber: number; label: string };

/**
 * Keeps this screen in step with every other till: listens to the main
 * computer's live events and refetches the page's data when anything changes.
 * Shows a banner if the connection drops; EventSource reconnects on its own.
 */
export function TillLive() {
  const router = useRouter();
  const [lost, setLost] = useState(false);

  useEffect(() => {
    const source = new EventSource("/api/events");
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
      setLost(false);
      // Catch up on anything missed while disconnected.
      if (wasLost) refresh();
      wasLost = false;
    };
    source.onerror = () => {
      wasLost = true;
      // A refused connection (e.g. signed out elsewhere) won't retry: refetch, which sends us to sign-in.
      if (source.readyState === EventSource.CLOSED) refresh();
      window.clearTimeout(lostTimer);
      lostTimer = window.setTimeout(() => setLost(true), 3000);
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
  }, [router]);

  if (!lost) return null;
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-[70] bg-alert px-4 py-2 text-center text-sm font-semibold text-white">
      Lost connection to the main computer. Reconnecting…
    </div>
  );
}
