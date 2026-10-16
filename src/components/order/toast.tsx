"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/icons";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";

type Props = { message: string; onDone: () => void };

/** Short confirmation at the top of the screen. Remount with a new key to show another. */
export function Toast({ message, onDone }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from(ref.current, { y: -24, autoAlpha: 0, duration: 0.35, ease: "power3.out" });
    },
    { scope: ref }
  );

  useEffect(() => {
    const id = window.setTimeout(onDone, 3500);
    return () => window.clearTimeout(id);
  }, [onDone]);

  return (
    <div
      ref={ref}
      role="status"
      className="pointer-events-none fixed inset-x-0 top-4 z-[60] mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-2 rounded-xl bg-eating-strong px-4 py-3 font-semibold text-white shadow-lg"
    >
      <Icon name="check" className="size-5 shrink-0" />
      {message}
    </div>
  );
}
