import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import AnimatedContent from "@/components/react-bits/AnimatedContent";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

export function Eyebrow({ children, tone = "dark" }: { children: ReactNode; tone?: "dark" | "paper" }) {
  return (
    <p className={`text-sm font-bold tracking-[0.18em] uppercase ${tone === "paper" ? "text-amber-strong" : "text-amber"}`}>
      {children}
    </p>
  );
}

export function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`mt-3 font-display text-4xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-5xl ${className}`}>
      {children}
    </h2>
  );
}

type Point = { lead: string; text: string };

/** Amber-square bullet list from the deck. Each point fades up in turn. */
export function PointList({ points, className = "" }: { points: Point[]; className?: string }) {
  return (
    <ul className={`flex flex-col gap-5 ${className}`}>
      {points.map((p, i) => (
        <li key={p.lead}>
          <AnimatedContent distance={24} duration={0.6} delay={i * 0.08} threshold={0.12} className="flex gap-4">
            <span aria-hidden="true" className="mt-2 size-2.5 shrink-0 rounded-[3px] bg-amber" />
            <span className="text-lg leading-relaxed text-cream-muted">
              <strong className="font-semibold text-cream">{p.lead}</strong> {p.text}
            </span>
          </AnimatedContent>
        </li>
      ))}
    </ul>
  );
}

const BUTTON_BASE =
  "group inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition duration-200 ease-out active:scale-[0.97] motion-reduce:transition-none";

const BUTTON_SIZES = {
  md: "min-h-11 px-5 py-2.5 text-base",
  sm: "min-h-10 px-3.5 py-2 text-sm",
} as const;

const BUTTON_VARIANTS = {
  primary:
    "bg-amber text-amber-ink shadow-[0_0.75rem_2rem_-0.75rem_rgb(240_169_59/0.6)] hover:-translate-y-0.5 hover:bg-[#f5b552] hover:shadow-[0_1rem_2.5rem_-0.75rem_rgb(240_169_59/0.75)]",
  secondary: "border border-ink-600 bg-ink-850/60 text-cream hover:-translate-y-0.5 hover:border-cream-faint hover:bg-ink-800",
} as const;

type ButtonLinkProps = {
  href: string;
  children: ReactNode;
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  arrow?: boolean;
  className?: string;
};

export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  arrow = false,
  className = "",
}: ButtonLinkProps) {
  const content = (
    <>
      {children}
      {arrow ? (
        <Icon name="arrowRight" className="size-4 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none" />
      ) : null}
    </>
  );
  const classes = `${BUTTON_BASE} ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]} ${className}`;

  // In-app routes get client-side navigation; anchors and mailto links stay plain.
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <a href={href} className={classes}>
      {content}
    </a>
  );
}
