import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { SignInScreen } from "@/components/auth/sign-in-screen";
import { branchBase, branchPath, getDb, hqPath } from "@/lib/tenancy/context";
import { homePathFor } from "@/lib/auth/roles";
import { getRestaurantName, listSignInTiles } from "@/lib/auth/service";
import { getCurrentStaff } from "@/lib/auth/session";
import { restaurants } from "@/db/schema";
import { getSettings, logoUrl } from "@/lib/settings/service";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ restored?: string }> }) {
  // Already signed in on this device: go straight to work. Lock first to switch person.
  const current = await getCurrentStaff();
  if (current) redirect(await branchPath(homePathFor(current.role)));

  const db = await getDb();
  const restaurantName = getRestaurantName(db);
  const tiles = listSignInTiles(db);
  const restaurantId = db.select({ id: restaurants.id }).from(restaurants).get()?.id;
  const logo = restaurantId ? logoUrl(await branchBase(), getSettings(db, restaurantId)?.logoFile ?? null) : null;

  if (!restaurantName || tiles.length === 0) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="max-w-md text-center">
          <Logo size={40} className="justify-center" />
          <h1 className="mt-8 font-display text-3xl font-bold">Nobody can sign in yet</h1>
          <p className="mt-3 text-cream-muted">
            This branch has no active staff. Restore a backup of this branch, or ask head office to check the branch.
          </p>
          <Link href={await hqPath("/")} className="mt-8 inline-block text-amber underline-offset-4 hover:underline">
            Go to head office
          </Link>
        </div>
      </main>
    );
  }

  const { restored } = await searchParams;
  return (
    <main>
      {restored === "1" ? (
        <p role="status" className="bg-eating-soft px-4 py-3 text-center font-semibold">
          Backup restored. Everyone needs to sign in again.
        </p>
      ) : null}
      <SignInScreen restaurantName={restaurantName} logoUrl={logo} tiles={tiles} />
    </main>
  );
}
