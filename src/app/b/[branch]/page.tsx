import { redirect } from "next/navigation";
import { branchPath } from "@/lib/tenancy/context";

/** A branch's own address (osu.yourdomain.com) opens its sign-in screen. */
export default async function BranchHome() {
  redirect(await branchPath("/login"));
}
