"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Icon } from "@/components/icons";

/** Print and back buttons above a receipt; hidden on paper. Opens the print dialog straight away when asked. */
export function PrintControls({ autoPrint, backHref }: { autoPrint: boolean; backHref: string }) {
  useEffect(() => {
    if (!autoPrint) return;
    // Let fonts and layout settle so the first print isn't blank.
    const id = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(id);
  }, [autoPrint]);

  return (
    <div className="mx-auto flex w-[80mm] max-w-full justify-between gap-2 print:hidden">
      <Link href={backHref} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-ink-600 px-4 font-semibold text-cream hover:bg-ink-800">
        <Icon name="back" className="size-4" />
        Back
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-amber px-4 font-semibold text-amber-ink hover:bg-[#f5b552]"
      >
        <Icon name="printer" className="size-4" />
        Print
      </button>
    </div>
  );
}
