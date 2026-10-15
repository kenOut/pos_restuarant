import type { CSSProperties, ReactNode } from "react";
import { RestaurantMark } from "@/components/brand/restaurant-mark";
import { Icon, type IconName } from "@/components/icons";

type FrameProps = {
  /** Accessible description of what the screen shows. The mockup itself is hidden from screen readers. */
  label: string;
  children: ReactNode;
  className?: string;
};

/** Landscape tablet / till. The screen is drawn on a 64em-wide grid. */
export function TabletFrame({ label, children, className = "" }: FrameProps) {
  return (
    <div role="img" aria-label={label} className={`mock ${className}`}>
      <div className="mock-canvas" style={{ "--mock-width": 66 } as CSSProperties} aria-hidden="true">
        <div className="rounded-3xl bg-ink-700 p-2 shadow-[0_2em_5em_-1em_rgb(0_0_0/0.7)] ring-1 ring-white/5">
          <div className="aspect-[16/10] overflow-hidden rounded-2xl bg-ink-900 text-cream select-none">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Portrait phone. The screen is drawn on a 21em-wide grid. */
export function PhoneFrame({ label, children, className = "" }: FrameProps) {
  return (
    <div role="img" aria-label={label} className={`mock ${className}`}>
      <div className="mock-canvas" style={{ "--mock-width": 22 } as CSSProperties} aria-hidden="true">
        <div className="rounded-[2.4em] bg-ink-700 p-2 shadow-[0_2em_4em_-1em_rgb(0_0_0/0.75)] ring-1 ring-white/5">
          <div className="relative aspect-[9/19] overflow-hidden rounded-[1.9em] bg-ink-900 text-cream select-none">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

const NAV: { icon: IconName; label: string; badge?: number }[] = [
  { icon: "home", label: "Home" },
  { icon: "tables", label: "Tables" },
  { icon: "order", label: "Order" },
  { icon: "kitchen", label: "Kitchen", badge: 3 },
  { icon: "orders", label: "Orders" },
  { icon: "bookings", label: "Bookings" },
  { icon: "menu", label: "Menu" },
  { icon: "stock", label: "Stock" },
  { icon: "staff", label: "Staff" },
  { icon: "guests", label: "Guests" },
  { icon: "reports", label: "Reports" },
  { icon: "settings", label: "Settings" },
];

/** Left icon rail of the till, with one item highlighted. */
export function TillSidebar({ active }: { active: string }) {
  return (
    <div className="flex h-full w-14 shrink-0 flex-col items-center gap-0.5 border-r border-ink-700 bg-ink-950 py-2">
      <RestaurantMark className="mb-1.5 size-8" />
      {NAV.map((item) => {
        const isActive = item.label === active;
        return (
          <div
            key={item.label}
            className={`relative flex w-11 flex-col items-center gap-px rounded-md py-1 ${
              isActive ? "bg-amber text-amber-ink" : "text-cream-muted"
            }`}
          >
            <Icon name={item.icon} className="size-3.5" />
            <span className="text-[0.48em] leading-none">{item.label}</span>
            {item.badge ? (
              <span className="absolute top-0.5 right-2 grid size-2.5 place-items-center rounded-full bg-alert text-[0.42em] font-bold text-white">
                {item.badge}
              </span>
            ) : null}
          </div>
        );
      })}
      <div className="mt-auto flex flex-col items-center gap-px text-cream-muted">
        <Icon name="lock" className="size-3.5" />
        <span className="text-[0.48em] leading-none">Lock</span>
      </div>
    </div>
  );
}
