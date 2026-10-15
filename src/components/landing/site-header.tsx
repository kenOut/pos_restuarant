"use client";

import Link from "next/link";
import { useRef } from "react";
import { Logo } from "@/components/brand/logo";
import { ScrollTrigger, useGSAP } from "@/lib/gsap";
import { ButtonLink, Container } from "./ui";

const NAV = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#take-orders", label: "Features" },
  { href: "#payments", label: "Payments" },
  { href: "#taxes", label: "Taxes" },
  { href: "#get-started", label: "Get started" },
];

/** Transparent over the hero; gains a solid background once the page scrolls. */
export function SiteHeader() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const header = ref.current;
      if (!header) return;
      ScrollTrigger.create({
        start: 24,
        end: "max",
        onToggle: (self) => {
          header.dataset.scrolled = String(self.isActive);
        },
      });
    },
    { scope: ref }
  );

  return (
    <header
      ref={ref}
      data-scrolled="false"
      className="fixed inset-x-0 top-0 z-50 border-b border-transparent transition-colors duration-300 data-[scrolled=true]:border-ink-700 data-[scrolled=true]:bg-ink-900/85 data-[scrolled=true]:backdrop-blur-md"
    >
      <Container className="flex h-16 items-center gap-6">
        <Link href="/" className="rounded-md">
          <Logo size={30} />
        </Link>
        <nav aria-label="Main" className="hidden flex-1 lg:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="relative rounded-md px-3 py-2 text-sm text-cream-muted transition-colors hover:text-cream after:absolute after:inset-x-3 after:bottom-1 after:h-px after:origin-left after:scale-x-0 after:bg-amber after:transition-transform after:duration-300 hover:after:scale-x-100 motion-reduce:after:transition-none"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ButtonLink href="/login" variant="secondary" size="sm">
            Sign in
          </ButtonLink>
          <span className="hidden sm:contents">
            <ButtonLink href="#demo" size="sm">
              Book a demo
            </ButtonLink>
          </span>
        </div>
      </Container>
    </header>
  );
}
