"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBranchDb, getControlDb, getDataDir } from "@/db";
import { checkHqLogin, claimHeadOffice, setupBusiness } from "@/lib/hq/service";
import { endHqSession, requireHq, startHqSession } from "@/lib/hq/session";
import { hqPath } from "@/lib/tenancy/context";
import { createBranch, findBranchById, renameBranch, setBranchActive, type MenuStart } from "@/lib/tenancy/registry";

export type HqFormState = { error: string } | null;

const text = (data: FormData, key: string) => String(data.get(key) ?? "");

function matchingPins(data: FormData): string | null {
  return text(data, "pin") === text(data, "confirmPin") ? null : "The two PINs don't match.";
}

export async function setupAction(_: HqFormState, data: FormData): Promise<HqFormState> {
  const mismatch = matchingPins(data);
  if (mismatch) return { error: mismatch };
  const result = await setupBusiness(
    getControlDb(),
    getDataDir(),
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
    getBranchDb
  );
  if (!result.ok) return { error: result.error };
  await startHqSession(result.userId);
  redirect(await hqPath("/"));
}

export async function loginAction(_: HqFormState, data: FormData): Promise<HqFormState> {
  const result = await checkHqLogin(getControlDb(), text(data, "email"), text(data, "password"));
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
  const branch = branchId ? findBranchById(getControlDb(), branchId) : undefined;
  if (!branch) return { error: "Choose one of the branch's owners." };
  const result = await claimHeadOffice(getControlDb(), getBranchDb(branch), {
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
    getControlDb(),
    getDataDir(),
    { name: text(data, "branchName"), slug: text(data, "branchSlug"), leadName: text(data, "leadName"), pin: text(data, "pin"), menu },
    getBranchDb
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/hq", "layout");
  redirect(await hqPath(`/?created=${result.branch.slug}`));
}

export async function renameBranchAction(_: HqFormState, data: FormData): Promise<HqFormState> {
  await requireHq();
  const branch = findBranchById(getControlDb(), text(data, "branchId"));
  if (!branch) return { error: "That branch no longer exists." };
  const result = renameBranch(getControlDb(), branch.id, text(data, "name"), getBranchDb(branch));
  if (!result.ok) return { error: result.error };
  revalidatePath("/hq", "layout");
  revalidatePath("/b/[branch]", "layout");
  return null;
}

export async function setBranchActiveAction(_: HqFormState, data: FormData): Promise<HqFormState> {
  await requireHq();
  const result = setBranchActive(getControlDb(), text(data, "branchId"), text(data, "active") === "1");
  if (!result.ok) return { error: result.error };
  revalidatePath("/hq", "layout");
  return null;
}
