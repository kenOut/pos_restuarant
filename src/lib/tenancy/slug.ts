// Branch addresses (subdomains): pure, so the browser can use them too.

/** Subdomains the app uses itself, so no branch can have them. */
export const RESERVED_SLUGS = new Set(["www", "hq", "admin", "api", "app", "b", "static", "assets", "mail", "setup", "login"]);
/** 2–32 characters: lower-case letters, numbers and dashes, not starting or ending with a dash. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;

export const isValidSlug = (slug: string) => SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug);

/** "Chez Accra – Osu!" → "chez-accra-osu" */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
}
