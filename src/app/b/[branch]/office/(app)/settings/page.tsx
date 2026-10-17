import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ApiAccess } from "@/components/office/api-access";
import { SettingsForm } from "@/components/settings/settings-form";
import { canManageApiKeys, getAllowedOrigins, listApiKeys } from "@/lib/api/keys";
import { canManageBackups, getBackupStatus } from "@/lib/backups/service";
import { requireOffice } from "@/lib/office/session";
import { canEditTaxes, getSettings, logoUrl } from "@/lib/settings/service";
import { branchBase, getBranch, getDb, getTenant } from "@/lib/tenancy/context";

export const metadata: Metadata = { title: "Settings" };

/** The address other systems call, as this browser reached the branch. */
async function apiBase(): Promise<string> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const protocol = (h.get("x-forwarded-proto") ?? "http").split(",")[0].trim();
  return `${protocol}://${host}${await branchBase()}/api/v1`;
}

export default async function OfficeSettingsPage() {
  const person = await requireOffice();
  const db = await getDb();
  const settings = getSettings(db, person.restaurantId);
  if (!settings) notFound();
  return (
    <div>
      <SettingsForm
        settings={settings}
        logoUrl={logoUrl(await branchBase(), settings.logoFile)}
        canEditTaxes={canEditTaxes(person.role)}
        backups={canManageBackups(person.role) ? getBackupStatus(await getTenant(), await getBranch()) : null}
        downloadBase="/office"
      />
      <div className="p-3 sm:p-4">
        <ApiAccess keys={listApiKeys(db, person.restaurantId)} origins={getAllowedOrigins(db, person.restaurantId)} apiBase={await apiBase()} canManage={canManageApiKeys(person.role)} />
      </div>
    </div>
  );
}
