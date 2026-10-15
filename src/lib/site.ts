export const site = {
  product: "ENYO POS",
  company: "TWICETEK SOLUTIONS LTD",
  /**
   * Where "Book a demonstration" sends people. Set NEXT_PUBLIC_DEMO_EMAIL
   * (e.g. in .env.local); until then the demo button is shown as unavailable.
   */
  demoEmail: process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "",
};

export function demoMailto(): string | null {
  if (!site.demoEmail) return null;
  const subject = encodeURIComponent(`${site.product} demonstration`);
  return `mailto:${site.demoEmail}?subject=${subject}`;
}
