"use client";

import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";
import { setDiscountAction, setTipAction, takePaymentAction } from "@/app/b/[branch]/(till)/pay/actions";
import { Icon, type IconName } from "@/components/icons";
import { useBranchPath } from "@/components/tenancy/branch-context";
import { MOMO_NETWORKS, PAYMENT_METHODS, type MomoNetwork, type PaymentMethod } from "@/db/enums";
import { parseCedis, percentOf } from "@/lib/payments/bill";
import { METHOD_HINTS, METHOD_LABELS, NETWORK_LABELS } from "@/lib/payments/labels";
import type { PaymentView } from "@/lib/payments/service";
import { ORDER_TYPE_LABELS } from "@/lib/orders/shared";
import { formatAmount, formatCedis } from "@/lib/money";
import { BillPanel } from "./bill-panel";
import { DiscountDialog } from "./discount-dialog";

type Props = {
  view: PaymentView;
  cashierName: string;
  canApproveDiscounts: boolean;
  approvers: { id: string; name: string }[];
};

const METHOD_ICONS: Record<PaymentMethod, IconName> = {
  cash: "cash",
  card: "card",
  mobile_money: "phone",
  voucher: "voucher",
  house_account: "user",
};
const SPLITS = [
  { label: "Full", parts: 1 },
  { label: "½", parts: 2 },
  { label: "⅓", parts: 3 },
  { label: "¼", parts: 4 },
];
const TIPS = [0, 5, 10, 15];
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;

const field =
  "mt-1 h-12 w-full rounded-xl border border-ink-600 bg-ink-900 px-3 text-cream placeholder:text-cream-faint/70 focus:border-amber focus:outline-none";

/** "1,234.50" without the comma, for editable amount fields. */
const plain = (pesewas: number) => formatAmount(pesewas).replace(/,/g, "");

/** Cash received shortcuts: exact, then the next round amounts above the balance. */
function cashShortcuts(amount: number): number[] {
  const steps = [1000, 5000, 10000, 20000].map((step) => Math.ceil(amount / step) * step);
  return [...new Set([amount, ...steps])].filter((v) => v >= amount).slice(0, 4);
}

export function PayScreen({ view, cashierName, canApproveDiscounts, approvers }: Props) {
  const id = useId();
  const branchPath = useBranchPath();
  const { order, bill } = view;
  const paidInFull = order.status === "paid";
  const locked = view.payments.length > 0; // discount and tip are fixed once money is taken

  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amountText, setAmountText] = useState(plain(view.balance));
  const [tenderedText, setTenderedText] = useState("");
  const [activeField, setActiveField] = useState<"amount" | "tendered">("amount");
  const [network, setNetwork] = useState<MomoNetwork>("mtn");
  const [account, setAccount] = useState("");
  const [reference, setReference] = useState("");
  const [customTip, setCustomTip] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastChange, setLastChange] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const discountRef = useRef<HTMLDialogElement>(null);

  // When a tip or discount changes the balance, the amount to collect follows it.
  const [seenBalance, setSeenBalance] = useState(view.balance);
  if (seenBalance !== view.balance) {
    setSeenBalance(view.balance);
    setAmountText(plain(view.balance));
  }

  const amount = parseCedis(amountText);
  const tendered = tenderedText ? parseCedis(tenderedText) : amount;
  const change = method === "cash" && amount !== null && tendered !== null ? tendered - amount : 0;
  const closes = amount !== null && amount === view.balance;
  const taxedBase = bill.subtotal - bill.discount;

  const setActive = (text: string) => (activeField === "amount" ? setAmountText(text) : setTenderedText(text));
  const activeText = activeField === "amount" ? amountText : tenderedText;
  const press = (key: (typeof KEYS)[number]) => {
    if (key === "back") return setActive(activeText.slice(0, -1));
    const next = activeText + key;
    if (/^\d{0,7}(\.\d{0,2})?$/.test(next)) setActive(next);
  };

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      else {
        setError(null);
        onOk?.();
      }
    });

  const take = () => {
    if (amount === null || amount <= 0) return setError("Enter the amount to collect.");
    startTransition(async () => {
      const result = await takePaymentAction(order.id, {
        method,
        amount,
        tendered: method === "cash" ? tendered : null,
        network: method === "mobile_money" ? network : null,
        account: ["mobile_money", "voucher", "house_account"].includes(method) ? account : null,
        reference: reference || null,
      });
      if (!result.ok) return setError(result.error);
      setError(null);
      setLastChange(method === "cash" ? result.change : null);
      setAmountText(plain(result.balance));
      setTenderedText("");
      setAccount("");
      setReference("");
    });
  };

  const backHref = branchPath(paidInFull ? "/order" : `/order?open=${order.id}`);
  const where = [ORDER_TYPE_LABELS[order.type], order.tableLabel ? `Table ${order.tableLabel}` : null, order.customerName].filter(Boolean).join(" · ");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-ink-700 p-3 sm:p-4">
        <Link href={backHref} aria-label={paidInFull ? "Back to orders" : "Back to the order"} className="grid size-11 place-items-center rounded-xl border border-ink-600 hover:bg-ink-800">
          <Icon name="back" className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold">
            Payment · #{order.number}
          </h1>
          <p className="truncate text-sm text-cream-muted">{where}</p>
        </div>
        <p className="hidden text-sm text-cream-faint sm:block">Taking payment: {cashierName}</p>
      </header>

      <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-3 sm:p-4 lg:grid-cols-[minmax(18rem,22rem)_1fr] lg:content-stretch lg:overflow-hidden">
        {/* Phones stack at full height and scroll as one page; from lg the two columns scroll separately. */}
        <BillPanel view={view} className="order-last lg:order-first lg:h-full lg:min-h-0" />

        <div className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
          {paidInFull ? (
            <section role="status" className="grid flex-1 place-items-center rounded-2xl border border-eating/50 bg-eating-soft p-6 text-center">
              <div>
                <span className="mx-auto grid size-16 place-items-center rounded-full bg-eating-strong text-white">
                  <Icon name="check" className="size-8" strokeWidth={2.5} />
                </span>
                <h2 className="mt-4 font-display text-3xl font-bold">Paid in full</h2>
                <p className="mt-1 text-cream-muted">
                  Order #{order.number} · {formatCedis(bill.total)}
                </p>
                {lastChange ? (
                  <p className="mt-5 text-lg">
                    Change to give: <strong className="font-display text-4xl text-cream">{formatCedis(lastChange)}</strong>
                  </p>
                ) : null}
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Link href={branchPath(`/receipt/${order.id}?print=1`)} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-ink-600 bg-ink-850 px-5 font-semibold hover:bg-ink-800">
                    <Icon name="printer" className="size-5" />
                    Print receipt
                  </Link>
                  <Link href={branchPath("/order")} className="inline-flex min-h-12 items-center rounded-xl bg-amber px-6 font-semibold text-amber-ink hover:bg-[#f5b552]">
                    New order
                  </Link>
                </div>
              </div>
            </section>
          ) : (
            <>
              {lastChange ? (
                <p role="status" className="rounded-xl bg-eating-soft px-4 py-3 font-semibold">
                  Payment recorded. Change to give: {formatCedis(lastChange)}
                </p>
              ) : null}
              {view.unsentItems ? (
                <p className="rounded-xl bg-amber-soft px-4 py-3 text-sm text-amber">
                  {view.unsentItems} item{view.unsentItems === 1 ? "" : "s"} not sent to the kitchen yet will go when you take the first payment.
                </p>
              ) : null}

              {/* Discount and tip */}
              <section aria-label="Discount and tip" className="flex flex-wrap items-center gap-2 rounded-2xl border border-ink-700 bg-ink-850 p-3">
                <span className="text-sm text-cream-muted">Tip</span>
                <div role="radiogroup" aria-label="Tip" className="flex flex-wrap gap-1.5">
                  {TIPS.map((pct) => {
                    const tip = percentOf(taxedBase, pct);
                    const selected = bill.tip === tip && (pct > 0 || bill.tip === 0);
                    return (
                      <button
                        key={pct}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={locked || pending}
                        onClick={() => run(() => setTipAction(order.id, tip))}
                        className={`min-h-11 rounded-full border px-4 text-sm font-medium disabled:opacity-50 ${
                          selected ? "border-amber bg-amber-soft text-cream" : "border-ink-600 text-cream-muted enabled:hover:text-cream"
                        }`}
                      >
                        {pct === 0 ? "None" : `${pct}%`}
                      </button>
                    );
                  })}
                </div>
                <form
                  className="flex items-center gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const tip = parseCedis(customTip);
                    if (tip === null) return setError("Enter the tip as an amount, e.g. 20.00");
                    run(() => setTipAction(order.id, tip), () => setCustomTip(""));
                  }}
                >
                  <label htmlFor={`${id}-tip`} className="sr-only">
                    Custom tip in cedis
                  </label>
                  <input
                    id={`${id}-tip`}
                    inputMode="decimal"
                    placeholder="Custom"
                    value={customTip}
                    disabled={locked}
                    onChange={(e) => setCustomTip(e.target.value)}
                    className="h-11 w-24 rounded-xl border border-ink-600 bg-ink-900 px-3 text-cream placeholder:text-cream-faint/70 focus:border-amber focus:outline-none disabled:opacity-50"
                  />
                  <button type="submit" disabled={locked || pending || !customTip} className="min-h-11 rounded-xl border border-ink-600 px-3 text-sm font-semibold disabled:opacity-50">
                    Set
                  </button>
                </form>
                <span className="ml-auto flex gap-2">
                  {bill.discount ? (
                    <button
                      type="button"
                      disabled={locked || pending}
                      onClick={() => run(() => setDiscountAction(order.id, { kind: "amount", value: 0, reason: "" }, null))}
                      className="min-h-11 rounded-xl border border-ink-600 px-3 text-sm font-semibold disabled:opacity-50"
                    >
                      Remove discount
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={locked || pending}
                    onClick={() => discountRef.current?.showModal()}
                    className="min-h-11 rounded-xl border border-ink-600 px-3 text-sm font-semibold enabled:hover:bg-ink-800 disabled:opacity-50"
                  >
                    {bill.discount ? "Change discount" : "Add discount"}
                  </button>
                </span>
                {locked ? <p className="w-full text-xs text-cream-faint">Tip and discount are fixed once a payment has been taken.</p> : null}
              </section>

              {/* Method */}
              <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={method === m}
                    onClick={() => {
                      setMethod(m);
                      setError(null);
                    }}
                    className={`flex min-h-20 flex-col items-start gap-1 rounded-xl border p-3 text-left ${
                      method === m ? "border-amber bg-amber-soft" : "border-ink-700 bg-ink-850 hover:bg-ink-800"
                    }`}
                  >
                    <Icon name={METHOD_ICONS[m]} className="size-5" />
                    <span className="font-semibold leading-tight">{METHOD_LABELS[m]}</span>
                    <span className="text-xs text-cream-faint">{METHOD_HINTS[m]}</span>
                  </button>
                ))}
              </div>

              {/* Amount and method details */}
              <section aria-label="Amount" className="grid gap-4 rounded-2xl border border-ink-700 bg-ink-850 p-4 md:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor={`${id}-amount`} className="text-sm text-cream-muted">
                      Amount to collect
                    </label>
                    <div className="flex gap-1.5" role="group" aria-label="Split the bill">
                      {SPLITS.map((s) => (
                        <button
                          key={s.label}
                          type="button"
                          onClick={() => {
                            setAmountText(plain(Math.min(view.balance, Math.ceil(bill.total / s.parts))));
                            setActiveField("amount");
                          }}
                          aria-label={s.parts === 1 ? "Full balance" : `Split ${s.parts} ways`}
                          className="min-h-11 min-w-11 rounded-full border border-ink-600 px-3 text-sm hover:border-amber"
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={`mt-1 flex h-16 items-center rounded-xl border-2 bg-ink-900 px-3 ${activeField === "amount" ? "border-amber" : "border-ink-600"}`}>
                    <span className="font-display text-2xl font-bold text-cream-muted">GH₵</span>
                    <input
                      id={`${id}-amount`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={amountText}
                      onFocus={() => setActiveField("amount")}
                      onChange={(e) => /^\d{0,7}(\.\d{0,2})?$/.test(e.target.value) && setAmountText(e.target.value)}
                      className="h-full min-w-0 flex-1 bg-transparent pl-2 font-display text-3xl font-bold tabular-nums focus:outline-none"
                    />
                  </div>

                  {method === "cash" ? (
                    <div className="mt-3">
                      <label htmlFor={`${id}-tendered`} className="text-sm text-cream-muted">
                        Cash received
                      </label>
                      <input
                        id={`${id}-tendered`}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder={amountText ? `${amountText} (exact)` : ""}
                        value={tenderedText}
                        onFocus={() => setActiveField("tendered")}
                        onChange={(e) => /^\d{0,7}(\.\d{0,2})?$/.test(e.target.value) && setTenderedText(e.target.value)}
                        className={`${field} ${activeField === "tendered" ? "border-amber" : ""}`}
                      />
                      {amount ? (
                        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Cash received shortcuts">
                          {cashShortcuts(amount).map((v, i) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setTenderedText(plain(v))}
                              className="min-h-11 rounded-full border border-ink-600 px-3.5 text-sm hover:border-amber"
                            >
                              {i === 0 ? "Exact" : formatCedis(v)}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <p className="mt-2 text-lg" aria-live="polite">
                        {change > 0 ? (
                          <>
                            Change: <strong className="font-display tabular-nums">{formatCedis(change)}</strong>
                          </>
                        ) : change < 0 ? (
                          <span className="text-alert">Not enough cash received.</span>
                        ) : null}
                      </p>
                    </div>
                  ) : null}

                  {method === "mobile_money" ? (
                    <div className="mt-3 space-y-3">
                      <div role="radiogroup" aria-label="Network" className="grid grid-cols-3 rounded-xl bg-ink-950 p-1">
                        {MOMO_NETWORKS.map((n) => (
                          <button
                            key={n}
                            type="button"
                            role="radio"
                            aria-checked={network === n}
                            onClick={() => setNetwork(n)}
                            className={`min-h-11 rounded-lg text-sm font-medium ${network === n ? "bg-ink-700 text-cream" : "text-cream-muted"}`}
                          >
                            {NETWORK_LABELS[n]}
                          </button>
                        ))}
                      </div>
                      <div>
                        <label htmlFor={`${id}-account`} className="text-sm text-cream-muted">
                          Customer&rsquo;s number
                        </label>
                        <input id={`${id}-account`} type="tel" inputMode="tel" autoComplete="off" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="e.g. 024 000 5821" className={field} />
                      </div>
                      <div>
                        <label htmlFor={`${id}-ref`} className="text-sm text-cream-muted">
                          Transaction reference (optional)
                        </label>
                        <input id={`${id}-ref`} autoComplete="off" value={reference} onChange={(e) => setReference(e.target.value)} className={field} />
                      </div>
                      <p className="text-sm text-amber">Record the payment once the customer has approved it and you&rsquo;ve seen the confirmation.</p>
                    </div>
                  ) : null}

                  {method === "card" ? (
                    <div className="mt-3">
                      <label htmlFor={`${id}-ref`} className="text-sm text-cream-muted">
                        Approval code or last 4 digits (optional)
                      </label>
                      <input id={`${id}-ref`} autoComplete="off" value={reference} onChange={(e) => setReference(e.target.value)} className={field} />
                    </div>
                  ) : null}

                  {method === "voucher" || method === "house_account" ? (
                    <div className="mt-3">
                      <label htmlFor={`${id}-account`} className="text-sm text-cream-muted">
                        {method === "voucher" ? "Voucher code" : "House account name"}
                      </label>
                      <input id={`${id}-account`} autoComplete="off" value={account} onChange={(e) => setAccount(e.target.value)} className={field} />
                    </div>
                  ) : null}
                </div>

                {/* Number pad for touch screens; typing works too. */}
                <div className="grid w-full grid-cols-3 content-start gap-2 md:w-60" role="group" aria-label={`Number pad (${activeField === "amount" ? "amount to collect" : "cash received"})`}>
                  {KEYS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => press(k)}
                      aria-label={k === "back" ? "Back, delete last digit" : undefined}
                      className="h-14 rounded-xl border border-ink-700 bg-ink-800 font-display text-xl font-bold hover:bg-ink-700 active:scale-95"
                    >
                      {k === "back" ? <span className="text-base font-medium text-cream-muted">Back</span> : k}
                    </button>
                  ))}
                </div>
              </section>

              <p role="alert" className="min-h-5 text-sm text-alert">
                {error}
              </p>
              <button
                type="button"
                onClick={take}
                disabled={pending || amount === null || amount <= 0 || change < 0}
                className="min-h-14 rounded-xl bg-amber text-lg font-semibold text-amber-ink enabled:hover:bg-[#f5b552] enabled:active:scale-[0.99] disabled:opacity-50"
              >
                {pending ? "Recording…" : amount ? `Take ${formatCedis(amount)}${closes ? " and close" : ""}` : "Take payment"}
              </button>
              <p className="text-center text-xs text-cream-faint">
                ENYO POS records payments taken through your existing mobile money or card provider. It is not a payment processor and is not affiliated with MTN, Telecel or AT.
              </p>
            </>
          )}
        </div>
      </div>

      <DiscountDialog
        ref={discountRef}
        orderId={order.id}
        subtotal={bill.subtotal}
        canApprove={canApproveDiscounts}
        approvers={approvers}
        onClose={() => discountRef.current?.close()}
      />
    </div>
  );
}
