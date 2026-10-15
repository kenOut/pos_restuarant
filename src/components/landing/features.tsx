import AnimatedContent from "@/components/react-bits/AnimatedContent";
import { menuItem } from "@/data/demo-menu";
import { formatAmount, formatCedis } from "@/lib/money";
import { calculateBill } from "@/lib/tax";
import { PhoneFrame, TabletFrame } from "./mockups/device";
import { FloorPlanScreen, KitchenScreen } from "./mockups/floor-kitchen";
import { OrderScreen } from "./mockups/order-screen";
import { PaymentScreen } from "./mockups/payment-setup";
import { PhoneOrderScreen, PhoneSignInScreen } from "./mockups/phone-screens";
import { Parallax } from "./parallax";
import { Container, Eyebrow, PointList, SectionTitle } from "./ui";

export function TakeOrders() {
  return (
    <section id="take-orders" aria-labelledby="take-orders-title" className="scroll-mt-16 py-20 sm:py-28">
      <Container className="grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <Eyebrow>Take orders</Eyebrow>
          <SectionTitle>
            <span id="take-orders-title">From tap to kitchen in seconds.</span>
          </SectionTitle>
          <PointList
            className="mt-9"
            points={[
              { lead: "Menu by category,", text: "with search and sold-out items greyed out." },
              { lead: "Notes the kitchen can read:", text: "“no pepper”, “well done”, “pack to take away”." },
              { lead: "Dine-in, takeaway or delivery,", text: "with table, guests and server on every ticket." },
              { lead: "Hold and fire,", text: "so starters go now and mains later." },
              { lead: "Attach a guest", text: "to see allergies and add loyalty points." },
            ]}
          />
        </div>
        <AnimatedContent direction="horizontal" distance={60} duration={1}>
          <TabletFrame label="Order screen: categories on the left, menu items with prices and stations, and the current ticket with Hold, Send to kitchen and Pay buttons.">
            <OrderScreen />
          </TabletFrame>
        </AnimatedContent>
      </Container>
    </section>
  );
}

export function FloorAndKitchen() {
  return (
    <section aria-labelledby="floor-title" className="py-20 sm:py-28">
      <Container>
        <Eyebrow>Floor and kitchen</Eyebrow>
        <SectionTitle>
          <span id="floor-title">See every table. Never lose a ticket.</span>
        </SectionTitle>
        <div className="mt-12 grid gap-10 lg:grid-cols-2">
          <AnimatedContent distance={50}>
            <TabletFrame label="Floor plan with tables coloured by status: free, eating, waiting to pay and reserved. Table T7 is selected, showing its order and a Take payment button.">
              <FloorPlanScreen />
            </TabletFrame>
            <p className="mt-6 text-lg leading-relaxed text-cream-muted">
              <strong className="font-semibold text-cream">Live floor plan.</strong> Free, ordering, eating, waiting to pay
              and reserved, at a glance. Move tables and change servers.
            </p>
          </AnimatedContent>
          <AnimatedContent distance={50} delay={0.15}>
            <TabletFrame label="Kitchen display with four tickets and running timers. The oldest ticket, at 12 minutes, is highlighted amber. Each ticket has Start and Bump buttons.">
              <KitchenScreen />
            </TabletFrame>
            <p className="mt-6 text-lg leading-relaxed text-cream-muted">
              <strong className="font-semibold text-cream">Kitchen display.</strong> Timers turn amber at 10 minutes and red
              at 15. Bump when ready, recall if needed.
            </p>
          </AnimatedContent>
        </div>
      </Container>
    </section>
  );
}

export function Payments() {
  return (
    <section id="payments" aria-labelledby="payments-title" className="scroll-mt-16 py-20 sm:py-28">
      <Container className="grid items-center gap-14 lg:grid-cols-[1.15fr_0.85fr]">
        <AnimatedContent direction="horizontal" reverse distance={60} duration={1} className="order-last lg:order-first">
          <TabletFrame label="Payment screen for order 1926: mobile money selected, MTN MoMo network, GH₵ 408.00 to collect, with a number pad.">
            <PaymentScreen />
          </TabletFrame>
        </AnimatedContent>
        <div>
          <Eyebrow>Payments</Eyebrow>
          <SectionTitle>
            <span id="payments-title">Built for the way Ghana pays.</span>
          </SectionTitle>
          <PointList
            className="mt-9"
            points={[
              { lead: "Mobile money,", text: "cash with change, card, vouchers and house accounts." },
              { lead: "Split the bill", text: "in halves, thirds or quarters, or by any amount." },
              { lead: "Tips and discounts,", text: "with manager approval where you want it." },
              { lead: "Receipts with your logo,", text: "printed silently on your receipt printer." },
            ]}
          />
          <p className="mt-8 text-sm leading-relaxed text-cream-faint">
            ENYO POS records payments taken through your existing mobile money or card provider. It is not a payment
            processor and is not affiliated with MTN, Telecel or AT.
          </p>
        </div>
      </Container>
    </section>
  );
}

// The deck's receipt preview: 2× Jollof rice and 1× Sobolo at Chez Accra.
const RECEIPT = [
  { name: "Jollof rice", id: "jollof-chicken", quantity: 2 },
  { name: "Sobolo", id: "sobolo", quantity: 1 },
];

function Receipt() {
  const lines = RECEIPT.map((l) => ({ ...l, price: menuItem(l.id).price }));
  const bill = calculateBill(lines.map((l) => ({ unitPrice: l.price, quantity: l.quantity })));
  const row = "flex justify-between gap-6";

  return (
    <figure className="mx-auto w-full max-w-sm">
      <div className="rotate-1 rounded-sm bg-white px-7 py-8 font-mono text-sm text-paper-ink shadow-[0_2rem_4rem_-1rem_rgb(0_0_0/0.6)]">
        <p className="text-center text-base font-bold">Chez Accra</p>
        <div className="my-4 border-t border-dashed border-paper-ink/40" />
        {lines.map((l) => (
          <p key={l.id} className={row}>
            <span>
              {l.quantity}× {l.name}
            </span>
            <span>{formatAmount(l.price * l.quantity)}</span>
          </p>
        ))}
        <div className="my-4 border-t border-dashed border-paper-ink/40" />
        <p className={row}>
          <span>Subtotal</span>
          <span>{formatAmount(bill.subtotal)}</span>
        </p>
        {bill.taxes.map((t) => (
          <p key={t.id} className={row}>
            <span>{t.label}</span>
            <span>{formatAmount(t.amount)}</span>
          </p>
        ))}
        <p className={`${row} mt-3 text-base font-bold`}>
          <span>TOTAL</span>
          <span>{formatCedis(bill.total)}</span>
        </p>
        <div className="my-4 border-t border-dashed border-paper-ink/40" />
        <p className="text-center text-xs">Thank you for dining with us.</p>
      </div>
      <figcaption className="mt-6 text-center text-sm text-cream-faint">
        Receipt preview: each tax on its own line, and it always adds up.
      </figcaption>
    </figure>
  );
}

export function Taxes() {
  return (
    <section id="taxes" aria-labelledby="taxes-title" className="scroll-mt-16 py-20 sm:py-28">
      <Container className="grid items-center gap-14 lg:grid-cols-2">
        <div>
          <Eyebrow>Taxes</Eyebrow>
          <SectionTitle>
            <span id="taxes-title">Ready for Ghana&rsquo;s 2026 rates.</span>
          </SectionTitle>
          <PointList
            className="mt-9"
            points={[
              { lead: "One tap", text: "for VAT 15%, NHIL 2.5% and GETFund 2.5% (20% in total)." },
              { lead: "Each line shown separately,", text: "or combined into one line, and the receipt always adds up." },
              { lead: "Tax-inclusive menu prices", text: "if the price on your menu is what the guest pays." },
              { lead: "Past sales keep their taxes,", text: "so a future rate change never rewrites old reports." },
              { lead: "Taxes collected", text: "totalled separately in every report." },
            ]}
          />
          <p className="mt-8 text-sm leading-relaxed text-cream-faint">
            Confirm your obligations with the Ghana Revenue Authority. ENYO POS is not certified with GRA&rsquo;s E-VAT or
            fiscal device systems.
          </p>
        </div>
        <AnimatedContent distance={60} duration={1}>
          <Receipt />
        </AnimatedContent>
      </Container>
    </section>
  );
}

export function PhonesAndTablets() {
  return (
    <section aria-labelledby="phones-title" className="overflow-hidden py-20 sm:py-28">
      <Container className="grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <Eyebrow>Phones and tablets</Eyebrow>
          <SectionTitle>
            <span id="phones-title">Take the till to the table.</span>
          </SectionTitle>
          <PointList
            className="mt-9"
            points={[
              { lead: "Waiters order at the table", text: "on a phone. The kitchen sees it instantly." },
              { lead: "Tablets work in portrait or landscape,", text: "including as a kitchen screen." },
              { lead: "Add to the home screen", text: "and it opens full screen, like an app." },
              { lead: "Nothing to install", text: "on phones and tablets: just the browser." },
            ]}
          />
        </div>
        <div className="mx-auto grid w-full max-w-xl grid-cols-2 items-start gap-5 sm:gap-8">
          <AnimatedContent distance={60} duration={1}>
            <PhoneFrame label="Phone sign-in screen: staff tiles with names and roles, and a 4-digit PIN pad.">
              <PhoneSignInScreen />
            </PhoneFrame>
          </AnimatedContent>
          <Parallax distance={30} className="mt-16">
            <AnimatedContent distance={60} delay={0.15} duration={1}>
              <PhoneFrame label="Phone order screen with menu items and a View order bar showing three items.">
                <PhoneOrderScreen />
              </PhoneFrame>
            </AnimatedContent>
          </Parallax>
        </div>
      </Container>
    </section>
  );
}
