"use client";

import { useRef } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";

type CountUpProps = {
  to: number;
  decimals?: number;
  suffix?: string;
  className?: string;
};

function format(value: number, decimals: number) {
  return value.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Counts from 0 to `to` when scrolled into view. The final value is rendered
 * on the server and reserves its width, so nothing shifts while counting.
 */
export function CountUp({ to, decimals = 0, suffix = "", className = "" }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const final = `${format(to, decimals)}${suffix}`;

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || prefersReducedMotion()) return;
      const counter = { value: 0 };
      gsap.to(counter, {
        value: to,
        duration: 1.6,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 85%", once: true },
        onStart: () => {
          el.textContent = `${format(0, decimals)}${suffix}`;
        },
        onUpdate: () => {
          el.textContent = `${format(counter.value, decimals)}${suffix}`;
        },
      });
      el.textContent = `${format(0, decimals)}${suffix}`;
      return () => {
        el.textContent = final;
      };
    },
    { scope: ref, dependencies: [to, decimals, suffix] }
  );

  return (
    <span className={`relative inline-block tabular-nums ${className}`}>
      <span className="invisible">{final}</span>
      <span ref={ref} aria-hidden="true" className="absolute inset-0">
        {final}
      </span>
      <span className="sr-only">{final}</span>
    </span>
  );
}
