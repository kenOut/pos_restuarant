// A restaurant's tax setup (Settings → Taxes and receipts). Plain data with no
// server-only imports, so the till screens can total tickets with it.

export type TaxId = "vat" | "nhil" | "getfund";

export type TaxSetting = {
  id: TaxId;
  name: string;
  /** Basis points: 15% = 1500. */
  rateBp: number;
  /** Charge this tax at all. */
  charge: boolean;
  /** Its own line on the receipt; otherwise it's folded into the combined line. */
  ownLine: boolean;
};

export type TaxConfig = {
  /** Off: no VAT, NHIL or GETFund is charged. */
  vatRegistered: boolean;
  taxes: TaxSetting[];
  /** Name of the single line that taxes not on their own line are shown as. */
  combinedLabel: string;
  /** On: the menu price is what the guest pays and the taxes are worked out inside it. */
  pricesIncludeTax: boolean;
};

/** Ghana's standard rates from 1 January 2026, each on its own line. */
export const DEFAULT_TAX_CONFIG: TaxConfig = {
  vatRegistered: true,
  taxes: [
    { id: "vat", name: "VAT", rateBp: 1500, charge: true, ownLine: true },
    { id: "nhil", name: "NHIL", rateBp: 250, charge: true, ownLine: true },
    { id: "getfund", name: "GETFund Levy", rateBp: 250, charge: true, ownLine: true },
  ],
  combinedLabel: "Levies",
  pricesIncludeTax: false,
};

/** 1500 → "15%", 250 → "2.5%". */
export function formatRate(bp: number): string {
  return `${Number((bp / 100).toFixed(2))}%`;
}

/** Taxes actually charged under this setup, with their receipt labels. */
export function chargedTaxes(config: TaxConfig) {
  if (!config.vatRegistered) return [];
  return config.taxes
    .filter((t) => t.charge && t.rateBp > 0)
    .map((t) => ({ id: t.id, label: `${t.name} (${formatRate(t.rateBp)})`, rateBp: t.rateBp, displayAs: t.ownLine ? null : config.combinedLabel }));
}
