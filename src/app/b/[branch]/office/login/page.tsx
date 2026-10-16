import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInScreen } from "@/components/auth/sign-in-screen";
import { restaurants } from "@/db/schema";
import { getRestaurantName, listSignInTiles } from "@/lib/auth/service";
import { OFFICE_ROLES, getOfficeStaff } from "@/lib/office/session";
import { getSettings, logoUrl } from "@/lib/settings/service";
import { branchBase, branchPath, getDb } from "@/lib/tenancy/context";
import { officeSignIn } from "./actions";

export const metadata: Metadata = { title: "Back office sign-in" };

export default async function OfficeLoginPage() {
  if (await getOfficeStaff()) redirect(await branchPath("/office"));
  const db = await getDb();
  const restaurantId = db.select({ id: restaurants.id }).from(restaurants).get()?.id;
  const logo = restaurantId ? logoUrl(await branchBase(), getSettings(db, restaurantId)?.logoFile ?? null) : null;
  return (
    <main>
      <SignInScreen
        restaurantName={getRestaurantName(db) ?? "ENYO POS"}
        logoUrl={logo}
        tiles={listSignInTiles(db, OFFICE_ROLES)}
        action={officeSignIn}
        area="Back office"
      />
    </main>
  );
}
