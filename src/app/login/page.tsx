import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { SignInScreen } from "@/components/auth/sign-in-screen";
import { getDb } from "@/db";
import { homePathFor } from "@/lib/auth/roles";
import { getRestaurantName, listSignInTiles } from "@/lib/auth/service";
import { getCurrentStaff } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  // Already signed in on this device: go straight to work. Lock first to switch person.
  const current = await getCurrentStaff();
  if (current) redirect(homePathFor(current.role));

  const db = getDb();
  const restaurantName = getRestaurantName(db);
  const tiles = listSignInTiles(db);

  if (!restaurantName || tiles.length === 0) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="max-w-md text-center">
          <Logo size={40} className="justify-center" />
          <h1 className="mt-8 font-display text-3xl font-bold">This till isn&rsquo;t set up yet</h1>
          <p className="mt-3 text-cream-muted">
            No restaurant or staff have been added to this main computer. First-time setup comes in a later phase; for
            now, start the app with <code className="rounded bg-ink-800 px-1.5 py-0.5 text-cream">ENYO_SEED_DEMO=1</code> to
            load the demonstration staff.
          </p>
          <Link href="/" className="mt-8 inline-block text-amber underline-offset-4 hover:underline">
            Back to the ENYO POS website
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <SignInScreen restaurantName={restaurantName} tiles={tiles} />
    </main>
  );
}
