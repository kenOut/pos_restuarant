// Phase 8 menu, staff and settings checks. Run through `npm run test:e2e` (node e2e/run.mjs), which passes <baseUrl> <outDir>.
const fs = require("fs");
const path = require("path");
const { launch } = require("./lib.cjs");
const [BASE, OUT] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

async function device(browser, viewport = { width: 1366, height: 900 }) {
  const page = await (await browser.createBrowserContext()).newPage();
  page.problems = [];
  // Name the address for failed requests (the console message alone doesn't say which).
  page.on("console", (m) => ["error", "warn", "warning"].includes(m.type()) && !m.text().startsWith("Failed to load resource") && page.problems.push(m.text()));
  page.on("response", (r) => r.status() >= 400 && page.problems.push(`${r.status()} ${r.url().replace(BASE, "")}`));
  page.on("pageerror", (e) => page.problems.push(e.message));
  page.on("dialog", (d) => d.accept()); // window.confirm
  await page.setViewport(viewport);
  return page;
}
async function signIn(page, name, pin) {
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.evaluate((n) => [...document.querySelectorAll("button[aria-pressed]")].find((b) => b.textContent.includes(n)).click(), name);
  await sleep(150);
  await page.keyboard.type(pin);
  await page.waitForFunction(() => location.pathname !== "/login", { timeout: 10000 });
  await sleep(600);
}
/** Clicks the first visible button or link starting with `text`, waiting up to 5 s for it to be enabled. */
async function click(page, text, root = "body") {
  const find = (t, r) =>
    [...(document.querySelector(r)?.querySelectorAll("button, a") ?? [])].find((x) => x.getClientRects().length > 0 && x.textContent.trim().startsWith(t) && !x.disabled);
  const ready = await page.waitForFunction(find, { timeout: 5000, polling: 100 }, text, root).then(() => true, () => false);
  if (!ready) throw new Error(`no enabled button "${text}"`);
  await page.evaluate((t, r, f) => new Function("t", "r", `return (${f})(t, r)`)(t, r).click(), text, root, find.toString());
}
const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
const waitText = (page, needle, timeout = 8000) =>
  page.waitForFunction((n) => document.body.innerText.replace(/\s+/g, " ").includes(n), { timeout, polling: 100 }, needle).then(() => true, () => false);
const waitGone = (page, needle, timeout = 8000) =>
  page.waitForFunction((n) => !document.body.innerText.replace(/\s+/g, " ").includes(n), { timeout, polling: 100 }, needle).then(() => true, () => false);
async function fill(page, selector, value) {
  await page.focus(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type(selector, value);
}
const dish = (page, name) =>
  page.evaluate((n) => {
    const b = [...document.querySelectorAll("section ul.grid button")].find((x) => x.querySelector("span")?.textContent === n);
    return b ? { disabled: b.disabled, text: b.innerText.replace(/\s+/g, " ") } : null;
  }, name);

(async () => {
  const browser = await launch();
  const manager = await device(browser);
  await signIn(manager, "Kwame B.", "2222");
  const till = await device(browser);
  await signIn(till, "Efua M.", "4444");

  // ---------- Menu
  await click(manager, "Menu", "nav[aria-label=Till]");
  await manager.waitForFunction(() => location.pathname === "/menu", { timeout: 10000 });
  await sleep(500);
  let page = await bodyText(manager);
  check("Menu link opens the menu screen with the five categories", ["Starters", "Mains", "Grills", "Drinks", "Desserts"].every((c) => page.includes(c)));

  await click(manager, "Mains", "section");
  await click(manager, "+ Add dish");
  await sleep(300);
  await manager.type("dialog[open] input[required]", "Kontomire stew");
  await manager.type("dialog[open] input[inputmode=decimal]", "75");
  await click(manager, "Add dish", "dialog[open] form");
  check("adds a dish", await waitText(manager, "Kontomire stew added."));
  check("new dish appears on another till without reloading", await waitText(till, "Kontomire stew"));
  check("…with its price", (await dish(till, "Kontomire stew"))?.text.includes("GH₵ 75.00"));

  // Edit its price
  await manager.evaluate(() => {
    const li = [...document.querySelectorAll("li")].find((l) => l.innerText.includes("Kontomire stew"));
    [...li.querySelectorAll("button")].find((b) => b.textContent.trim() === "Edit").click();
  });
  await sleep(300);
  await fill(manager, "dialog[open] input[inputmode=decimal]", "80");
  await click(manager, "Save dish", "dialog[open] form");
  check("edits the price, and other tills update", (await waitText(manager, "Dish saved.")) && (await waitText(till, "GH₵ 80.00")));

  // Duplicate name refused
  await click(manager, "+ Add dish");
  await sleep(300);
  await manager.type("dialog[open] input[required]", "sobolo");
  await manager.type("dialog[open] input[inputmode=decimal]", "10");
  await click(manager, "Add dish", "dialog[open] form");
  check("refuses a duplicate dish name", await waitText(manager, "sobolo is already on the menu."));
  await manager.keyboard.press("Escape");
  await sleep(200);

  // Sold out from the menu screen
  await click(manager, "Starters", "section");
  await sleep(200);
  await manager.evaluate(() => {
    const li = [...document.querySelectorAll("li")].find((l) => l.innerText.includes("Kelewele"));
    li.querySelector("input[type=checkbox]").click();
  });
  check("marks Kelewele sold out", await waitText(manager, "Kelewele marked sold out."));
  await till.waitForFunction(() => {
    const b = [...document.querySelectorAll("section ul.grid button")].find((x) => x.querySelector("span")?.textContent === "Kelewele");
    return b?.disabled;
  }, { timeout: 8000, polling: 100 }).catch(() => {});
  check("…and the cashier's till greys it out", (await dish(till, "Kelewele"))?.disabled === true);

  // Remove a dish nobody has ordered (deleted, not archived)
  await click(manager, "Mains", "section");
  await sleep(200);
  await manager.evaluate(() => {
    const li = [...document.querySelectorAll("li")].find((l) => l.innerText.includes("Kontomire stew"));
    [...li.querySelectorAll("button")].find((b) => b.textContent.trim() === "Remove").click();
  });
  check("removes a dish", await waitText(manager, "Kontomire stew taken off the menu."));
  check("…from every till", await waitGone(till, "Kontomire stew"));

  // Categories
  await manager.type("input[placeholder='e.g. Breakfast']", "Breakfast");
  await click(manager, "Add", "form:has(input[placeholder='e.g. Breakfast'])");
  check("adds a category", await waitText(manager, "Breakfast added."));
  await click(manager, "Remove category");
  check("removes an empty category", await waitText(manager, "Breakfast removed."));
  await manager.screenshot({ path: path.join(OUT, "menu.png") });

  // ---------- Sold-out mode on the order screen
  check("cashiers don't get the sold-out switch", !(await bodyText(till)).includes("Mark sold out"));
  await manager.goto(`${BASE}/order`, { waitUntil: "load" });
  await sleep(500);
  await click(manager, "Mark sold out");
  await manager.evaluate(() => [...document.querySelectorAll("section ul.grid button")].find((x) => x.querySelector("span")?.textContent === "Sobolo").click());
  check("manager marks Sobolo sold out from the order screen", await waitText(manager, "Sobolo marked sold out"));
  await sleep(1200);
  check("…and the cashier can't add it", (await dish(till, "Sobolo"))?.disabled === true);
  await manager.evaluate(() => [...document.querySelectorAll("section ul.grid button")].find((x) => x.querySelector("span")?.textContent === "Kelewele").click());
  check("tapping a sold-out dish puts it back", await waitText(manager, "Kelewele back on"));
  await manager.evaluate(() => [...document.querySelectorAll("section ul.grid button")].find((x) => x.querySelector("span")?.textContent === "Sobolo").click());
  await click(manager, "Done marking");
  await sleep(800);

  // ---------- Staff
  await manager.goto(`${BASE}/staff`, { waitUntil: "load" });
  await sleep(400);
  await click(manager, "+ Add staff");
  await sleep(300);
  const roleOptions = await manager.$$eval("dialog[open] select option", (o) => o.map((x) => x.textContent));
  check("managers can only give cashier, server, bartender or kitchen roles", roleOptions.join() === "Cashier,Server,Bartender,Kitchen", roleOptions.join());
  await manager.type("dialog[open] input[required]", "Esi Mensah");
  await manager.select("dialog[open] select", "server");
  await manager.type("dialog[open] input[maxlength='30']", "Head server");
  const pins = await manager.$$("dialog[open] input[type=password]");
  await pins[0].type("9090");
  await pins[1].type("9091");
  await click(manager, "Add staff", "dialog[open] form");
  check("mismatched PINs are caught", await waitText(manager, "The two PINs don't match."));
  // Correct the second PIN field only.
  await pins[1].focus();
  await manager.keyboard.down("Control");
  await manager.keyboard.press("KeyA");
  await manager.keyboard.up("Control");
  await manager.keyboard.press("Backspace");
  await pins[1].type("9090");
  await click(manager, "Add staff", "dialog[open] form");
  check("adds a member of staff", await waitText(manager, "Esi Mensah added. They can sign in now."));

  const esi = await device(browser);
  await signIn(esi, "Esi Mensah", "9090");
  check("new staff member signs in with their PIN", esi.url().endsWith("/order"), esi.url());

  await manager.evaluate(() => {
    const li = [...document.querySelectorAll("li")].find((l) => l.innerText.includes("Esi Mensah"));
    [...li.querySelectorAll("button")].find((b) => b.textContent.trim() === "Deactivate").click();
  });
  check("deactivates them", await waitText(manager, "Esi Mensah deactivated and signed out."));
  await esi.goto(`${BASE}/order`, { waitUntil: "load" });
  check("…which signs them out at once", esi.url().endsWith("/login"), esi.url());
  check("…and takes them off the sign-in screen", !(await bodyText(esi)).includes("Esi Mensah"));
  await manager.screenshot({ path: path.join(OUT, "staff.png") });

  // ---------- Settings
  await manager.goto(`${BASE}/settings`, { waitUntil: "load" });
  await sleep(400);
  check("managers see taxes but can't change them", (await bodyText(manager)).includes("Only an owner can change taxes."));

  const owner = await device(browser);
  await signIn(owner, "Ama Owner", "1111");
  await owner.goto(`${BASE}/settings`, { waitUntil: "load" });
  await sleep(400);
  await fill(owner, "input[maxlength='60']", "Chez Accra Osu");
  await fill(owner, "input[maxlength='120']", "Akwaaba! Come again.");
  await click(owner, "Save details");
  check("saves the name and receipt footer", await waitText(owner, "Saved."));
  check("new name shows on other screens", await waitText(till, "Chez Accra Osu"));

  // NHIL and GETFund folded into one "Levies" line
  await owner.click("input[aria-label='NHIL on its own receipt line']");
  await owner.click("input[aria-label='GETFund Levy on its own receipt line']");
  await sleep(200);
  const preview = await owner.$eval("figure", (f) => f.innerText.replace(/\s+/g, " "));
  check("receipt preview combines them as Levies (live, before saving)", preview.includes("Levies 10.00") && preview.includes("VAT (15%) 30.00") && preview.includes("Akwaaba! Come again."), preview);
  await click(owner, "Save taxes");
  check("saves taxes", await waitText(owner, "Taxes saved."));

  // Logo upload (a 1×1 PNG)
  const logoFile = path.join(OUT, "test-logo.png");
  fs.writeFileSync(logoFile, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  const input = await owner.$("input[type=file]");
  await input.uploadFile(logoFile);
  await click(owner, "Upload");
  check("uploads a logo", await waitText(owner, "Logo updated."));
  await sleep(500);
  const logoSrc = await owner.$eval("nav[aria-label=Till] img", (img) => img.getAttribute("src")).catch(() => null);
  check("logo shows in the till sidebar", /^\/api\/logo\/logo-[0-9a-f]{16}\.png$/.test(logoSrc ?? ""), logoSrc);
  const logo = logoSrc ? await fetch(`${BASE}${logoSrc}`) : null;
  check("logo is served as a PNG", logo?.status === 200 && logo.headers.get("content-type") === "image/png");
  check("the logo route refuses odd file names", (await fetch(`${BASE}/api/logo/..%2Fenyo.db`)).status === 404);
  await owner.screenshot({ path: path.join(OUT, "settings.png"), fullPage: true });

  // The till and receipt follow the new settings
  await till.goto(`${BASE}/order`, { waitUntil: "load" });
  await sleep(500);
  await till.evaluate(() => [...document.querySelectorAll("section ul.grid button")].find((x) => x.querySelector("span")?.textContent === "Jollof rice with chicken").click());
  await sleep(200);
  const ticket = await till.$eval("aside", (a) => a.innerText.replace(/\s+/g, " "));
  check("ticket shows VAT and a combined Levies line", ticket.includes("VAT (15%) GH₵ 13.50") && ticket.includes("Levies GH₵ 4.50") && ticket.includes("Total GH₵ 108.00"), ticket);

  // Discounts without a manager
  await owner.click("input[role=switch]:not([disabled]):last-of-type").catch(() => {});
  await owner.evaluate(() => {
    const sw = [...document.querySelectorAll("input[role=switch]")].find((s) => s.closest("section")?.innerText.includes("Discounts need a manager"));
    sw.click();
  });
  check("discount approval can be switched off", await waitText(owner, "Cashiers and servers can now give discounts without a manager."));
  await click(till, "Pay", "aside");
  await till.waitForFunction(() => location.pathname.startsWith("/pay/"), { timeout: 10000 });
  await sleep(600);
  await click(till, "Add discount");
  await sleep(300);
  check("…so the cashier isn't asked for a manager PIN", !(await till.$eval("dialog[open]", (d) => d.innerText)).includes("Manager approval"));
  await till.keyboard.press("Escape");
  await click(till, "Card", "[aria-label='Payment method']");
  await click(till, "Take GH₵");
  await waitText(till, "Paid in full");
  await click(till, "Print receipt");
  await till.waitForFunction(() => location.pathname.startsWith("/receipt/"), { timeout: 10000 });
  await sleep(500);
  const receipt = await till.$eval("article", (a) => a.innerText.replace(/\s+/g, " "));
  check("receipt uses the new name, Levies line and footer", receipt.includes("Chez Accra Osu") && receipt.includes("Levies 4.50") && receipt.includes("Akwaaba! Come again."), receipt.slice(0, 300));
  check("receipt prints the logo", await till.$("article img").then((img) => !!img));

  const problems = [manager, till, esi, owner].flatMap((p) => p.problems);
  check("no console errors or hydration warnings", problems.length === 0, problems.join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
