"use client";

import { buttonLinkClass } from "./parts";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={`${buttonLinkClass} print:hidden`}>
      Print
    </button>
  );
}
