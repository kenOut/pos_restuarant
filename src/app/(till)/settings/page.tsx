import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SettingsForm } from "@/components/settings/settings-form";
import { getDb } from "@/db";
import { requireStaff } from "@/lib/auth/session";
import { canManageBackups, getBackupStatus } from "@/lib/backups/service";
import { canEditTaxes, getSettings, logoUrl } from "@/lib/settings/service";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const person = await requireStaff("settings");
  const settings = getSettings(getDb(), person.restaurantId);
  if (!settings) notFound();
  return (
    <SettingsForm
      settings={settings}
      logoUrl={logoUrl(settings.logoFile)}
      canEditTaxes={canEditTaxes(person.role)}
      backups={canManageBackups(person.role) ? getBackupStatus() : null}
    />
  );
}
