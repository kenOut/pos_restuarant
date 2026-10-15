"use client";

import { useRef } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";

const DEVICES = [
  { title: "Windows tills", detail: "receipt printers" },
  { title: "Kitchen screen", detail: "live tickets" },
  { title: "Tablets & phones", detail: "order at the table" },
];

/**
 * Head office → main computer → devices. Built in sequence by one timeline
 * when it scrolls into view, so the data flow reads top to bottom.
 */
export function SyncDiagram() {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const tl = gsap.timeline({
        defaults: { ease: "power3.out", duration: 0.6 },
        scrollTrigger: { trigger: ref.current, start: "top 75%", once: true },
      });
      tl.from("[data-node='office']", { y: -16, autoAlpha: 0 })
        .from("[data-link='sync']", { scaleY: 0, transformOrigin: "top", duration: 0.5 }, "-=0.2")
        .from("[data-link-label]", { autoAlpha: 0, x: -8, duration: 0.4 }, "<0.2")
        .from("[data-node='main']", { scale: 0.85, autoAlpha: 0, ease: "back.out(1.6)" }, "-=0.1")
        .from("[data-link='lan']", { scaleX: 0, scaleY: 0, duration: 0.5 }, "-=0.2")
        .from("[data-node='device']", { y: 20, autoAlpha: 0, stagger: 0.12 }, "-=0.25");
    },
    { scope: ref }
  );

  return (
    <div ref={ref} className="mx-auto flex max-w-3xl flex-col items-center">
      <div
        data-node="office"
        className="w-full max-w-sm rounded-2xl border border-dashed border-cream-faint/50 bg-ink-850 px-6 py-5 text-center"
      >
        <div className="font-display text-xl font-bold">Head office</div>
        <div className="mt-1 text-sm text-cream-muted">Combined reports · master menu · staff</div>
      </div>

      <div className="relative h-14">
        <div data-link="sync" className="h-full border-l-2 border-dashed border-cream-faint/50" />
        <span data-link-label className="absolute top-1/2 left-4 -translate-y-1/2 text-xs whitespace-nowrap text-cream-faint">
          syncs when online
        </span>
      </div>

      <div
        data-node="main"
        className="w-full max-w-xs rounded-2xl bg-amber px-6 py-5 text-center text-amber-ink shadow-[0_1.5rem_4rem_-1.5rem_rgb(240_169_59/0.55)]"
      >
        <div className="font-display text-xl font-bold">Main computer</div>
        <div className="mt-1 text-sm">Restaurant data · nightly backups</div>
      </div>

      {/* Connectors: one trunk on mobile, a branching bar from sm up */}
      <div data-link="lan" className="relative h-8 w-full sm:h-10">
        <div className="absolute top-0 left-1/2 h-full w-0.5 -translate-x-1/2 bg-amber/60 sm:h-1/2" />
        <div className="absolute top-1/2 right-[16.66%] left-[16.66%] hidden h-0.5 bg-amber/60 sm:block" />
      </div>

      <div className="grid w-full gap-3 sm:grid-cols-3">
        {DEVICES.map((d) => (
          <div key={d.title} data-node="device" className="rounded-xl border border-ink-600 bg-ink-850 px-4 py-4 text-center">
            <div className="font-display text-lg font-bold">{d.title}</div>
            <div className="mt-0.5 text-sm text-cream-faint">{d.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
