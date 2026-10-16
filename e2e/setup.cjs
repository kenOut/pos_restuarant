// First-time setup of a brand-new install (no demo data): business, head office
// sign-in and first branch, then working in that branch with its PIN.
// Run through `npm run test:e2e` (node e2e/run.mjs), which passes <siteUrl> <outDir>.
const path = require("path");
const { launch } = require("./lib.cjs");
const [BASE, OUT] = process.argv.slice(2);
const PORT = new URL(BASE).port;
const AXE = require.resolve("axe-core/axe.min.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};
async function fill(page, selector, value) {
  await page.focus(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  if (value) await page.type(selector, value);
}
const value = (page, name) => page.$eval(`input[name=${name}]`, (i) => i.value);

(async () => {
  const browser = await launch();
  const page = await (await browser.createBrowserContext()).newPage();
  const problems = [];
  page.on("console", (m) => ["error", "warn", "warning"].includes(m.type()) && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(e.message));
  await page.setViewport({ width: 1280, height: 860 });

  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  check("a new install goes from sign-in to head office setup", page.url().endsWith("/hq/setup"), page.url());

  await page.addScriptTag({ path: AXE });
  const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((v) => v.id));
  check("setup screen: no WCAG 2.2 AA violations", violations.length === 0, violations.join(", "));
  await page.screenshot({ path: path.join(OUT, "setup.png"), fullPage: true });

  await page.type("input[name=businessName]", "Buka Group");
  await page.type("input[name=name]", "Yaa Asantewaa");
  await page.type("input[name=email]", "yaa@buka.test");
  await page.type("input[name=password]", "a-long-password");
  await page.type("input[name=branchName]", "Buka East Legon");
  check("the branch address follows the branch name", (await value(page, "branchSlug")) === "buka-east-legon", await value(page, "branchSlug"));
  await fill(page, "input[name=branchSlug]", "east-legon");
  await page.type("input[name=pin]", "2468");
  await page.type("input[name=confirmPin]", "2469");
  await page.click("button[type=submit]");
  await page.waitForFunction(() => document.querySelector("[role=alert]")?.textContent.includes("don't match"), { timeout: 8000 }).catch(() => {});
  check("PINs must match", (await page.$eval("[role=alert]", (e) => e.textContent)).includes("The two PINs don't match."));
  check(
    "a failed attempt keeps what was typed",
    (await value(page, "businessName")) === "Buka Group" && (await value(page, "email")) === "yaa@buka.test" && (await value(page, "branchSlug")) === "east-legon",
    `${await value(page, "businessName")} / ${await value(page, "branchSlug")}`
  );

  await fill(page, "input[name=password]", "a-long-password");
  await fill(page, "input[name=pin]", "2468");
  await fill(page, "input[name=confirmPin]", "2468");
  await page.click("button[type=submit]");
  await page.waitForFunction(() => location.pathname === "/hq", { timeout: 15000 }).catch(() => {});
  check("setup signs in to head office", page.url().endsWith("/hq"), page.url());
  const dashboard = await page.evaluate(() => document.body.innerText);
  check("head office shows the business and its first branch", dashboard.includes("Buka Group") && dashboard.includes("Buka East Legon"));

  // Open the branch: its own subdomain, signed in there with the PIN chosen at setup
  await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("a[aria-label='Open Buka East Legon']")]);
  check("Open goes to the branch's own address", page.url() === `http://east-legon.localhost:${PORT}/login`, page.url());
  await page.evaluate(() => [...document.querySelectorAll("button[aria-pressed]")].find((b) => b.textContent.includes("Yaa Asantewaa")).click());
  await sleep(150);
  await page.keyboard.type("2468");
  await page.waitForFunction(() => location.pathname === "/order", { timeout: 15000 }).catch(() => {});
  check("the PIN from setup signs in at the branch", page.url().endsWith("/order"), page.url());
  await sleep(600);
  const dishes = await page.$$eval("section ul.grid button", (b) => b.length);
  check("the branch starts with the 16-dish sample menu", dishes === 16, `${dishes}`);
  check("branch name shows in the till", (await page.$eval("nav[aria-label=Till]", (n) => n.innerText + n.querySelector("[title]")?.title)).includes("Buka East Legon"));
  check("the branch lead can reach Menu, Staff and Settings", await page.evaluate(() => ["Menu", "Staff", "Settings"].every((l) => [...document.querySelectorAll("nav[aria-label=Till] a")].some((a) => a.textContent.trim() === l))));

  // Setup can't be run again, from this device or another one
  const other = await (await browser.createBrowserContext()).newPage();
  await other.goto(`${BASE}/setup`, { waitUntil: "load" });
  check("setup isn't available once the business exists", other.url().endsWith("/hq/login"), other.url());
  await other.goto(`${BASE}/login`, { waitUntil: "load" });
  check("with one branch, the website's sign-in goes straight to it", other.url() === `http://east-legon.localhost:${PORT}/login`, other.url());

  check("no console errors or hydration warnings", problems.length === 0, problems.join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
