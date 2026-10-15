"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";

type ParallaxProps = {
  children: ReactNode;
  /** Pixels travelled in each direction across the element's time on screen. */
  distance?: number;
  className?: string;
};

/** Gently shifts its content vertically while it scrolls past. */
export function Parallax({ children, distance = 40, className = "" }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!ref.current || prefersReducedMotion()) return;
      gsap.fromTo(
        ref.current,
        { y: distance },
        {
          y: -distance,
          ease: "none",
          scrollTrigger: { trigger: ref.current, start: "top bottom", end: "bottom top", scrub: true },
        }
      );
    },
    { scope: ref, dependencies: [distance], revertOnUpdate: true }
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
