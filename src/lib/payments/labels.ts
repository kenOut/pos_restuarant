// Payment wording shared by the pay screen and the receipt (no server-only imports).
import type { MomoNetwork, PaymentMethod } from "@/db/enums";

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  mobile_money: "Mobile money",
  voucher: "Voucher",
  house_account: "House account",
};

export const METHOD_HINTS: Record<PaymentMethod, string> = {
  cash: "Notes and coins",
  card: "On the card terminal",
  mobile_money: "MoMo, Telecel Cash, AT Money",
  voucher: "Gift card or promo",
  house_account: "Pay later on account",
};

export const NETWORK_LABELS: Record<MomoNetwork, string> = {
  mtn: "MTN MoMo",
  telecel: "Telecel Cash",
  at: "AT Money",
};

/** "Mobile money · MTN MoMo · 024 000 5821" */
export function describePayment(p: { method: PaymentMethod; network: MomoNetwork | null; account: string | null; reference: string | null }): string {
  return [METHOD_LABELS[p.method], p.network ? NETWORK_LABELS[p.network] : null, p.account, p.reference ? `Ref ${p.reference}` : null]
    .filter(Boolean)
    .join(" · ");
}

export const QUICK_DISCOUNT_REASONS = ["Regular guest", "Staff meal", "Service recovery", "Promotion"] as const;
