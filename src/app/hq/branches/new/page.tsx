import type { Metadata } from "next";
import Link from "next/link";
import { NewBranchForm } from "@/components/hq/hq-forms";
import { getControlDb } from "@/db";
import { requireHq } from "@/lib/hq/session";
import { hqPath } from "@/lib/tenancy/context";
import { listBranches } from "@/lib/tenancy/registry";

export const metadata: Metadata = { title: "Add a branch" };

export default async function NewBranchPage() {
  await requireHq();
  const branches = listBranches(getControlDb()).map((b) => ({ id: b.id, name: b.name }));
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10">
      <Link href={await hqPath("/")} className="inline-flex min-h-11 items-center text-amber underline-offset-4 hover:underline">
        ← Head office
      </Link>
      <h1 className="mt-4 font-display text-3xl font-bold">Add a branch</h1>
      <p className="mt-2 text-cream-muted">The new branch gets its own database, staff, orders and backups.</p>
      <NewBranchForm branches={branches} />
    </main>
  );
}
