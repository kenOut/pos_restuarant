import { BranchProvider } from "@/components/tenancy/branch-context";
import { branchBase, getBranch } from "@/lib/tenancy/context";

/** Every branch screen: checks the branch exists and is open, and gives links its address. */
export default async function BranchLayout({ children }: { children: React.ReactNode }) {
  const branch = await getBranch();
  return (
    <BranchProvider base={await branchBase()} slug={branch.slug}>
      {children}
    </BranchProvider>
  );
}
