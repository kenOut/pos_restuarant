import type { Metadata } from "next";
import { requireOnline } from "@/lib/platform/session";

export const metadata: Metadata = { title: { default: "ENYO Online", template: "%s · ENYO Online" }, robots: { index: false } };

// Everything here reads this server's list of client businesses.
export const dynamic = "force-dynamic";

/** The seller's pages (ENYO Online only). */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  requireOnline();
  return children;
}
