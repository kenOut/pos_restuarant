import type { Metadata } from "next";

export const metadata: Metadata = { title: { default: "Head office", template: "%s · Head office · ENYO POS" } };

// Everything here depends on this install's head office database.
export const dynamic = "force-dynamic";

export default function HqLayout({ children }: { children: React.ReactNode }) {
  return children;
}
