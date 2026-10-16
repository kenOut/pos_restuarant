import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SettingsForm } from "@/components/settings/settings-form";
import { branchBase, branchPath, getBranch, getDb } from "@/lib/tenancy/context";
import { requireStaff } from "@/lib/auth/session";
import { canManageBackups, getBackupStatus } from "@/lib/backups/service";
import { canEditTaxes, getSettings, logoUrl } from "@/lib/settings/service";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const person = await requireStaff("settings");
  const settings = getSettings((await getDb()), person.restaurantId);
  if (!settings) notFound();
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-ink-700 bg-ink-850 px-4 py-2 text-sm">
        <p className="flex-1">Sales, orders, payments, reports and API keys are in the back office, with the same PIN.</p>
        <Link href={await branchPath("/office")} className="inline-flex min-h-11 items-center rounded-xl border border-ink-600 px-4 font-semibold hover:bg-ink-800">
          Open the back office
        </Link>
      </div>
      <SettingsForm
        settings={settings}
        logoUrl={logoUrl(await branchBase(), settings.logoFile)}
        canEditTaxes={canEditTaxes(person.role)}
        backups={canManageBackups(person.role) ? getBackupStatus(await getBranch()) : null}
      />
    </>
  );
}
