"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { signIn, type SignInState } from "@/app/login/actions";
import { RestaurantMark } from "@/components/brand/restaurant-mark";
import type { SignInTile } from "@/lib/auth/service";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { TillClock } from "./till-clock";

const PIN_LENGTH = 4;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

type Props = { restaurantName: string; logoUrl?: string | null; tiles: SignInTile[] };

export function SignInScreen({ restaurantName, logoUrl = null, tiles }: Props) {
  const dotsRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pin, setPin] = useState("");

  // No entrance animation on a work screen: staff should be able to tap straight away.
  // Wrong-PIN feedback: a short shake of the PIN dots.
  const shake = () => {
    const dots = dotsRef.current;
    if (!dots || prefersReducedMotion()) return;
    gsap.fromTo(dots, { x: 0 }, { duration: 0.45, ease: "none", keyframes: { x: [0, -10, 10, -8, 8, -4, 4, 0] } });
  };

  const [state, formAction, pending] = useActionState(async (previous: SignInState, formData: FormData) => {
    const result = await signIn(previous, formData);
    // Only reached on failure; success redirects.
    setPin("");
    shake();
    return result;
  }, null);

  const selected = tiles.find((t) => t.id === selectedId) ?? null;

  const press = (key: (typeof KEYS)[number]) => {
    if (!selected || pending) return;
    if (key === "clear") setPin("");
    else if (key === "back") setPin((p) => p.slice(0, -1));
    else if (pin.length < PIN_LENGTH) {
      const next = pin + key;
      setPin(next);
      // Submit as soon as the 4th digit is in, like a card terminal. The form data is
      // built here rather than read from the inputs, which haven't re-rendered yet.
      if (next.length === PIN_LENGTH) {
        const data = new FormData();
        data.set("staffId", selected.id);
        data.set("pin", next);
        startTransition(() => formAction(data));
      }
    }
  };

  // A physical keyboard works too: digits, Backspace, Escape.
  const pressRef = useRef(press);
  useEffect(() => {
    pressRef.current = press;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^\d$/.test(e.key)) pressRef.current(e.key as (typeof KEYS)[number]);
      else if (e.key === "Backspace") pressRef.current("back");
      else if (e.key === "Escape") pressRef.current("clear");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const choose = (id: string) => {
    setSelectedId(id);
    setPin("");
    // On phones the PIN pad sits below the names; bring it into view.
    const panel = panelRef.current;
    if (panel && panel.getBoundingClientRect().bottom > window.innerHeight) {
      panel.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "end" });
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:py-10">
      <header className="flex items-center gap-3">
        <RestaurantMark className="size-11" logoUrl={logoUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">{restaurantName}</p>
          <p className="text-sm text-cream-faint">ENYO POS</p>
        </div>
        <TillClock />
      </header>

      <div className="mt-8 grid flex-1 gap-8 lg:grid-cols-[1.25fr_1fr] lg:gap-12">
        {/* Who's signing in */}
        <section aria-labelledby="who-title">
          <h1 id="who-title" className="font-display text-3xl font-bold">
            Who&rsquo;s signing in?
          </h1>
          <p className="mt-1 text-cream-muted">Tap your name, then enter your 4-digit PIN.</p>
          <ul className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
            {tiles.map((t) => {
              const isSelected = t.id === selectedId;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => choose(t.id)}
                    aria-pressed={isSelected}
                    className={`flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-3 text-center transition sm:min-h-28 sm:gap-1.5 sm:px-2 sm:py-4 duration-150 active:scale-[0.97] motion-reduce:transition-none ${
                      isSelected
                        ? "border-amber bg-amber-soft"
                        : "border-ink-700 bg-ink-850 hover:border-ink-600 hover:bg-ink-800"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-9 place-items-center rounded-full bg-ink-600 text-sm font-bold text-amber sm:size-11 sm:text-base"
                    >
                      {t.initials}
                    </span>
                    <span className="text-sm font-semibold sm:text-base">{t.name}</span>
                    <span className="text-xs text-cream-faint sm:text-sm">{t.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* PIN */}
        <section
          ref={panelRef}
          aria-labelledby="pin-title"
          className="flex flex-col rounded-2xl border border-ink-700 bg-ink-850 p-5 sm:p-7 lg:self-start"
        >
          <h2 id="pin-title" className="text-center text-lg font-semibold">
            {selected ? `PIN for ${selected.name}` : "Choose your name first"}
          </h2>

          <div className="contents">
            <div ref={dotsRef} className="mt-5 flex justify-center gap-4" aria-hidden="true">
              {Array.from({ length: PIN_LENGTH }, (_, i) => (
                <span
                  key={i}
                  className={`size-4 rounded-full border-2 transition-colors duration-150 ${
                    i < pin.length ? "border-amber bg-amber" : "border-cream-faint"
                  }`}
                />
              ))}
            </div>

            <p role="status" aria-live="polite" className="mt-4 min-h-12 text-center text-sm">
              {pending ? (
                <span className="text-cream-muted">Checking&hellip;</span>
              ) : state?.error ? (
                <span className="text-alert">{state.error}</span>
              ) : selected ? (
                <span className="sr-only">
                  {pin.length} of {PIN_LENGTH} digits entered
                </span>
              ) : null}
            </p>

            <div className="mt-2 grid grid-cols-3 gap-3">
              {KEYS.map((key) => {
                const isWord = key === "clear" || key === "back";
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => press(key)}
                    disabled={!selected || pending}
                    aria-label={key === "clear" ? "Clear PIN" : key === "back" ? "Back, delete last digit" : undefined}
                    className={`h-16 rounded-xl border border-ink-700 bg-ink-800 transition duration-100 enabled:hover:bg-ink-700 enabled:active:scale-95 enabled:active:bg-ink-600 disabled:opacity-40 motion-reduce:transition-none ${
                      isWord ? "text-base text-cream-muted" : "font-display text-2xl font-bold"
                    }`}
                  >
                    {key === "clear" ? "Clear" : key === "back" ? "Back" : key}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
