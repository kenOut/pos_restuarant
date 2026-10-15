"use client";

import { useSyncExternalStore } from "react";

// One shared 1-second clock for every timer on the screen.
let now = 0;
let timer: number | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    now = Date.now();
    timer = window.setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.clearInterval(timer);
  };
}

const getSnapshot = () => now || (now = Date.now());
// The server can't know the screen's clock: timers render as placeholders until hydrated.
const getServerSnapshot = () => null;

/** Current time in ms, updated every second; null during server render. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
