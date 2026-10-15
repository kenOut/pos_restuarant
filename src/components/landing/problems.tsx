import AnimatedContent from "@/components/react-bits/AnimatedContent";
import ScrollReveal from "@/components/react-bits/ScrollReveal";
import { Container, Eyebrow, SectionTitle } from "./ui";

const PROBLEMS = [
  {
    title: "The internet drops",
    body: "Cloud-only systems stop taking orders exactly when the dining room is full.",
  },
  {
    title: "Orders go missing",
    body: "Paper tickets between floor, kitchen and bar get lost, misread or delayed.",
  },
  {
    title: "Branches drift apart",
    body: "Each site keeps its own prices and numbers, so the owner never sees the whole picture.",
  },
  {
    title: "Taxes keep changing",
    body: "Since 1 January 2026 the standard rate is VAT 15% + NHIL 2.5% + GETFund 2.5%, shown separately.",
  },
];

export function Problems() {
  return (
    <section aria-labelledby="problems-title" className="bg-paper py-20 text-paper-ink sm:py-28">
      <Container>
        <Eyebrow tone="paper">The everyday reality</Eyebrow>
        <SectionTitle className="max-w-3xl">
          <span id="problems-title">Busy service has no time for a system that stops.</span>
        </SectionTitle>

        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PROBLEMS.map((p, i) => (
            <li key={p.title}>
              <AnimatedContent distance={40} delay={i * 0.1} className="h-full">
                <article className="h-full rounded-card border border-paper-line bg-white p-6 shadow-[0_1rem_2rem_-1.5rem_rgb(26_23_18/0.25)] transition-transform duration-300 hover:-translate-y-1 motion-reduce:transition-none">
                  <span className="font-display text-lg font-bold text-amber-strong">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="mt-2 font-display text-xl font-bold">{p.title}</h3>
                  <p className="mt-2 leading-relaxed text-paper-muted">{p.body}</p>
                </article>
              </AnimatedContent>
            </li>
          ))}
        </ol>

        <div className="mt-16 border-l-4 border-amber pl-5 sm:mt-24">
          <ScrollReveal
            baseOpacity={0.15}
            baseRotation={1.5}
            blurStrength={3}
            containerClassName="my-0"
            textClassName="font-display text-[clamp(1.6rem,3.6vw,2.5rem)]! leading-tight! font-extrabold! text-paper-ink"
          >
            ENYO POS was designed around these four problems.
          </ScrollReveal>
        </div>
      </Container>
    </section>
  );
}
