import { TillLive, type Failover } from "@/components/till/till-live";
import { isOnline } from "@/db";
import { getLink } from "@/lib/sync/client";
import { getPeer } from "@/lib/sync/server";
import { meta, setMeta } from "@/lib/sync/engine";
import { headers } from "next/headers";
import { TillNav } from "@/components/till/till-nav";
import { countActiveTickets } from "@/lib/kitchen/service";
import { getSettings, logoUrl } from "@/lib/settings/service";
import { getBranch, getControl, getDb } from "@/lib/tenancy/context";
import { ROLE_LABELS, navFor } from "@/lib/auth/roles";
import { getRestaurantName } from "@/lib/auth/service";
import { requireStaff } from "@/lib/auth/session";
import { branchBase } from "@/lib/tenancy/context";

/**
 * Switching to ENYO Online and back. On the main computer, when it's connected to
 * ENYO Online: this branch's address there. On ENYO Online: check for the way back.
 * ENYO_FAILOVER_AFTER_MS and ENYO_FAILOVER_POLL_MS shorten the waits (for tests).
 */
async function failover(): Promise<Failover | undefined> {
  const timing = { afterMs: Number(process.env.ENYO_FAILOVER_AFTER_MS) || 30_000, pollMs: Number(process.env.ENYO_FAILOVER_POLL_MS) || 15_000 };
  if (isOnline()) return getPeer(await getControl()) ? { ...timing, checkBack: true } : undefined;
  const link = getLink();
  if (!link) return undefined;
  // The address tills here use for this branch, sent with each sync so ENYO Online can send them back.
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const protocol = (h.get("x-forwarded-proto") ?? "http").split(",")[0].trim();
  const here = `${protocol}://${host}${await branchBase()}`;
  const db = (await getDb()).$client;
  if (host && meta(db, "local_address") !== here) setMeta(db, "local_address", here);
  return { ...timing, onlineUrl: `${link.url}/b/${(await getBranch()).slug}` };
}

/**
 * Till shell: the deck's left rail on tablets and desktops, bottom tabs on phones.
 * Each screen fills the remaining space and manages its own scrolling.
 */
export default async function TillLayout({ children }: { children: React.ReactNode }) {
  const person = await requireStaff();
  const db = await getDb();
  const settings = getSettings(db, person.restaurantId);
  const restaurantName = settings?.name ?? getRestaurantName(db) ?? "ENYO POS";

  return (
    <div className="flex h-dvh">
      <TillLive failover={await failover()} />
      <TillNav
        badges={{ kitchen: countActiveTickets(db, person.restaurantId) }}
        items={navFor(person.role)}
        restaurantName={restaurantName}
        logoUrl={logoUrl(await branchBase(), settings?.logoFile ?? null)}
        person={{ name: person.name, initials: person.initials, label: person.jobTitle ?? ROLE_LABELS[person.role] }}
      />
      <main className="min-w-0 flex-1 overflow-y-auto pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>
    </div>
  );
}
