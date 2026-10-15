"use client";

import { useSyncExternalStore } from "react";

function subscribe(onTick: () => void) {
  const id = window.setInterval(onTick, 1000);
  return () => window.clearInterval(id);
}

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

// Snapshots are strings, so they only change (and re-render) when the minute or day does.
const getTime = () => timeFormat.format(new Date());
const getDate = () => dateFormat.format(new Date());
// The server can't know the till's local time; render a placeholder until hydrated.
const getServerTime = () => "--:--";
const getServerDate = () => " ";

export function TillClock() {
  const time = useSyncExternalStore(subscribe, getTime, getServerTime);
  const date = useSyncExternalStore(subscribe, getDate, getServerDate);

  return (
    <div className="text-right leading-tight">
      <time className="block font-display text-3xl font-bold tabular-nums">{time}</time>
      <span className="text-sm text-cream-faint">{date}</span>
    </div>
  );
}
