import type { Metadata } from "next";
import { BusinessControls, NewBusinessForm } from "@/components/admin-platform/forms";
import { Logo } from "@/components/brand/logo";
import { controlDbFor, getPlatformDb, tenantFor } from "@/db";
import { listBusinesses } from "@/lib/platform/service";
import { requireAdmin } from "@/lib/platform/session";
import { adminLogoutAction } from "./actions";

export const metadata: Metadata = { title: "Clients" };

const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Africa/Accra" });

/** Every client restaurant on this server: status and branches only, never their sales. */
export default async function AdminPage() {
  const admin = await requireAdmin();
  const clients = listBusinesses(getPlatformDb(), (b) => controlDbFor(tenantFor(b)));
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="flex flex-wrap items-center gap-3">
        <Logo size={32} />
        <span className="font-semibold text-cream-muted">ENYO Online</span>
        <div className="ml-auto flex items-center gap-3 text-sm text-cream-muted">
          <span>{admin.name}</span>
          <form action={adminLogoutAction}>
            <button type="submit" className="min-h-11 rounded-xl border border-ink-600 px-4 font-semibold text-cream hover:bg-ink-800">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <h1 className="mt-8 font-display text-3xl font-bold">Clients</h1>
      <p className="mt-1 text-cream-muted">
        {clients.length} restaurant business{clients.length === 1 ? "" : "es"} on this server. Each keeps its own data; you see only their names and status.
      </p>

      <section aria-labelledby="add" className="mt-6 rounded-2xl border border-ink-700 bg-ink-850 p-4">
        <h2 id="add" className="font-display text-xl font-semibold">
          Add a client
        </h2>
        <p className="mb-3 text-sm text-cream-muted">They get a one-time link to set up their business, head office sign-in and first branch.</p>
        <NewBusinessForm />
      </section>

      <ul className="mt-6 space-y-3">
        {clients.map((c) => (
          <li key={c.id} data-client={c.slug} className="rounded-2xl border border-ink-700 bg-ink-850 p-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-lg font-semibold">
                  {c.name}
                  <span className="ml-2 rounded-full bg-ink-700 px-2 py-0.5 align-middle text-xs font-semibold text-cream">
                    {!c.active ? "Suspended" : c.setUp ? "Set up" : "Waiting for setup"}
                  </span>
                </h3>
                <p className="text-sm text-cream-muted">
                  /c/{c.slug} · added {day.format(c.createdAt)}
                  {c.branches.length ? ` · ${c.branches.length} branch${c.branches.length === 1 ? "" : "es"}: ${c.branches.map((b) => b.name).join(", ")}` : ""}
                </p>
              </div>
              {c.active && c.setUp ? (
                <a href={`/c/${c.slug}/hq`} className="inline-flex min-h-11 items-center rounded-xl border border-ink-600 px-4 text-sm font-semibold hover:bg-ink-800">
                  Their head office
                </a>
              ) : null}
            </div>
            <div className="mt-3">
              <BusinessControls business={{ id: c.id, name: c.name, active: c.active, setUp: c.setUp }} />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
