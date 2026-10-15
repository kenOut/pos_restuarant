// Accessibility checks. Run through `npm run test:e2e` (node e2e/run.mjs), which passes <baseUrl> <outDir>.
// axe-core against WCAG 2.2 AA on every screen and state, plus a 44 × 44 px
// minimum touch target for every control on the till screens.
const { launch } = require("./lib.cjs");
const [BASE] = process.argv.slice(2);
const AXE = require.resolve("axe-core/axe.min.js");
const MIN_TARGET = 44;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? `\n        ${detail}` : ""}`);
  if (!ok) failures++;
};

async function audit(page, name, { targets = true } = {}) {
  await page.addScriptTag({ path: AXE });
  const violations = await page.evaluate(async () => {
    // The landing page's device mockups are pictures (role="img" with a description);
    // WCAG 1.4.3 exempts text that is part of a picture, so they're left out.
    const result = await window.axe.run({ exclude: [[".mock"]] }, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    });
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 4).map((n) => `${n.target.join(" ")} :: ${(n.failureSummary || "").split("\n").slice(1, 2).join(" ").trim()}`),
      count: v.nodes.length,
    }));
  });
  check(
    `${name}: no WCAG 2.2 AA violations`,
    violations.length === 0,
    violations.map((v) => `[${v.impact}] ${v.id} (${v.count}): ${v.help}\n          ${v.nodes.join("\n          ")}`).join("\n        ")
  );

  if (!targets) return;
  const small = await page.evaluate((min) => {
    const controls = document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=radio], [role=tab]");
    return [...controls]
      .filter((el) => {
        if (el.closest("[inert], dialog:not([open])")) return false;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        if (!r.width || !r.height || s.visibility === "hidden" || el.closest(".sr-only")) return false;
        const small = (rect) => rect.width < min - 0.5 || rect.height < min - 0.5;
        if (!small(r)) return false;
        // A checkbox or radio inside (or pointed at by) a big enough label is fine: the label is the target.
        const label = el.closest("label") ?? (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null);
        return !(label && !small(label.getBoundingClientRect()));
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        const label = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 28);
        return `"${label}" ${Math.round(r.width)}×${Math.round(r.height)}`;
      });
  }, MIN_TARGET);
  check(`${name}: controls at least ${MIN_TARGET}×${MIN_TARGET} px`, small.length === 0, small.slice(0, 12).join(", ") + (small.length > 12 ? ` … +${small.length - 12} more` : ""));
}

async function device(browser, viewport) {
  const page = await (await browser.createBrowserContext()).newPage();
  await page.setViewport(viewport);
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  page.on("dialog", (d) => d.accept());
  return page;
}
async function signIn(page, name, pin, landing) {
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.evaluate((n) => [...document.querySelectorAll("button[aria-pressed]")].find((b) => b.textContent.includes(n)).click(), name);
  await sleep(150);
  await page.keyboard.type(pin);
  await page.waitForFunction((l) => location.pathname === l, { timeout: 10000 }, landing);
  await sleep(700);
}
const click = (page, text, root = "body") =>
  page.evaluate(
    (t, r) => {
      const b = [...document.querySelector(r).querySelectorAll("button, a")].find((x) => x.getClientRects().length > 0 && x.textContent.trim().startsWith(t) && !x.disabled);
      if (!b) throw new Error(`no button "${t}"`);
      b.click();
    },
    text,
    root
  );
const tapDish = (page, name) =>
  page.evaluate((n) => [...document.querySelectorAll("section ul.grid button")].find((x) => x.querySelector("span")?.textContent === n).click(), name);

(async () => {
  const browser = await launch();
  const desktop = { width: 1366, height: 900 };
  const phoneSize = { width: 390, height: 844, isMobile: true, hasTouch: true };

  // Website (no touch-target rule: it's not the till)
  const site = await device(browser, { width: 1440, height: 900 });
  await site.goto(BASE, { waitUntil: "load" });
  await sleep(1000);
  await audit(site, "Landing page", { targets: false });

  // Sign-in
  const login = await device(browser, desktop);
  await login.goto(`${BASE}/login`, { waitUntil: "load" });
  await login.evaluate(() => document.querySelector("button[aria-pressed]").click());
  await sleep(200);
  await audit(login, "Sign-in");

  // Order screen with a ticket and a note being written
  const till = await device(browser, desktop);
  await signIn(till, "Efua M.", "4444", "/order");
  await tapDish(till, "Jollof rice with chicken");
  await tapDish(till, "Sobolo");
  await click(till, "Note", "aside");
  await sleep(200);
  await audit(till, "Order screen");

  // Send it so the kitchen has something; then the open-orders dialog
  await click(till, "Done", "aside");
  await click(till, "Send to kitchen", "aside");
  await sleep(1500);
  await tapDish(till, "Kelewele");
  await click(till, "Send to kitchen", "aside");
  await sleep(1500);
  await click(till, "Open orders");
  await sleep(300);
  await audit(till, "Open orders dialog");

  // Kitchen board with tickets and a ready chip
  const kitchen = await device(browser, desktop);
  await signIn(kitchen, "Yaw D.", "6666", "/kitchen");
  await click(kitchen, "Start", "[data-ticket]");
  await sleep(800);
  await kitchen.click("[data-ticket] button[aria-label^='Bump']");
  await sleep(1200);
  await audit(kitchen, "Kitchen display");

  // Pay screen (cashier: discount needs approval), its discount dialog, a part payment, and the receipt
  await till.keyboard.press("Escape");
  await tapDish(till, "Beef suya");
  await click(till, "Pay", "aside");
  await till.waitForFunction(() => location.pathname.startsWith("/pay/"), { timeout: 10000 });
  await sleep(700);
  await audit(till, "Pay screen");
  await click(till, "Mobile money", "[aria-label='Payment method']");
  await sleep(200);
  await audit(till, "Pay screen, mobile money");
  await click(till, "Add discount");
  await sleep(300);
  await audit(till, "Discount dialog");
  await till.keyboard.press("Escape");
  await click(till, "Card", "[aria-label='Payment method']");
  await click(till, "Take GH₵");
  await till.waitForFunction(() => document.body.innerText.includes("Paid in full"), { timeout: 10000 });
  await audit(till, "Paid in full");
  await click(till, "Print receipt");
  await till.waitForFunction(() => location.pathname.startsWith("/receipt/"), { timeout: 10000 });
  await sleep(500);
  await audit(till, "Receipt");

  // Management screens (Phase 8)
  const manager = await device(browser, desktop);
  await signIn(manager, "Kwame B.", "2222", "/order");
  await click(manager, "Mark sold out");
  await sleep(200);
  await audit(manager, "Order screen, sold-out mode");
  await manager.goto(`${BASE}/menu`, { waitUntil: "load" });
  await sleep(500);
  await audit(manager, "Menu");
  await click(manager, "+ Add dish");
  await sleep(300);
  await audit(manager, "Add dish dialog");
  await manager.goto(`${BASE}/staff`, { waitUntil: "load" });
  await sleep(500);
  await audit(manager, "Staff");
  await click(manager, "+ Add staff");
  await sleep(300);
  await audit(manager, "Add staff dialog");
  await manager.goto(`${BASE}/settings`, { waitUntil: "load" });
  await sleep(500);
  await audit(manager, "Settings (manager, taxes read-only)");
  const owner = await device(browser, desktop);
  await signIn(owner, "Ama Owner", "1111", "/order");
  await owner.goto(`${BASE}/settings`, { waitUntil: "load" });
  await sleep(500);
  await audit(owner, "Settings (owner)");

  // Phone: ticket open full screen, then the More sheet
  const phone = await device(browser, phoneSize);
  await signIn(phone, "Kofi A.", "3333", "/order");
  await audit(phone, "Phone order screen");
  await tapDish(phone, "Kelewele");
  await click(phone, "View order");
  await sleep(300);
  await audit(phone, "Phone ticket");
  await phone.click("aside button[aria-label='Back to the menu']");
  await sleep(200);
  await click(phone, "More");
  await sleep(300);
  await audit(phone, "Phone More sheet");

  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
