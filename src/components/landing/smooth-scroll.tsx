"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { ReactLenis, useLenis, type LenisRef } from "lenis/react";
import "lenis/dist/lenis.css";
import { gsap, ScrollTrigger } from "@/lib/gsap";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const getReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;
// Render without Lenis on the server and during hydration; enable it on the client.
const getServerReducedMotion = () => true;

/** Keeps ScrollTrigger positions in step with Lenis's smoothed scroll. */
function ScrollTriggerSync() {
  useLenis(ScrollTrigger.update);
  return null;
}

/**
 * Lenis smooth scrolling for marketing pages, driven by GSAP's ticker so
 * ScrollTrigger animations and the smoothed scroll share one clock.
 * Disabled when the visitor prefers reduced motion. Touch devices keep
 * native scrolling (Lenis's default).
 */
export function SmoothScroll() {
  const reducedMotion = useSyncExternalStore(subscribe, getReducedMotion, getServerReducedMotion);
  const lenisRef = useRef<LenisRef>(null);

  useEffect(() => {
    if (reducedMotion) return;
    const update = (time: number) => lenisRef.current?.lenis?.raf(time * 1000);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(update);
      gsap.ticker.lagSmoothing(500, 33);
    };
  }, [reducedMotion]);

  if (reducedMotion) return null;

  return (
    <ReactLenis root ref={lenisRef} options={{ autoRaf: false, anchors: { offset: -72 } }}>
      <ScrollTriggerSync />
    </ReactLenis>
  );
}
