import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { HqClaimForm } from "@/components/hq/hq-forms";
import { getBranchDb, getControlDb } from "@/db";
import { staff } from "@/db/schema";
import { hasHqUsers } from "@/lib/hq/service";
import { hqPath } from "@/lib/tenancy/context";
import { listBranches, needsSetup } from "@/lib/tenancy/registry";

export const metadata: Metadata = { title: "Create head office sign-in" };

/** For an install upgraded from a single restaurant: it has a branch but no head office sign-in yet. */
export default async function HqClaimPage() {
  const control = getControlDb();
  if (needsSetup(control)) redirect(await hqPath("/setup"));
  if (hasHqUsers(control)) redirect(await hqPath("/login"));

  const branches = listBranches(control, { includeInactive: false });
  const owners = branches.flatMap((branch) =>
    getBranchDb(branch)
      .select({ id: staff.id, name: staff.name })
      .from(staff)
      .where(and(eq(staff.role, "owner"), eq(staff.active, true)))
      .orderBy(asc(staff.name))
      .all()
      .map((o) => ({ value: `${branch.id}:${o.id}`, label: branches.length > 1 ? `${o.name} (${branch.name})` : o.name }))
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10">
      <Logo size={36} />
      <h1 className="mt-8 font-display text-3xl font-bold">Create the head office sign-in</h1>
      <p className="mt-2 text-cream-muted">
        ENYO POS now runs several branches from one head office, and your restaurant is the first branch. To create the head
        office sign-in, an owner enters their PIN.
      </p>
      {owners.length ? (
        <HqClaimForm owners={owners} />
      ) : (
        <p role="alert" className="mt-8 text-alert">
          No branch has an active owner. Restore a backup, then come back here.
        </p>
      )}
    </main>
  );
}
