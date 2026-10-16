"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";

/**
 * The branch a page belongs to, for links built in the browser: base is ""
 * on the branch's own subdomain and "/b/<slug>" on any other address.
 */
const BranchContext = createContext<{ base: string; slug: string }>({ base: "", slug: "" });

export function BranchProvider({ base, slug, children }: { base: string; slug: string; children: ReactNode }) {
  return <BranchContext.Provider value={{ base, slug }}>{children}</BranchContext.Provider>;
}

/** Turns "/order" into this branch's address for it. */
export function useBranchPath(): (path: string) => string {
  const { base } = useContext(BranchContext);
  return useCallback((path: string) => `${base}${path}`, [base]);
}
