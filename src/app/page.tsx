import { BuiltToLast, DemoCta, ForOwners, GettingStarted, SiteFooter } from "@/components/landing/closing-sections";
import { FloorAndKitchen, Payments, PhonesAndTablets, TakeOrders, Taxes } from "@/components/landing/features";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Problems } from "@/components/landing/problems";
import { SiteHeader } from "@/components/landing/site-header";
import { SmoothScroll } from "@/components/landing/smooth-scroll";

export default function HomePage() {
  return (
    <>
      <SmoothScroll />
      <a
        href="#main"
        className="sr-only z-[60] rounded-md bg-amber px-4 py-2 font-semibold text-amber-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <SiteHeader />
      {/* Clip sideways overflow from mockups that slide in from the edge before they're revealed. */}
      <main id="main" className="overflow-x-clip">
        <Hero />
        <Problems />
        <HowItWorks />
        <TakeOrders />
        <FloorAndKitchen />
        <Payments />
        <Taxes />
        <PhonesAndTablets />
        <BuiltToLast />
        <ForOwners />
        <GettingStarted />
        <DemoCta />
      </main>
      <SiteFooter />
    </>
  );
}
