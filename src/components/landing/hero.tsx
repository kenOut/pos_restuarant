import AnimatedContent from "@/components/react-bits/AnimatedContent";
import SplitText from "@/components/react-bits/SplitText";
import { site } from "@/lib/site";
import { TabletFrame, PhoneFrame } from "./mockups/device";
import { OrderScreen } from "./mockups/order-screen";
import { PhoneOrderScreen } from "./mockups/phone-screens";
import { Parallax } from "./parallax";
import { ButtonLink, Container } from "./ui";

const PLATFORMS = ["Windows tills", "Tablets & phones", "Kitchen display", "Head office"];

const WORD_REVEAL = {
  splitType: "words" as const,
  tag: "span" as const,
  textAlign: "left" as const,
  delay: 70,
  duration: 0.9,
  threshold: 0,
  rootMargin: "0px",
  from: { opacity: 0, y: "0.6em" },
};

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-20 sm:pt-36 lg:pb-28">
      {/* Warm glow behind the devices */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/3 right-[-10%] size-[44rem] rounded-full bg-[radial-gradient(closest-side,rgb(240_169_59/0.14),transparent)]"
      />
      <Container className="relative grid items-center gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-12">
        <div>
          <h1 className="font-display text-[clamp(2.6rem,10.5vw,4.25rem)] leading-[1.02] font-extrabold tracking-tight lg:text-[clamp(3rem,4.6vw,4.25rem)]">
            {/* Screen readers get the plain sentence; the split, animated copy is visual only. */}
            <span className="sr-only">Every table, till and branch. One system.</span>
            <span aria-hidden="true">
              <SplitText {...WORD_REVEAL} text="Every table, till" className="block! pb-[0.06em]" />
              <SplitText {...WORD_REVEAL} text="and branch." className="block! pb-[0.06em]" to={{ opacity: 1, y: 0, delay: 0.2 }} />
              <SplitText
                {...WORD_REVEAL}
                text="One system."
                className="block! pb-[0.12em] text-amber"
                to={{ opacity: 1, y: 0, delay: 0.5 }}
              />
            </span>
          </h1>

          <AnimatedContent distance={24} delay={0.75} duration={0.7}>
            <p className="mt-6 max-w-xl text-xl leading-relaxed text-cream-muted">
              The touch-screen point of sale for restaurants in Ghana. It keeps serving when the internet drops.
            </p>
          </AnimatedContent>

          <AnimatedContent distance={20} delay={0.9} duration={0.7}>
            <ul className="mt-7 flex flex-wrap gap-2" aria-label="Runs on">
              {PLATFORMS.map((p) => (
                <li key={p} className="rounded-full border border-ink-600 px-4 py-1.5 text-cream-muted">
                  {p}
                </li>
              ))}
            </ul>
          </AnimatedContent>

          <AnimatedContent distance={20} delay={1.05} duration={0.7}>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="#demo" arrow>
                Book a demonstration
              </ButtonLink>
              <ButtonLink href="/login" variant="secondary">
                Sign in to your till
              </ButtonLink>
            </div>
            <p className="mt-8 text-sm text-cream-faint">
              Powered by <span className="font-bold tracking-wide text-cream">{site.company}</span>
            </p>
          </AnimatedContent>
        </div>

        <div className="relative pb-[30%] lg:pb-[22%]">
          <AnimatedContent direction="horizontal" distance={60} delay={0.4} duration={1.1} ease="power4.out">
            <TabletFrame
              label="ENYO POS order screen on a tablet: menu items by category and a takeaway ticket totalling GH₵ 408.00 with VAT, NHIL and GETFund shown separately."
              className="ml-auto w-[94%]"
            >
              <OrderScreen />
            </TabletFrame>
          </AnimatedContent>
          <div className="absolute bottom-0 left-0 w-[26%] max-w-48 lg:-left-6">
            <Parallax distance={24}>
              <AnimatedContent distance={60} delay={0.7} duration={1.1} ease="power4.out">
                <PhoneFrame label="The same menu on a phone, with a running order of three items totalling GH₵ 174.01.">
                  <PhoneOrderScreen />
                </PhoneFrame>
              </AnimatedContent>
            </Parallax>
          </div>
        </div>
      </Container>
    </section>
  );
}
