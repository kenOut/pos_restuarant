'use client';

// From React Bits (https://reactbits.dev, AnimatedContent-TS-TW).
// Local changes: useGSAP() with scoped cleanup, prefers-reduced-motion support,
// callbacks held in refs so inline handlers don't restart the animation,
// and the global "snap-main-container" scroller lookup removed.

import React, { useEffect, useRef } from 'react';
import { gsap, ScrollTrigger, useGSAP, prefersReducedMotion } from '@/lib/gsap';

interface AnimatedContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  container?: Element | string | null;
  distance?: number;
  direction?: 'vertical' | 'horizontal';
  reverse?: boolean;
  duration?: number;
  ease?: string;
  initialOpacity?: number;
  animateOpacity?: boolean;
  scale?: number;
  threshold?: number;
  delay?: number;
  disappearAfter?: number;
  disappearDuration?: number;
  disappearEase?: string;
  onComplete?: () => void;
  onDisappearanceComplete?: () => void;
}

const AnimatedContent: React.FC<AnimatedContentProps> = ({
  children,
  container,
  distance = 100,
  direction = 'vertical',
  reverse = false,
  duration = 0.8,
  ease = 'power3.out',
  initialOpacity = 0,
  animateOpacity = true,
  scale = 1,
  threshold = 0.1,
  delay = 0,
  disappearAfter = 0,
  disappearDuration = 0.5,
  disappearEase = 'power3.in',
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
        gsap.set(el, { visibility: 'visible' });
        return;
      }

      const scroller = typeof container === 'string' ? document.querySelector(container) : container;
      const axis = direction === 'horizontal' ? 'x' : 'y';
      const offset = reverse ? -distance : distance;
      const startPct = (1 - threshold) * 100;

      gsap.set(el, {
        [axis]: offset,
        scale,
        opacity: animateOpacity ? initialOpacity : 1,
        visibility: 'visible'
      });

      const tl = gsap.timeline({
        paused: true,
        delay,
        onComplete: () => {
          onCompleteRef.current?.();
          if (disappearAfter > 0) {
            gsap.to(el, {
              [axis]: reverse ? distance : -distance,
              scale: 0.8,
              opacity: animateOpacity ? initialOpacity : 0,
              delay: disappearAfter,
              duration: disappearDuration,
              ease: disappearEase,
              onComplete: () => onDisappearRef.current?.()
            });
          }
        }
      });

      tl.to(el, { [axis]: 0, scale: 1, opacity: 1, duration, ease });

      ScrollTrigger.create({
        trigger: el,
        scroller: scroller || window,
        start: `top ${startPct}%`,
        once: true,
        onEnter: () => tl.play()
      });

      // The disappear tween is created later, outside this context, so kill it explicitly.
      return () => gsap.killTweensOf(el);
    },
    {
      scope: ref,
      revertOnUpdate: true,
      dependencies: [
        container,
        distance,
        direction,
        reverse,
        duration,
        ease,
        initialOpacity,
        animateOpacity,
        scale,
        threshold,
        delay,
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

export default AnimatedContent;
