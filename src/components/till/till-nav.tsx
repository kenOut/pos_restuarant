"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { lockTill } from "@/app/(till)/actions";
import { RestaurantMark } from "@/components/brand/restaurant-mark";
import { Icon } from "@/components/icons";
import type { NavId, NavItem } from "@/lib/auth/roles";
import { gsap, prefersReducedMotion } from "@/lib/gsap";

type Person = { name: string; initials: string; label: string };
/** Counts shown on a section, e.g. kitchen tickets still cooking. */
type Badges = Partial<Record<NavId, number>>;
type Props = { items: NavItem[]; person: Person; restaurantName: string; logoUrl?: string | null; badges?: Badges };

/** Sections that get their own tab on phones; the rest live under More. */
const PHONE_TABS: readonly NavId[] = ["home", "tables", "order", "kitchen"];

function useActive() {
  const pathname = usePathname();
  return (item: NavItem) => !!item.href && (pathname === item.href || pathname.startsWith(`${item.href}/`));
}

function LockButton({ className = "" }: { className?: string }) {
  return (
    <form action={lockTill} className="contents">
      <button type="submit" className={className}>
        <Icon name="lock" className="size-5" />
        <span>Lock</span>
      </button>
    </form>
  );
}

/** Section icon with an optional red count, as on the deck's Kitchen tab. */
function NavIcon({ item, badge }: { item: NavItem; badge?: number }) {
  return (
    <span className="relative">
      <Icon name={item.icon} className="size-5" />
      {badge ? (
        <>
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-alert px-1 text-[0.625rem] leading-none font-bold text-white"
          >
            {badge > 99 ? "99+" : badge}
          </span>
          <span className="sr-only">({badge} waiting)</span>
        </>
      ) : null}
    </span>
  );
}

/** One sidebar entry: a link when the screen exists, a dimmed label when it's still to come. */
function RailItem({ item, active, badge }: { item: NavItem; active: boolean; badge?: number }) {
  const base = "flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 text-[0.6875rem] leading-none font-medium";
  const content = (
    <>
      <NavIcon item={item} badge={badge} />
      {item.label}
    </>
  );

  if (!item.href) {
    return (
      <span aria-disabled="true" title={`${item.label}: coming in a later phase`} className={`${base} cursor-not-allowed text-cream-faint/60`}>
        {content}
        <span className="sr-only">(coming soon)</span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`${base} transition-colors duration-150 motion-reduce:transition-none ${
        active ? "bg-amber text-amber-ink" : "text-cream-muted hover:bg-ink-800 hover:text-cream"
      }`}
    >
      {content}
    </Link>
  );
}

export function TillNav({ items, person, restaurantName, logoUrl = null, badges = {} }: Props) {
  const isActive = useActive();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const tabs = items.filter((i) => PHONE_TABS.includes(i.id));
  const more = items.filter((i) => !PHONE_TABS.includes(i.id));
  const moreActive = more.some(isActive);

  const openMore = () => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const sheet = dialog.firstElementChild;
    if (sheet && !prefersReducedMotion()) gsap.fromTo(sheet, { yPercent: 100 }, { yPercent: 0, duration: 0.3, ease: "power3.out" });
  };
  const closeMore = () => dialogRef.current?.close();

  return (
    <>
      {/* Tablet and desktop: the deck's left rail */}
      <nav
        aria-label="Till"
        className="hidden h-dvh w-[5.25rem] shrink-0 flex-col items-center border-r border-ink-700 bg-ink-950 py-3 md:flex"
      >
        <span title={restaurantName}>
          <RestaurantMark className="size-11" logoUrl={logoUrl} />
          <span className="sr-only">{restaurantName}</span>
        </span>

        {/* `relative` keeps the absolutely positioned sr-only text inside this scroll area. */}
        <ul className="relative mt-3 flex w-full flex-1 flex-col gap-0.5 overflow-y-auto px-2 [scrollbar-width:none]">
          {items.map((item) => (
            <li key={item.id}>
              <RailItem item={item} active={isActive(item)} badge={badges[item.id]} />
            </li>
          ))}
        </ul>

        <div className="mt-2 flex w-full flex-col items-center gap-2 border-t border-ink-700 px-2 pt-3">
          <span
            title={`${person.name} · ${person.label}`}
            className="grid size-9 place-items-center rounded-full bg-ink-700 text-xs font-bold text-amber"
          >
            <span aria-hidden="true">{person.initials}</span>
            <span className="sr-only">
              Signed in as {person.name}, {person.label}
            </span>
          </span>
          <LockButton className="flex w-full flex-col items-center gap-1 rounded-xl py-2 text-[0.6875rem] leading-none font-medium text-cream-muted transition-colors hover:bg-ink-800 hover:text-cream motion-reduce:transition-none" />
        </div>
      </nav>

      {/* Phones: bottom tabs plus a More sheet */}
      <nav
        aria-label="Till"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="flex">
          {tabs.map((item) => {
            const active = isActive(item);
            const classes = "flex min-h-14 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium";
            return (
              <li key={item.id} className="flex-1">
                {item.href ? (
                  <Link href={item.href} aria-current={active ? "page" : undefined} className={`${classes} ${active ? "text-amber" : "text-cream-muted"}`}>
                    <NavIcon item={item} badge={badges[item.id]} />
                    {item.label}
                  </Link>
                ) : (
                  <span aria-disabled="true" className={`${classes} text-cream-faint/60`}>
                    <NavIcon item={item} badge={badges[item.id]} />
                    {item.label}
                    <span className="sr-only">(coming soon)</span>
                  </span>
                )}
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={openMore}
              aria-haspopup="dialog"
              className={`flex min-h-14 w-full flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium ${moreActive ? "text-amber" : "text-cream-muted"}`}
            >
              <Icon name="menu" className="size-5" />
              More
            </button>
          </li>
        </ul>
      </nav>

      <dialog
        ref={dialogRef}
        aria-label="More"
        onClick={(e) => e.target === e.currentTarget && closeMore()}
        className="m-0 mt-auto max-h-none w-full max-w-none bg-transparent p-0 text-cream backdrop:bg-black/60 md:hidden"
      >
        <div className="rounded-t-3xl border-t border-ink-700 bg-ink-900 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-ink-600" />
          <div className="mt-4 flex items-center gap-3">
            <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-ink-700 font-bold text-amber">
              {person.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{person.name}</p>
              <p className="text-sm text-cream-faint">
                {person.label} · {restaurantName}
              </p>
            </div>
            <button
              type="button"
              onClick={closeMore}
              aria-label="Close"
              className="grid size-11 place-items-center rounded-full text-cream-muted hover:bg-ink-800"
            >
              <Icon name="plus" className="size-5 rotate-45" />
            </button>
          </div>

          {more.length > 0 ? (
            <ul className="mt-4 grid grid-cols-3 gap-2">
              {more.map((item) => (
                <li key={item.id}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      onClick={closeMore}
                      aria-current={isActive(item) ? "page" : undefined}
                      className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border border-ink-700 bg-ink-850 text-sm"
                    >
                      <NavIcon item={item} badge={badges[item.id]} />
                      {item.label}
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border border-ink-800 text-sm text-cream-faint/60"
                    >
                      <NavIcon item={item} badge={badges[item.id]} />
                      {item.label}
                      <span className="text-[0.625rem] tracking-wide uppercase">Soon</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          <LockButton className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-ink-600 font-semibold hover:bg-ink-800" />
        </div>
      </dialog>
    </>
  );
}
