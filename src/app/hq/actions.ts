"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkHqLogin, claimHeadOffice, setupBusiness } from "@/lib/hq/service";
import { endHqSession, requireHq, startHqSession } from "@/lib/hq/session";
import { getPlatformDb, isOnline } from "@/db";
import { checkSetupCode, clearSetupCode } from "@/lib/platform/service";
import { branchOpener, businessSlug, getControl, getTenant, hqPath, openBranchDb } from "@/lib/tenancy/context";
import { createBranch, findBranchById, renameBranch, setBranchActive, type MenuStart } from "@/lib/tenancy/registry";

export type HqFormState = { error: string } | null;

const text = (data: FormData, key: string) => String(data.get(key) ?? "");

function matchingPins(data: FormData): string | null {
  return text(data, "pin") === text(data, "confirmPin") ? null : "The two PINs don't match.";
}

export async function setupAction(_: HqFormState, data: FormData): Promise<HqFormState> {
  const mismatch = matchingPins(data);
  if (mismatch) return { error: mismatch };
  // On ENYO Online, only whoever has the business's setup link can set it up.
  const slug = await businessSlug();
  if (isOnline() && (!slug || !checkSetupCode(getPlatformDb(), slug, text(data, "setupCode")))) {
    return { error: "This setup link isn't valid or has expired. Ask ENYO for a new one." };
  }
  const result = await setupBusiness(
    await getControl(),
    (await getTenant()).dataDir,
    {
      businessName: text(data, "businessName"),
      name: text(data, "name"),
      email: text(data, "email"),
      password: text(data, "password"),
      branchName: text(data, "branchName"),
      branchSlug: text(data, "branchSlug"),
      pin: text(data, "pin"),
      sampleMenu: data.get("sampleMenu") === "on",
    },
    await branchOpener()
  );
  if (!result.ok) return { error: result.error };
  if (isOnline() && slug) clearSetupCode(getPlatformDb(), slug);
  await startHqSession(result.userId);
  redirect(await hqPath("/"));
}

export async function loginAction(_: HqFormState, data: FormData): Promise<HqFormState> {
  const result = await checkHqLogin(await getControl(), text(data, "email"), text(data, "password"));
  if (!result.ok) return { error: result.error };
  await startHqSession(result.userId);
  redirect(await hqPath("/"));
}

export async function logoutAction(): Promise<void> {
  await endHqSession();
  redirect(await hqPath("/login"));
}

export async function claimAction(_: HqFormState, data: FormData): Promise<HqFormState> {
  const [branchId, ownerStaffId] = text(data, "owner").split(":");
  const branch = branchId ? findBranchById(await getControl(), branchId) : undefined;
  if (!branch) return { error: "Choose one of the branch's owners." };
  const result = await claimHeadOffice(await getControl(), await openBranchDb(branch), {
    ownerStaffId: ownerStaffId ?? "",
    pin: text(data, "pin"),
    name: text(data, "name"),
    email: text(data, "email"),
    password: text(data, "password"),
  });
  if (!result.ok) return { error: result.error };
  await startHqSession(result.userId);
  redirect(await hqPath("/"));
}

export async function createBranchAction(_: HqFormState, data: FormData): Promise<HqFormState> {
  await requireHq();
  const mismatch = matchingPins(data);
  if (mismatch) return { error: mismatch };
  const menuChoice = text(data, "menu");
  const menu: MenuStart = menuChoice.startsWith("copy:")
    ? { kind: "copy", fromBranchId: menuChoice.slice(5) }
    : { kind: menuChoice === "sample" ? "sample" : "empty" };
  const result = await createBranch(
    await getControl(),
    (await getTenant()).dataDir,
    { name: text(data, "branchName"), slug: text(data, "branchSlug"), leadName: text(data, "leadName"), pin: text(data, "pin"), menu },
    await branchOpener()
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/hq", "layout");
  redirect(await hqPath(`/?created=${result.branch.slug}`));
}

export async function renameBranchAction(_: HqFormState, data: FormData): Promise<HqFormState> {
  await requireHq();
  const branch = findBranchById(await getControl(), text(data, "branchId"));
  if (!branch) return { error: "That branch no longer exists." };
  const result = renameBranch(await getControl(), branch.id, text(data, "name"), await openBranchDb(branch));
  if (!result.ok) return { error: result.error };
  revalidatePath("/hq", "layout");
  revalidatePath("/b/[branch]", "layout");
  return null;
}

export async function setBranchActiveAction(_: HqFormState, data: FormData): Promise<HqFormState> {
  await requireHq();
  const result = setBranchActive(await getControl(), text(data, "branchId"), text(data, "active") === "1");
  if (!result.ok) return { error: result.error };
  revalidatePath("/hq", "layout");
  return null;
}
