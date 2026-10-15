import { Logo } from "@/components/brand/logo";
import AnimatedContent from "@/components/react-bits/AnimatedContent";
import { demoMailto, site } from "@/lib/site";
import { CountUp } from "./count-up";
import { TabletFrame } from "./mockups/device";
import { SetupScreen } from "./mockups/payment-setup";
import { ButtonLink, Container, Eyebrow, PointList, SectionTitle } from "./ui";

export function ForOwners() {
  return (
    <section aria-labelledby="owners-title" className="py-20 sm:py-28">
      <Container>
        <Eyebrow>For owners</Eyebrow>
        <SectionTitle className="max-w-3xl">
          <span id="owners-title">Reports you&rsquo;ll actually read. Every branch from one head office.</span>
        </SectionTitle>
        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <AnimatedContent distance={40} className="h-full">
            <div className="h-full rounded-2xl border border-ink-700 bg-ink-850 p-7 sm:p-9">
              <h3 className="font-display text-2xl font-bold">Reports</h3>
              <PointList
                className="mt-6"
                points={[
                  { lead: "Designed PDF reports,", text: "with trends, payment mix, taxes and automatic highlights." },
                  { lead: "Sales by item,", text: "including which dishes make 80% of your sales." },
                  { lead: "When you sell:", text: "a weekday-by-hour heat map for staffing and prep." },
                  { lead: "Where guests come from,", text: "by area and GhanaPost GPS address." },
                  { lead: "Any period,", text: "from today to 12 months or your own dates, plus CSV export." },
                ]}
              />
            </div>
          </AnimatedContent>
          <AnimatedContent distance={40} delay={0.12} className="h-full">
            <div className="h-full rounded-2xl border border-ink-700 bg-ink-850 p-7 sm:p-9">
              <h3 className="font-display text-2xl font-bold">Several branches</h3>
              <PointList
                className="mt-6"
                points={[
                  { lead: "Live sales for every branch,", text: "combined totals, open orders and low stock across sites." },
                  { lead: "Master menu with branch prices", text: "inside the limits you set. Reset any branch in one tap." },
                  { lead: "Shared guests and loyalty.", text: "Points earned at one branch can be spent at another." },
                  { lead: "Staff across branches,", text: "with one PIN wherever they're assigned." },
                  { lead: "Combined reports,", text: "or one branch at a time, including a branch comparison." },
                ]}
              />
            </div>
          </AnimatedContent>
        </div>
      </Container>
    </section>
  );
}

const STATS = [
  { value: <CountUp to={730000} />, label: "orders in our 10-year test (200 a day)" },
  { value: <CountUp to={1.2} decimals={1} suffix=" GB" />, label: "database size after those 10 years" },
  { value: "< 0.1 s", label: "to produce a 30-day report on that data" },
  { value: "Nightly", label: "backups, plus monthly and yearly copies" },
];

const ASSURANCES = [
  { lead: "Safe from power cuts.", text: "Every change is written through to disk before it's confirmed." },
  {
    lead: "Secure by design.",
    text: "PINs are stored only as protected hashes; refunds, voids and discounts can require a manager.",
  },
  { lead: "Old data stays right.", text: "Each sale keeps its prices, taxes and guest area as they were on the day." },
];

export function BuiltToLast() {
  return (
    <section aria-labelledby="last-title" className="bg-paper py-20 text-paper-ink sm:py-28">
      <Container>
        <Eyebrow tone="paper">Built to last</Eyebrow>
        <SectionTitle>
          <span id="last-title">Designed for ten years of trading.</span>
        </SectionTitle>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <li key={s.label}>
              <AnimatedContent distance={40} delay={i * 0.1} className="h-full">
                <div className="flex h-full flex-col justify-end rounded-2xl bg-ink-900 p-7 text-cream">
                  <p className="font-display text-[clamp(2.4rem,4vw,3.25rem)] leading-none font-extrabold text-amber">
                    {s.value}
                  </p>
                  <p className="mt-4 leading-snug text-cream-muted">{s.label}</p>
                </div>
              </AnimatedContent>
            </li>
          ))}
        </ul>
        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {ASSURANCES.map((a) => (
            <p key={a.lead} className="leading-relaxed text-paper-muted">
              <strong className="font-semibold text-paper-ink">{a.lead}</strong> {a.text}
            </p>
          ))}
        </div>
        <p className="mt-10 text-sm text-paper-muted">
          Figures from {site.company}&rsquo;s own tests with generated data; results depend on your hardware.
        </p>
      </Container>
    </section>
  );
}

const STEPS = [
  { lead: "Install ENYO POS", text: "on the restaurant's main computer and choose “Main computer”." },
  { lead: "Add your tills", text: "with the same installer, and open ENYO on tablets and phones." },
  { lead: "Set up your menu, logo, taxes and team,", text: "then start serving." },
];

export function GettingStarted() {
  return (
    <section id="get-started" aria-labelledby="start-title" className="scroll-mt-16 py-20 sm:py-28">
      <Container className="grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <Eyebrow>Getting started</Eyebrow>
          <SectionTitle>
            <span id="start-title">Up and running in an afternoon.</span>
          </SectionTitle>
          <ol className="mt-9 flex flex-col gap-6">
            {STEPS.map((s, i) => (
              <li key={s.lead}>
                <AnimatedContent distance={24} delay={i * 0.12} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center rounded-full bg-amber font-display text-lg font-bold text-amber-ink"
                  >
                    {i + 1}
                  </span>
                  <span className="pt-1.5 text-lg leading-relaxed text-cream-muted">
                    <strong className="font-semibold text-cream">{s.lead}</strong> {s.text}
                  </span>
                </AnimatedContent>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-cream-faint">One setup file for everything: no command line, and updates keep your data.</p>
        </div>
        <AnimatedContent direction="horizontal" distance={60} duration={1}>
          <TabletFrame label="First-run setup screen asking how this computer will be used: main computer, till or extra screen, or head office.">
            <SetupScreen />
          </TabletFrame>
        </AnimatedContent>
      </Container>
    </section>
  );
}

export function DemoCta() {
  const mailto = demoMailto();
  return (
    <section id="demo" aria-labelledby="demo-title" className="relative scroll-mt-16 overflow-hidden py-24 sm:py-32">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(240_169_59/0.16),transparent_60%)]"
      />
      <Container className="relative flex flex-col items-center text-center">
        <AnimatedContent distance={30} scale={0.96}>
          <Logo size={56} />
        </AnimatedContent>
        <AnimatedContent distance={30} delay={0.1}>
          <h2 id="demo-title" className="mt-10 font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-none font-extrabold tracking-tight">
            See it in your restaurant.
          </h2>
        </AnimatedContent>
        <AnimatedContent distance={30} delay={0.2}>
          <p className="mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-cream-muted">
            Book a demonstration with {site.company} and we&rsquo;ll set {site.product} up with your own menu.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {mailto ? (
              <ButtonLink href={mailto} arrow>
                Book a demonstration
              </ButtonLink>
            ) : (
              <span
                aria-disabled="true"
                className="inline-flex min-h-11 items-center rounded-xl border border-dashed border-amber/60 px-5 py-2.5 font-semibold text-amber"
              >
                Demo bookings open soon
              </span>
            )}
            <ButtonLink href="/login" variant="secondary">
              Sign in to your till
            </ButtonLink>
          </div>
        </AnimatedContent>
      </Container>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-ink-700 py-12">
      <Container className="flex flex-col gap-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Logo size={28} />
          <p className="text-sm text-cream-faint">
            Powered by <span className="font-bold tracking-wide text-cream">{site.company}</span>
          </p>
        </div>
        <p className="max-w-4xl text-xs leading-relaxed text-cream-faint">
          Screens show demonstration data; names, figures and the logo are fictional. ENYO POS records payments taken
          through your existing providers and is not affiliated with MTN, Telecel, AT or Microsoft. All trademarks belong to
          their owners. Tax settings must be configured by the business; ENYO POS is not certified with GRA&rsquo;s E-VAT or
          fiscal device systems. Reports are for management purposes and are not tax, accounting or legal advice.
        </p>
      </Container>
    </footer>
  );
}
