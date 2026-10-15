import { TillLive } from "@/components/till/till-live";
import { TillNav } from "@/components/till/till-nav";
import { countActiveTickets } from "@/lib/kitchen/service";
import { getSettings, logoUrl } from "@/lib/settings/service";
import { getDb } from "@/db";
import { ROLE_LABELS, navFor } from "@/lib/auth/roles";
import { getRestaurantName } from "@/lib/auth/service";
import { requireStaff } from "@/lib/auth/session";

/**
 * Till shell: the deck's left rail on tablets and desktops, bottom tabs on phones.
 * Each screen fills the remaining space and manages its own scrolling.
 */
export default async function TillLayout({ children }: { children: React.ReactNode }) {
  const person = await requireStaff();
  const db = getDb();
  const settings = getSettings(db, person.restaurantId);
  const restaurantName = settings?.name ?? getRestaurantName(db) ?? "ENYO POS";

  return (
    <div className="flex h-dvh">
      <TillLive />
      <TillNav
        badges={{ kitchen: countActiveTickets(db, person.restaurantId) }}
        items={navFor(person.role)}
        restaurantName={restaurantName}
        logoUrl={logoUrl(settings?.logoFile ?? null)}
        person={{ name: person.name, initials: person.initials, label: person.jobTitle ?? ROLE_LABELS[person.role] }}
      />
      <main className="min-w-0 flex-1 overflow-y-auto pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>
    </div>
  );
}
