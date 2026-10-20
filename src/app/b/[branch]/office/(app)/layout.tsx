import type { Metadata } from "next";
import { TillLive } from "@/components/till/till-live";
import { TillNav, type NavItem } from "@/components/till/till-nav";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { getRestaurantName } from "@/lib/auth/service";
import { requireOffice } from "@/lib/office/session";
import { getSettings, logoUrl } from "@/lib/settings/service";
import { isOnline } from "@/db";
import { getLink } from "@/lib/sync/client";
import { getPeer } from "@/lib/sync/server";
import { branchBase, getControl, getDb } from "@/lib/tenancy/context";
import { logoutOffice } from "../actions";

export const metadata: Metadata = { title: { default: "Back office", template: "%s · Back office · ENYO POS" } };

const SYNC_ITEM: NavItem = { id: "sync", label: "Sync", icon: "sync", href: "/office/sync" };

const ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", href: "/office", exact: true },
  { id: "orders", label: "Orders", icon: "orders", href: "/office/orders" },
  { id: "payments", label: "Payments", icon: "cash", href: "/office/payments" },
  { id: "reports", label: "Reports", icon: "reports", href: "/office/reports" },
  { id: "settings", label: "Settings", icon: "settings", href: "/office/settings" },
];

/** Back office shell: the till's side menu with the back office's sections, and Log out. */
export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const person = await requireOffice();
  const db = await getDb();
  const settings = getSettings(db, person.restaurantId);
  return (
    <div className="flex h-dvh">
      <TillLive eventsPath="/office/api/events" />
      <TillNav
        label="Back office"
        // Sync appears once this business is kept in step between the restaurant computer and ENYO Online.
        items={(isOnline() ? getPeer(await getControl()) : getLink()) ? [...ITEMS.slice(0, 4), SYNC_ITEM, ITEMS[4]] : ITEMS}
        phoneTabs={["dashboard", "orders", "payments", "reports"]}
        exit={{ action: logoutOffice, label: "Log out", icon: "logout" }}
        restaurantName={settings?.name ?? getRestaurantName(db) ?? "ENYO POS"}
        logoUrl={logoUrl(await branchBase(), settings?.logoFile ?? null)}
        person={{ name: person.name, initials: person.initials, label: person.jobTitle ?? ROLE_LABELS[person.role] }}
      />
      <main className="min-w-0 flex-1 overflow-y-auto pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
    </div>
  );
}
