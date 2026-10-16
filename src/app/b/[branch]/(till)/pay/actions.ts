"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/tenancy/context";
import { requireStaff } from "@/lib/auth/session";
import { publish } from "@/lib/live/bus";
import {
  setDiscount,
  setTip,
  takePayment,
  type Approval,
  type DiscountInput,
  type PaymentInput,
  type TakePaymentResult,
} from "@/lib/payments/service";

function refresh(restaurantId: string, orderId: string) {
  void orderId;
  revalidatePath("/b/[branch]", "layout");
  publish(restaurantId, { type: "changed" });
}

export async function takePaymentAction(orderId: string, input: PaymentInput): Promise<TakePaymentResult> {
  const person = await requireStaff("order");
  if (typeof orderId !== "string") return { ok: false, error: "That order no longer exists." };
  const result = takePayment((await getDb()), person, orderId, input);
  if (result.ok) refresh(person.restaurantId, orderId);
  return result;
}

export async function setDiscountAction(orderId: string, discount: DiscountInput, approval: Approval) {
  const person = await requireStaff("order");
  if (typeof orderId !== "string") return { ok: false as const, error: "That order no longer exists." };
  const result = await setDiscount((await getDb()), person, orderId, discount, approval);
  if (result.ok) refresh(person.restaurantId, orderId);
  return result;
}

export async function setTipAction(orderId: string, tip: number) {
  const person = await requireStaff("order");
  if (typeof orderId !== "string") return { ok: false as const, error: "That order no longer exists." };
  const result = setTip((await getDb()), person, orderId, tip);
  if (result.ok) refresh(person.restaurantId, orderId);
  return result;
}
