// Phase 8 first-time setup checks, on an empty database (no demo data).
// Run through `npm run test:e2e` (node e2e/run.mjs), which passes <baseUrl> <outDir>.
const path = require("path");
const { launch } = require("./lib.cjs");
const [BASE, OUT] = process.argv.slice(2);
const AXE = require.resolve("axe-core/axe.min.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

(async () => {
  const browser = await launch();
  const page = await (await browser.createBrowserContext()).newPage();
  const problems = [];
  page.on("console", (m) => ["error", "warn", "warning"].includes(m.type()) && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(e.message));
  await page.setViewport({ width: 1280, height: 860 });

  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  check("a new main computer goes from sign-in to setup", page.url().endsWith("/setup"), page.url());

  await page.addScriptTag({ path: AXE });
  const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((v) => v.id));
  check("setup screen: no WCAG 2.2 AA violations", violations.length === 0, violations.join(", "));
  await page.screenshot({ path: path.join(OUT, "setup.png") });

  await page.type("input[name=restaurantName]", "Buka Lounge");
  await page.type("input[name=ownerName]", "Yaa Asantewaa");
  await page.type("input[name=pin]", "2468");
  await page.type("input[name=confirmPin]", "2469");
  await page.click("button[type=submit]");
  await page.waitForFunction(() => document.querySelector("[role=alert]")?.textContent.includes("don't match"), { timeout: 8000 }).catch(() => {});
  check("PINs must match", (await page.$eval("[role=alert]", (e) => e.textContent)).includes("The two PINs don't match."));
  check("a failed attempt keeps the names typed", (await page.$eval("input[name=restaurantName]", (i) => i.value)) === "Buka Lounge" && (await page.$eval("input[name=ownerName]", (i) => i.value)) === "Yaa Asantewaa");

  for (const name of ["pin", "confirmPin"]) {
    await page.focus(`input[name=${name}]`);
    await page.keyboard.down("Control");
    await page.keyboard.press("KeyA");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    await page.type(`input[name=${name}]`, "2468");
  }
  await page.click("button[type=submit]");
  await page.waitForFunction(() => location.pathname === "/order", { timeout: 15000 }).catch(() => {});
  check("setup signs the owner in at the order screen", page.url().endsWith("/order"), page.url());
  await sleep(600);
  const dishes = await page.$$eval("section ul.grid button", (b) => b.length);
  check("starts with the 16-dish sample menu, all available", dishes === 16 && (await page.$$eval("section ul.grid button[disabled]", (b) => b.length)) === 0, `${dishes}`);
  check("restaurant name shows in the till", (await page.$eval("nav[aria-label=Till]", (n) => n.innerText + n.querySelector("[title]")?.title)).includes("Buka Lounge"));
  check("owner can reach Menu, Staff and Settings", await page.evaluate(() => ["Menu", "Staff", "Settings"].every((l) => [...document.querySelectorAll("nav[aria-label=Till] a")].some((a) => a.textContent.trim() === l))));

  // Setup can't be run again, from this device or another one
  const other = await (await browser.createBrowserContext()).newPage();
  await other.goto(`${BASE}/setup`, { waitUntil: "load" });
  check("setup isn't available once the restaurant exists", other.url().endsWith("/login"), other.url());
  check("the new owner is on the sign-in screen", (await other.evaluate(() => document.body.innerText)).includes("Yaa Asantewaa"));

  check("no console errors or hydration warnings", problems.length === 0, problems.join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
