import { redirect } from "next/navigation";
import { isOnline } from "@/db";

export const dynamic = "force-dynamic";

/** Older address for first-time setup. On ENYO Online, businesses are added from the seller's page. */
export default function SetupRedirect() {
  redirect(isOnline() ? "/admin" : "/hq/setup");
}
