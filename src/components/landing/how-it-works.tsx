import AnimatedContent from "@/components/react-bits/AnimatedContent";
import { SyncDiagram } from "./sync-diagram";
import { Container, Eyebrow, SectionTitle } from "./ui";

const NOTES = [
  {
    lead: "Keeps working offline.",
    text: "Tills talk to the main computer over your own network, so service continues when the internet is down.",
  },
  {
    lead: "Changes appear everywhere",
    text: "within about a second. Two tills can edit the same order without losing items.",
  },
  {
    lead: "Branches catch up later.",
    text: "Each branch queues its sales and sends them to head office when the connection returns.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-16 py-20 sm:py-28">
      <Container>
        <Eyebrow>How it works</Eyebrow>
        <SectionTitle className="max-w-4xl">
          <span id="how-title">Your data lives in your restaurant. Every screen stays in step.</span>
        </SectionTitle>

        <div className="mt-14">
          <SyncDiagram />
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {NOTES.map((n, i) => (
            <AnimatedContent key={n.lead} distance={30} delay={i * 0.1}>
              <p className="leading-relaxed text-cream-muted">
                <strong className="font-semibold text-cream">{n.lead}</strong> {n.text}
              </p>
            </AnimatedContent>
          ))}
        </div>
      </Container>
    </section>
  );
}
