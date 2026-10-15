"use client";

import { useId, useRef, useState, useTransition } from "react";
import {
  removeLogoAction,
  updateBusinessAction,
  updateDiscountApprovalAction,
  updateTaxesAction,
  uploadLogoAction,
} from "@/app/(till)/settings/actions";
import { Button, Field, FormError, PageHeader, inputClass } from "@/components/admin/ui";
import { RestaurantMark } from "@/components/brand/restaurant-mark";
import { menuItem } from "@/data/demo-menu";
import { computeBill, taxLinesForDisplay } from "@/lib/payments/bill";
import type { RestaurantSettings } from "@/lib/settings/service";
import type { TaxConfig } from "@/lib/tax-config";
import { formatAmount, formatCedis } from "@/lib/money";

type Props = { settings: RestaurantSettings; logoUrl: string | null; canEditTaxes: boolean };
type Status = { section: string; ok: boolean; message: string } | null;

// Preview the deck's receipt: 2× Jollof rice and 1× Sobolo.
const PREVIEW_LINES = [
  { name: "Jollof rice", quantity: 2, unitPrice: menuItem("jollof-chicken").price },
  { name: "Sobolo", quantity: 1, unitPrice: menuItem("sobolo").price },
];

/** On/off setting. The whole row is the tap target. */
function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start justify-between gap-4 rounded-xl py-1">
      <span>
        <span className="font-medium">{label}</span>
        {description ? <span className="block text-sm text-cream-muted">{description}</span> : null}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-6 shrink-0 cursor-pointer accent-amber" />
    </label>
  );
}

export function SettingsForm({ settings, logoUrl, canEditTaxes }: Props) {
  const id = useId();
  const [name, setName] = useState(settings.name);
  const [footer, setFooter] = useState(settings.receiptFooter);
  const [taxes, setTaxes] = useState<TaxConfig>(settings.taxConfig);
  // Rates as typed (so "12." can become "12.5"); the stored rate updates once it's a valid number.
  const [rateText, setRateText] = useState<Record<string, string>>(() =>
    Object.fromEntries(settings.taxConfig.taxes.map((t) => [t.id, String(t.rateBp / 100)]))
  );
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const run = (section: string, action: () => Promise<{ ok: boolean; error?: string }>, message: string) =>
    startTransition(async () => {
      const result = await action();
      setStatus(result.ok ? { section, ok: true, message } : { section, ok: false, message: result.error ?? "Something went wrong." });
    });
  const statusFor = (section: string) =>
    status?.section === section ? (
      <p role={status.ok ? "status" : "alert"} className={`text-sm ${status.ok ? "text-eating" : "text-alert"}`}>
        {status.message}
      </p>
    ) : (
      <FormError error={null} />
    );

  const preview = computeBill(PREVIEW_LINES, {}, taxes);
  const setTax = (taxId: string, change: Partial<TaxConfig["taxes"][number]>) =>
    setTaxes({ ...taxes, taxes: taxes.taxes.map((t) => (t.id === taxId ? { ...t, ...change } : t)) });
  const section = "rounded-2xl border border-ink-700 bg-ink-850 p-4 sm:p-5";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Settings" description="For this restaurant. Changes apply to new orders; paid orders keep what they were charged." />
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="mx-auto grid max-w-5xl gap-4">
          {/* Business details */}
          <section aria-labelledby={`${id}-business`} className={section}>
            <h2 id={`${id}-business`} className="font-display text-xl font-bold">
              Business details
            </h2>
            <form
              className="mt-3 grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                run("business", () => updateBusinessAction({ name, receiptFooter: footer }), "Saved.");
              }}
            >
              <Field id={`${id}-name`} label="Restaurant name">
                <input id={`${id}-name`} required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              </Field>
              <Field id={`${id}-footer`} label="Receipt footer">
                <input id={`${id}-footer`} maxLength={120} value={footer} onChange={(e) => setFooter(e.target.value)} className={inputClass} />
              </Field>
              <div className="flex items-center gap-3 sm:col-span-2">
                <Button type="submit" variant="primary" disabled={pending}>
                  Save details
                </Button>
                {statusFor("business")}
              </div>
            </form>

            <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-ink-700 pt-4">
              <RestaurantMark className="size-16" logoUrl={logoUrl} />
              <div className="min-w-48 flex-1">
                <p className="font-medium">Logo</p>
                <p className="text-sm text-cream-muted">PNG, JPEG or WebP, up to 512 KB. Square works best. Shown on the till, sign-in screen and receipts.</p>
              </div>
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  run("logo", () => uploadLogoAction(data), "Logo updated.");
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                <label htmlFor={`${id}-logo`} className="sr-only">
                  Logo file
                </label>
                <input
                  id={`${id}-logo`}
                  ref={fileRef}
                  name="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  required
                  className="min-h-11 max-w-60 text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-ink-600 file:bg-ink-800 file:px-3 file:text-cream"
                />
                <Button type="submit" disabled={pending}>
                  Upload
                </Button>
                {logoUrl ? (
                  <Button variant="danger" disabled={pending} onClick={() => run("logo", removeLogoAction, "Logo removed.")}>
                    Remove
                  </Button>
                ) : null}
              </form>
              <div className="w-full">{statusFor("logo")}</div>
            </div>
          </section>

          {/* Taxes and receipts */}
          <section aria-labelledby={`${id}-taxes`} className={`${section} grid gap-5 lg:grid-cols-[1fr_18rem]`}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run("taxes", () => updateTaxesAction(taxes), "Taxes saved. New orders use them; paid orders keep theirs.");
              }}
            >
              <h2 id={`${id}-taxes`} className="font-display text-xl font-bold">
                Taxes and receipts
              </h2>
              {!canEditTaxes ? <p className="mt-1 text-sm text-amber">Only an owner can change taxes.</p> : null}
              <fieldset disabled={!canEditTaxes} className="mt-3 space-y-4 disabled:opacity-80">
                <Switch
                  checked={taxes.vatRegistered}
                  onChange={(v) => setTaxes({ ...taxes, vatRegistered: v })}
                  label="This business is VAT registered"
                  description="Off: no VAT, NHIL or GETFund is charged."
                />
                <Switch
                  checked={taxes.pricesIncludeTax}
                  onChange={(v) => setTaxes({ ...taxes, pricesIncludeTax: v })}
                  label="Menu prices already include taxes"
                  description="On: the menu price is what the guest pays; taxes are worked out inside it."
                />
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Taxes and levies</caption>
                  <thead className="text-cream-muted">
                    <tr>
                      <th scope="col" className="py-2 font-normal">
                        Tax or levy
                      </th>
                      <th scope="col" className="py-2 font-normal">
                        Rate (%)
                      </th>
                      <th scope="col" className="py-2 text-center font-normal">
                        Charge
                      </th>
                      <th scope="col" className="py-2 text-center font-normal">
                        Own line on receipt
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxes.taxes.map((t) => (
                      <tr key={t.id} className="border-t border-ink-700">
                        <th scope="row" className="py-2 pr-2 font-medium">
                          {t.name}
                        </th>
                        <td className="py-2 pr-2">
                          <label className="sr-only" htmlFor={`${id}-${t.id}-rate`}>
                            {t.name} rate in percent
                          </label>
                          <input
                            id={`${id}-${t.id}-rate`}
                            inputMode="decimal"
                            value={rateText[t.id] ?? ""}
                            onChange={(e) => {
                              const text = e.target.value;
                              if (!/^\d{0,2}(\.\d{0,2})?$/.test(text)) return;
                              setRateText({ ...rateText, [t.id]: text });
                              setTax(t.id, { rateBp: Math.round(Number(text || "0") * 100) });
                            }}
                            className={`${inputClass} mt-0 h-11 w-24`}
                          />
                        </td>
                        <td className="py-2 text-center">
                          <label className="inline-grid size-11 cursor-pointer place-items-center">
                            <input aria-label={`Charge ${t.name}`} type="checkbox" checked={t.charge} onChange={(e) => setTax(t.id, { charge: e.target.checked })} className="size-6 accent-amber" />
                          </label>
                        </td>
                        <td className="py-2 text-center">
                          <label className="inline-grid size-11 cursor-pointer place-items-center">
                            <input aria-label={`${t.name} on its own receipt line`} type="checkbox" checked={t.ownLine} onChange={(e) => setTax(t.id, { ownLine: e.target.checked })} className="size-6 accent-amber" />
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Field id={`${id}-combined`} label="Taxes not on their own line are shown together as" hint="So the receipt always adds up.">
                  <input id={`${id}-combined`} maxLength={30} value={taxes.combinedLabel} onChange={(e) => setTaxes({ ...taxes, combinedLabel: e.target.value })} className={inputClass} />
                </Field>
              </fieldset>
              {canEditTaxes ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button type="submit" variant="primary" disabled={pending}>
                    Save taxes
                  </Button>
                  {statusFor("taxes")}
                </div>
              ) : null}
              <p className="mt-3 text-xs text-cream-faint">
                Confirm your obligations with the Ghana Revenue Authority. ENYO POS is not certified with GRA&rsquo;s E-VAT or fiscal device systems.
              </p>
            </form>

            {/* Live receipt preview */}
            <figure>
              <figcaption className="text-sm text-cream-muted">Receipt preview</figcaption>
              <div className="mt-2 rounded-sm bg-white px-4 py-4 font-mono text-[12px] leading-snug text-black">
                <p className="text-center font-bold">{name || "Restaurant"}</p>
                <div className="my-2 border-t border-dashed border-black/50" />
                {PREVIEW_LINES.map((l) => (
                  <p key={l.name} className="flex justify-between">
                    <span>
                      {l.quantity}× {l.name}
                    </span>
                    <span>{formatAmount(l.unitPrice * l.quantity)}</span>
                  </p>
                ))}
                <div className="my-2 border-t border-dashed border-black/50" />
                <p className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatAmount(preview.subtotal)}</span>
                </p>
                {preview.pricesIncludeTax ? <p className="mt-1">Includes:</p> : null}
                {taxLinesForDisplay(preview.taxes).map((t) => (
                  <p key={t.label} className={`flex justify-between ${preview.pricesIncludeTax ? "pl-3" : ""}`}>
                    <span>{t.label}</span>
                    <span>{formatAmount(t.amount)}</span>
                  </p>
                ))}
                <p className="mt-1 flex justify-between font-bold">
                  <span>TOTAL</span>
                  <span>{formatCedis(preview.total)}</span>
                </p>
                <div className="my-2 border-t border-dashed border-black/50" />
                <p className="text-center">{footer}</p>
              </div>
            </figure>
          </section>

          {/* Discounts */}
          <section aria-labelledby={`${id}-discounts`} className={section}>
            <h2 id={`${id}-discounts`} className="font-display text-xl font-bold">
              Discounts
            </h2>
            <div className="mt-3">
              <Switch
                checked={settings.discountNeedsApproval}
                disabled={pending}
                onChange={(v) => run("discounts", () => updateDiscountApprovalAction(v), v ? "Discounts now need a manager." : "Cashiers and servers can now give discounts without a manager.")}
                label="Discounts need a manager"
                description="On: a cashier or server needs an owner or manager to enter their PIN to give a discount."
              />
              {statusFor("discounts")}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
