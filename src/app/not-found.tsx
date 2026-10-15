import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <Logo size={40} className="justify-center" />
        <h1 className="mt-8 font-display text-3xl font-bold">Page not found</h1>
        <p className="mt-3 text-cream-muted">That address doesn&rsquo;t exist on this till.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/login" className="inline-flex min-h-11 items-center rounded-xl bg-amber px-5 font-semibold text-amber-ink">
            Go to sign-in
          </Link>
          <Link href="/" className="inline-flex min-h-11 items-center rounded-xl border border-ink-600 px-5 font-semibold hover:bg-ink-800">
            ENYO POS website
          </Link>
        </div>
      </div>
    </main>
  );
}
