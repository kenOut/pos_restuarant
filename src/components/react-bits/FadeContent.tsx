'use client';

// From React Bits (https://reactbits.dev, FadeContent-TS-TW).
// Local changes: useGSAP() with scoped cleanup, prefers-reduced-motion support,
// starts hidden so server-rendered content doesn't flash before it fades in,
// callbacks held in refs, and the global "snap-main-container" scroller lookup removed.

import * as React from 'react';
import { useEffect, useRef } from 'react';
import { gsap, ScrollTrigger, useGSAP, prefersReducedMotion } from '@/lib/gsap';

interface FadeContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  container?: Element | string | null;
  blur?: boolean;
  /** Seconds, or milliseconds when greater than 10. */
  duration?: number;
  ease?: string;
  delay?: number;
  threshold?: number;
  initialOpacity?: number;
  disappearAfter?: number;
  disappearDuration?: number;
  disappearEase?: string;
  onComplete?: () => void;
  onDisappearanceComplete?: () => void;
}

const getSeconds = (val: number) => (val > 10 ? val / 1000 : val);

const FadeContent: React.FC<FadeContentProps> = ({
  children,
  container,
  blur = false,
  duration = 1000,
  ease = 'power2.out',
  delay = 0,
  threshold = 0.1,
  initialOpacity = 0,
  disappearAfter = 0,
  disappearDuration = 0.5,
  disappearEase = 'power2.in',
  onComplete,
  onDisappearanceComplete,
  className = '',
  ...props
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  const onDisappearRef = useRef(onDisappearanceComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onDisappearRef.current = onDisappearanceComplete;
  }, [onComplete, onDisappearanceComplete]);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      if (prefersReducedMotion()) {
        gsap.set(el, { autoAlpha: 1 });
        return;
      }

      const scroller = typeof container === 'string' ? document.querySelector(container) : container;
      const startPct = (1 - threshold) * 100;

      gsap.set(el, {
        autoAlpha: initialOpacity,
        filter: blur ? 'blur(10px)' : 'blur(0px)',
        willChange: 'opacity, filter, transform'
      });

      const tl = gsap.timeline({
        paused: true,
        delay: getSeconds(delay),
        onComplete: () => {
          onCompleteRef.current?.();
          if (disappearAfter > 0) {
            gsap.to(el, {
              autoAlpha: initialOpacity,
              filter: blur ? 'blur(10px)' : 'blur(0px)',
              delay: getSeconds(disappearAfter),
              duration: getSeconds(disappearDuration),
              ease: disappearEase,
              onComplete: () => onDisappearRef.current?.()
            });
          }
        }
      });

      tl.to(el, { autoAlpha: 1, filter: 'blur(0px)', duration: getSeconds(duration), ease });

      ScrollTrigger.create({
        trigger: el,
        scroller: scroller || window,
        start: `top ${startPct}%`,
        once: true,
        onEnter: () => tl.play()
      });

      return () => gsap.killTweensOf(el);
    },
    {
      scope: ref,
      revertOnUpdate: true,
      dependencies: [
        container,
        blur,
        duration,
        ease,
        delay,
        threshold,
        initialOpacity,
        disappearAfter,
        disappearDuration,
        disappearEase
      ]
    }
  );

  return (
    <div ref={ref} className={`invisible ${className}`} {...props}>
      {children}
    </div>
  );
};

export default FadeContent;
