import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { restaurants, type StaffRole } from "@/db/schema";
import { DEFAULT_TAX_CONFIG, type TaxConfig, type TaxId } from "@/lib/tax-config";

export const NAME_MAX = 60;
export const FOOTER_MAX = 120;
export const COMBINED_LABEL_MAX = 30;
/** Highest rate accepted for any one tax (50%), to catch typing mistakes. */
export const MAX_RATE_BP = 5000;
/** Kept under the 1 MB request limit of Next.js server actions. */
export const LOGO_MAX_BYTES = 512 * 1024;

export type RestaurantSettings = {
  id: string;
  name: string;
  logoFile: string | null;
  receiptFooter: string;
  discountNeedsApproval: boolean;
  taxConfig: TaxConfig;
};

type Actor = { restaurantId: string; role: StaffRole };
type Result = { ok: true } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");

export const canEditSettings = (role: StaffRole) => role === "owner" || role === "manager";
/** Taxes change what guests are charged, so only owners can change them. */
export const canEditTaxes = (role: StaffRole) => role === "owner";

/** Stored tax setup merged onto the defaults, so a new tax in a later version still appears. */
function withDefaults(stored: TaxConfig | null): TaxConfig {
  if (!stored) return DEFAULT_TAX_CONFIG;
  return {
    ...DEFAULT_TAX_CONFIG,
    ...stored,
    taxes: DEFAULT_TAX_CONFIG.taxes.map((d) => ({ ...d, ...stored.taxes?.find((t) => t.id === d.id), id: d.id, name: d.name })),
  };
}

export function getSettings(db: Db, restaurantId: string): RestaurantSettings | null {
  const row = db.select().from(restaurants).where(eq(restaurants.id, restaurantId)).get();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    logoFile: row.logoFile,
    receiptFooter: row.receiptFooter,
    discountNeedsApproval: row.discountNeedsApproval,
    taxConfig: withDefaults(row.taxConfig),
  };
}

export function getTaxConfig(db: Db, restaurantId: string): TaxConfig {
  return getSettings(db, restaurantId)?.taxConfig ?? DEFAULT_TAX_CONFIG;
}

export function updateBusiness(db: Db, actor: Actor, input: { name: string; receiptFooter: string }): Result {
  if (!canEditSettings(actor.role)) return fail("Only owners and managers can change settings.");
  const name = clean(input?.name, NAME_MAX);
  if (!name) return fail("Enter the restaurant's name.");
  const receiptFooter = clean(input?.receiptFooter, FOOTER_MAX);
  db.update(restaurants).set({ name, receiptFooter }).where(eq(restaurants.id, actor.restaurantId)).run();
  return { ok: true };
}

export function updateDiscountApproval(db: Db, actor: Actor, needsApproval: boolean): Result {
  if (!canEditSettings(actor.role)) return fail("Only owners and managers can change settings.");
  db.update(restaurants).set({ discountNeedsApproval: needsApproval === true }).where(eq(restaurants.id, actor.restaurantId)).run();
  return { ok: true };
}

export function updateTaxes(db: Db, actor: Actor, input: TaxConfig): Result {
  if (!canEditTaxes(actor.role)) return fail("Only an owner can change taxes.");
  if (!input || !Array.isArray(input.taxes)) return fail("Something went wrong. Try again.");

  const taxes = [];
  for (const d of DEFAULT_TAX_CONFIG.taxes) {
    const t = input.taxes.find((x) => x?.id === d.id);
    const rateBp = Number(t?.rateBp);
    if (!t || !Number.isInteger(rateBp) || rateBp < 0 || rateBp > MAX_RATE_BP) return fail(`Enter a rate between 0% and 50% for ${d.name}.`);
    taxes.push({ id: d.id as TaxId, name: d.name, rateBp, charge: t.charge === true, ownLine: t.ownLine === true });
  }
  const combinedLabel = clean(input.combinedLabel, COMBINED_LABEL_MAX) || "Levies";

  const config: TaxConfig = { vatRegistered: input.vatRegistered === true, taxes, combinedLabel, pricesIncludeTax: input.pricesIncludeTax === true };
  db.update(restaurants).set({ taxConfig: config }).where(eq(restaurants.id, actor.restaurantId)).run();
  return { ok: true };
}

// ---------- Logo ----------

const LOGO_FILE = /^[a-z0-9-]+\.(png|jpg|webp)$/;

/** PNG, JPEG or WebP, recognised by their first bytes (the browser's file type isn't trusted). */
function imageExtension(bytes: Uint8Array): "png" | "jpg" | "webp" | null {
  const starts = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (starts([0xff, 0xd8, 0xff])) return "jpg";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  return null;
}

export function isLogoFileName(name: string): boolean {
  return LOGO_FILE.test(name);
}

/** Saves a new logo in uploadsDir and points the restaurant at it, removing the old one. */
export function setLogo(db: Db, actor: Actor, uploadsDir: string, bytes: Uint8Array): Result {
  if (!canEditSettings(actor.role)) return fail("Only owners and managers can change settings.");
  if (bytes.byteLength === 0) return fail("Choose an image file.");
  if (bytes.byteLength > LOGO_MAX_BYTES) return fail("The logo must be 512 KB or smaller.");
  const ext = imageExtension(bytes);
  if (!ext) return fail("The logo must be a PNG, JPEG or WebP image.");

  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const fileName = `logo-${hash}.${ext}`;
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, fileName), bytes);

  const previous = getSettings(db, actor.restaurantId)?.logoFile;
  db.update(restaurants).set({ logoFile: fileName }).where(eq(restaurants.id, actor.restaurantId)).run();
  if (previous && previous !== fileName && isLogoFileName(previous)) fs.rmSync(path.join(uploadsDir, previous), { force: true });
  return { ok: true };
}

export function removeLogo(db: Db, actor: Actor, uploadsDir: string): Result {
  if (!canEditSettings(actor.role)) return fail("Only owners and managers can change settings.");
  const previous = getSettings(db, actor.restaurantId)?.logoFile;
  db.update(restaurants).set({ logoFile: null }).where(eq(restaurants.id, actor.restaurantId)).run();
  if (previous && isLogoFileName(previous)) fs.rmSync(path.join(uploadsDir, previous), { force: true });
  return { ok: true };
}

/** Public address of a logo file. */
export const logoUrl = (logoFile: string | null) => (logoFile ? `/api/logo/${logoFile}` : null);
