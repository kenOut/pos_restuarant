import { redirect } from "next/navigation";

/** Older address for first-time setup. */
export default function SetupRedirect() {
  redirect("/hq/setup");
}
