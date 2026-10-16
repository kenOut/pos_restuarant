// Multi-branch checks on the demo business (Chez Accra Osu and Chez Accra Mall):
// head office sign-in, separate data per branch, sessions that only work at
// their own branch, the /b/<address> fallback, and adding, renaming and
// closing branches. Run through `npm run test:e2e` (node e2e/run.mjs), which
// passes <siteUrl> <outDir> <osuDbPath>.
const path = require("path");
const Database = require("better-sqlite3");
const { launch } = require("./lib.cjs");
const [SITE, OUT, OSU_DB] = process.argv.slice(2);
const PORT = new URL(SITE).port;
const at = (slug) => `http://${slug}.localhost:${PORT}`;
const AXE = require.resolve("axe-core/axe.min.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

async function device(browser) {
  const page = await (await browser.createBrowserContext()).newPage();
  page.problems = [];
  page.on("console", (m) => ["error", "warn", "warning"].includes(m.type()) && !m.text().startsWith("Failed to load resource") && page.problems.push(m.text()));
  page.on("pageerror", (e) => page.problems.push(e.message));
  await page.setViewport({ width: 1366, height: 900 });
  return page;
}
async function signInAt(page, base, name, pin) {
  await page.goto(`${base}/login`, { waitUntil: "load" });
  await page.evaluate((n) => [...document.querySelectorAll("button[aria-pressed]")].find((b) => b.textContent.includes(n)).click(), name);
  await sleep(150);
  await page.keyboard.type(pin);
  await page.waitForFunction(() => !location.pathname.endsWith("/login"), { timeout: 10000 }).catch(() => {});
  await sleep(500);
}
async function click(page, text, root = "body") {
  const find = (t, r) => [...(document.querySelector(r)?.querySelectorAll("button, a") ?? [])].find((x) => x.getClientRects().length > 0 && x.textContent.trim().startsWith(t) && !x.disabled);
  const ready = await page.waitForFunction(find, { timeout: 8000, polling: 100 }, text, root).then(() => true, () => false);
  if (!ready) throw new Error(`no enabled button "${text}" in ${root}`);
  await page.evaluate((t, r, f) => new Function("t", "r", `return (${f})(t, r)`)(t, r).click(), text, root, find.toString());
}
async function fill(page, selector, value) {
  await page.focus(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  if (value) await page.type(selector, value);
}
const waitText = (page, needle, timeout = 10000) =>
  page.waitForFunction((n) => document.body.innerText.replace(/\s+/g, " ").includes(n), { timeout, polling: 100 }, needle).then(() => true, () => false);
const tiles = (page) => page.$$eval("button[aria-pressed]", (b) => b.map((x) => x.textContent));
const dishCount = (page) => page.$$eval("section ul.grid button", (b) => b.length);
const branchRow = (page, slug) => page.$eval(`li[data-branch="${slug}"]`, (li) => li.innerText.replace(/\s+/g, " ")).catch(() => null);
async function audit(page, label) {
  await page.addScriptTag({ path: AXE });
  const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((v) => `${v.id} (${v.nodes.length})`));
  check(`${label}: no WCAG 2.2 AA violations`, violations.length === 0, violations.join(", "));
}
const sessionCookie = async (page, url) => (await page.cookies(url ?? page.url())).find((c) => c.name === "enyo_session");
/** Status of the live-events stream for a cookie, without waiting for the stream itself. */
async function eventsStatus(url, cookie) {
  const controller = new AbortController();
  const res = await fetch(url, { headers: cookie ? { cookie } : {}, signal: controller.signal, redirect: "manual" });
  controller.abort();
  return res.status;
}

(async () => {
  const browser = await launch();

  // --- Head office sign-in
  const hq = await device(browser);
  await hq.goto(`${SITE}/hq`, { waitUntil: "load" });
  check("head office needs signing in", hq.url().endsWith("/hq/login"), hq.url());
  await audit(hq, "Head office sign-in");
  await hq.type("input[name=email]", "owner@chezaccra.test");
  await hq.type("input[name=password]", "not-the-password");
  await hq.click("button[type=submit]");
  check("a wrong password is refused", await waitText(hq, "Wrong email or password."));
  check("…and keeps the email typed", (await hq.$eval("input[name=email]", (i) => i.value)) === "owner@chezaccra.test");
  await fill(hq, "input[name=password]", "enyo-demo-2026");
  await hq.click("button[type=submit]");
  await hq.waitForFunction(() => location.pathname === "/hq", { timeout: 10000 }).catch(() => {});
  check("the demo head office signs in", hq.url().endsWith("/hq"), hq.url());
  check("both branches are listed", !!(await branchRow(hq, "osu")) && !!(await branchRow(hq, "accra-mall")));
  await audit(hq, "Head office dashboard");
  await hq.screenshot({ path: path.join(OUT, "hq-dashboard.png"), fullPage: true });

  // --- Each branch has its own database
  const extra = new Database(OSU_DB);
  const restaurantId = extra.prepare("SELECT id FROM restaurants").get().id;
  extra.prepare("INSERT INTO staff (id, restaurant_id, name, initials, role, pin_hash) VALUES ('osu-only', ?, 'Osu Only', 'OO', 'cashier', 'x')").run(restaurantId);
  extra.close();
  const osu = await device(browser);
  await osu.goto(`${at("osu")}/login`, { waitUntil: "load" });
  const osuTiles = await tiles(osu);
  await osu.goto(`${at("accra-mall")}/login`, { waitUntil: "load" });
  const mallTiles = await tiles(osu);
  check("a person added at Osu appears only at Osu", osuTiles.some((t) => t.includes("Osu Only")) && !mallTiles.some((t) => t.includes("Osu Only")), `${osuTiles.length} vs ${mallTiles.length}`);
  check("each branch shows its own name", (await osu.evaluate(() => document.body.innerText)).includes("Chez Accra Mall"));

  // --- A session only works at its own branch
  await signInAt(osu, at("osu"), "Ama Owner", "1111");
  check("signs in at Osu with the branch PIN", osu.url() === `${at("osu")}/order`, osu.url());
  const osuDishes = await dishCount(osu);
  await osu.goto(`${at("accra-mall")}/order`, { waitUntil: "load" });
  check("being signed in at Osu doesn't open Accra Mall", osu.url() === `${at("accra-mall")}/login`, osu.url());
  const token = await sessionCookie(osu, at("osu"));
  const cookie = `enyo_session=${token.value}`;
  check("Osu's session works at Osu", (await eventsStatus(`${SITE}/b/osu/api/events`, cookie)) === 200);
  check("…and is refused by Accra Mall, even sent there by hand", (await eventsStatus(`${SITE}/b/accra-mall/api/events`, cookie)) === 401);
  check("a branch can't be chosen with a made-up header", (await fetch(`${SITE}/order`, { headers: { "x-enyo-branch": "osu", cookie } })).status === 404);
  check("unknown branches are not found", (await fetch(`${SITE}/b/nowhere/login`)).status === 404 && (await fetch(`${at("nowhere")}/login`)).status === 404);
  check("the head office cookie isn't sent to branches", !(await osu.cookies()).some((c) => c.name === "enyo_hq") && (await hq.cookies()).find((c) => c.name === "enyo_hq")?.path === "/hq");

  // --- Path fallback: the same branch at /b/<address>, e.g. over a local network address
  const lan = await device(browser);
  await signInAt(lan, `${SITE}/b/accra-mall`, "Ama Owner", "1111");
  check("a branch works by path too", new URL(lan.url()).pathname === "/b/accra-mall/order", lan.url());
  const navLinks = await lan.$$eval("nav[aria-label=Till] a", (a) => a.map((x) => x.getAttribute("href")));
  check("…with every till link kept inside the branch", navLinks.length > 0 && navLinks.every((h) => h.startsWith("/b/accra-mall/")), navLinks.join(" "));
  check("…and its cookie limited to that path", (await sessionCookie(lan))?.path === "/b/accra-mall");
  check("no console errors at the branches", [...osu.problems, ...lan.problems].length === 0, [...osu.problems, ...lan.problems].join(" | "));

  // --- Add a branch, copying Osu's menu
  await hq.goto(`${SITE}/hq/branches/new`, { waitUntil: "load" });
  await audit(hq, "Add a branch");
  await hq.type("input[name=branchName]", "Chez Accra Airport");
  check("its address follows the name", (await hq.$eval("input[name=branchSlug]", (i) => i.value)) === "chez-accra-airport");
  await fill(hq, "input[name=branchSlug]", "hq");
  await hq.type("input[name=leadName]", "Kojo Lead");
  await hq.type("input[name=pin]", "5555");
  await hq.type("input[name=confirmPin]", "5555");
  await hq.click("button[type=submit]");
  check("addresses the app uses itself are refused", await waitText(hq, "Use 2–32 lower-case letters"));
  await fill(hq, "input[name=branchSlug]", "airport");
  await fill(hq, "input[name=pin]", "5555");
  await fill(hq, "input[name=confirmPin]", "5555");
  check("copying Osu's menu is offered first", await hq.$eval("input[name=menu]:checked", (i) => i.closest("label").innerText.includes("Chez Accra Osu")));
  await hq.click("button[type=submit]");
  await hq.waitForFunction(() => location.pathname === "/hq", { timeout: 15000 }).catch(() => {});
  check("the new branch is ready", await waitText(hq, "Chez Accra Airport is ready."));
  const airport = await device(browser);
  await airport.goto(`${at("airport")}/login`, { waitUntil: "load" });
  const airportTiles = await tiles(airport);
  check("it starts with only its branch lead", airportTiles.length === 1 && airportTiles[0].includes("Kojo Lead"), airportTiles.join(", "));
  await signInAt(airport, at("airport"), "Kojo Lead", "5555");
  check("the branch lead signs in with their PIN", airport.url() === `${at("airport")}/order`, airport.url());
  check("…and has Osu's menu", (await dishCount(airport)) === osuDishes, `${await dishCount(airport)} vs ${osuDishes}`);

  // --- Rename it
  await hq.goto(`${SITE}/hq`, { waitUntil: "load" });
  await click(hq, "Rename", 'li[data-branch="airport"]');
  await fill(hq, "dialog[open] input[name=name]", "Chez Accra Kotoka");
  await click(hq, "Save", "dialog[open]");
  check("renaming shows on the dashboard", await waitText(hq, "Chez Accra Kotoka"));
  await airport.goto(`${at("airport")}/order`, { waitUntil: "load" });
  check("…and in the branch's till", (await airport.$eval("nav[aria-label=Till]", (n) => n.innerText + n.querySelector("[title]")?.title)).includes("Chez Accra Kotoka"));

  // --- Close and reopen a branch
  await click(hq, "Close branch", 'li[data-branch="accra-mall"]');
  await click(hq, "Close branch", "dialog[open]");
  await hq.waitForFunction(() => document.querySelector('li[data-branch="accra-mall"]')?.innerText.includes("Closed"), { timeout: 10000 }).catch(() => {});
  check("a closed branch is marked and can't be opened from head office", (await branchRow(hq, "accra-mall"))?.includes("Closed") && !(await hq.$('a[aria-label="Open Chez Accra Mall"]')));
  check("its tills can't be reached", (await fetch(`${at("accra-mall")}/login`)).status === 404);
  check("…even by a till that was signed in", (await lan.goto(`${SITE}/b/accra-mall/order`, { waitUntil: "load" })).status() === 404);
  await click(hq, "Reopen", 'li[data-branch="accra-mall"]');
  await hq.waitForFunction(() => !document.querySelector('li[data-branch="accra-mall"]')?.innerText.includes("Closed"), { timeout: 10000 }).catch(() => {});
  check("reopening brings it back, data and all", (await fetch(`${at("accra-mall")}/login`)).status === 200 && (await waitText(hq, "Chez Accra Mall")));

  // --- The website's sign-in asks which branch when there are several
  const site = await device(browser);
  await site.goto(`${SITE}/login`, { waitUntil: "load" });
  const choices = await site.$$eval("main li a", (a) => a.map((x) => x.textContent.trim()));
  check("the website's sign-in lists the open branches", ["Chez Accra Osu", "Chez Accra Mall", "Chez Accra Kotoka"].every((n) => choices.includes(n)), choices.join(", "));
  await audit(site, "Choose a branch");

  // --- Head office on its own subdomain, and signing out
  await site.goto(`${at("hq")}/`, { waitUntil: "load" });
  check("hq.<domain> is head office (signed in separately)", new URL(site.url()).pathname === "/login" && (await site.evaluate(() => document.body.innerText)).includes("Head office sign-in"), site.url());
  await click(hq, "Sign out");
  await hq.waitForFunction(() => location.pathname === "/hq/login", { timeout: 10000 }).catch(() => {});
  await hq.goto(`${SITE}/hq`, { waitUntil: "load" });
  check("signing out of head office works", hq.url().endsWith("/hq/login"), hq.url());
  check("no console errors in head office", hq.problems.length === 0 && site.problems.length === 0, [...hq.problems, ...site.problems].join(" | "));

  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
