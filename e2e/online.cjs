// ENYO Online checks (ENYO_MODE=online): the seller's page, adding clients
// with one-time setup links, each client's head office and branches under
// /c/<client>, and that clients can never reach each other's data, even with
// the same branch name. Run through `npm run test:e2e` (node e2e/run.mjs),
// which passes <siteUrl> <outDir>.
const path = require("path");
const { launch } = require("./lib.cjs");
const [SITE, OUT] = process.argv.slice(2);
const SERVER_CODE = "e2e-server-setup-code";
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
  page.on("dialog", (d) => d.accept());
  await page.setViewport({ width: 1366, height: 900 });
  return page;
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
const text = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
const waitText = (page, needle, timeout = 10000) =>
  page.waitForFunction((n) => document.body.innerText.replace(/\s+/g, " ").includes(n), { timeout, polling: 100 }, needle).then(() => true, () => false);
const pathOf = (page) => new URL(page.url()).pathname;
async function audit(page, label) {
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((x) => x.id));
  check(`${label}: no WCAG 2.2 AA violations`, v.length === 0, v.join(", "));
}
async function pin(page, name, digits) {
  await page.evaluate((n) => [...document.querySelectorAll("button[aria-pressed]")].find((b) => b.textContent.includes(n)).click(), name);
  await sleep(150);
  await page.keyboard.type(digits);
  await page.waitForFunction(() => !location.pathname.endsWith("/login"), { timeout: 10000 }).catch(() => {});
  await sleep(400);
}
/** Adds a client on the seller's page and returns its setup link. */
async function addClient(admin, name, slug) {
  await fill(admin, "input[maxlength='60']", name);
  if (slug) await fill(admin, "input[maxlength='32']", slug);
  await click(admin, "Add client");
  await admin.waitForFunction(() => !!document.querySelector("[data-setup-link]"), { timeout: 10000 });
  const link = await admin.$eval("[data-setup-link]", (c) => c.textContent.trim());
  await click(admin, "Done");
  return link;
}
/** Sets up a client's business from its link, as the client would. */
async function setUpClient(page, link, { business, owner, email, branch, branchSlug, pin: digits }) {
  await page.goto(link, { waitUntil: "load" });
  await page.type("input[name=businessName]", business);
  await page.type("input[name=name]", owner);
  await page.type("input[name=email]", email);
  await page.type("input[name=password]", "a-long-password");
  await page.type("input[name=branchName]", branch);
  await fill(page, "input[name=branchSlug]", branchSlug);
  await page.type("input[name=pin]", digits);
  await page.type("input[name=confirmPin]", digits);
  await page.click("button[type=submit]");
  await page.waitForFunction(() => /\/hq$/.test(location.pathname), { timeout: 15000 }).catch(() => {});
}
const branchCookie = async (page, url) => (await page.cookies(url)).find((c) => c.name === "enyo_session");

(async () => {
  const browser = await launch();

  // --- The seller's first sign-in needs the server's setup code
  const admin = await device(browser);
  await admin.goto(`${SITE}/admin`, { waitUntil: "load" });
  check("a new server asks for the seller account", pathOf(admin) === "/admin/setup", admin.url());
  await audit(admin, "Seller setup");
  await admin.type("input[name=code]", "a-guess");
  await admin.type("input[name=name]", "Nelikem");
  await admin.type("input[name=email]", "seller@enyo.test");
  await admin.type("input[name=password]", "a-long-password");
  await admin.click("button[type=submit]");
  check("a wrong server code is refused", await waitText(admin, "That setup code isn't right."));
  await fill(admin, "input[name=code]", SERVER_CODE);
  await fill(admin, "input[name=password]", "a-long-password");
  await admin.click("button[type=submit]");
  await admin.waitForFunction(() => location.pathname === "/admin", { timeout: 10000 }).catch(() => {});
  check("the right code creates the seller account", pathOf(admin) === "/admin" && (await waitText(admin, "Clients")));
  const adminCookie = (await admin.cookies(`${SITE}/admin`)).find((c) => c.name === "enyo_admin");
  check("the seller's cookie only goes to /admin", adminCookie?.path === "/admin" && adminCookie.httpOnly && adminCookie.sameSite === "Strict");
  await audit(admin, "Seller dashboard");

  // --- Two clients
  const akosLink = await addClient(admin, "Mama Akos Grill");
  check("a client gets an address from its name and a one-time setup link", /\/c\/mama-akos-grill\/hq\/setup\?code=[\w-]{24}$/.test(akosLink), akosLink);
  const bukaLink = await addClient(admin, "Buka Lounge", "buka");
  check("…and the address can be chosen", bukaLink.includes("/c/buka/hq/setup?code="));
  await addClient(admin, "Taken", "buka").catch(() => {});
  check("an address can't be used twice", await waitText(admin, "The address buka is already taken."));
  await admin.reload({ waitUntil: "load" });
  check("new clients wait for setup", (await admin.$eval("[data-client='buka']", (li) => li.innerText)).includes("Waiting for setup"));

  // --- A client is set up only from its link
  const client = await device(browser);
  await client.goto(`${SITE}/c/buka/login`, { waitUntil: "load" });
  check("a client that isn't set up says so", (await text(client)).includes("Not set up yet"));
  await client.goto(`${SITE}/c/buka/hq/setup`, { waitUntil: "load" });
  check("setup without the link's code is refused", (await text(client)).includes("This setup link isn’t valid or has expired."));
  await client.goto(`${SITE}/c/buka/hq/setup?code=forged`, { waitUntil: "load" });
  check("…and with a forged code", (await text(client)).includes("This setup link isn’t valid or has expired."));

  await setUpClient(client, akosLink.replace(/^https?:\/\/[^/]+/, SITE), { business: "Mama Akos Grill", owner: "Ama Akos", email: "ama@akos.test", branch: "Spintex", branchSlug: "spintex", pin: "2468" });
  check("the setup link sets up the client's head office", pathOf(client) === "/c/mama-akos-grill/hq", client.url());
  check("…shown under the client's address", (await text(client)).includes("Mama Akos Grill") && (await text(client)).includes("Spintex"));
  const hqCookie = (await client.cookies(`${SITE}/c/mama-akos-grill/hq`)).find((c) => c.name === "enyo_hq");
  check("the client's head office cookie stays under its address", hqCookie?.path === "/c/mama-akos-grill/hq", hqCookie?.path);
  const reuse = await device(browser);
  await reuse.goto(akosLink.replace(/^https?:\/\/[^/]+/, SITE), { waitUntil: "load" });
  check("a used setup link can't set it up again", pathOf(reuse) === "/c/mama-akos-grill/hq/login", reuse.url());

  const buka = await device(browser);
  await setUpClient(buka, bukaLink.replace(/^https?:\/\/[^/]+/, SITE), { business: "Buka Lounge", owner: "Kojo Buka", email: "kojo@buka.test", branch: "Spintex", branchSlug: "spintex", pin: "1357" });
  check("a second client can use the same branch name", pathOf(buka) === "/c/buka/hq", buka.url());

  // --- Each client's branch: its own staff and data
  await client.goto(`${SITE}/c/mama-akos-grill/b/spintex/login`, { waitUntil: "load" });
  const akosTiles = await client.$$eval("button[aria-pressed]", (b) => b.map((x) => x.textContent));
  await buka.goto(`${SITE}/c/buka/b/spintex/login`, { waitUntil: "load" });
  const bukaTiles = await buka.$$eval("button[aria-pressed]", (b) => b.map((x) => x.textContent));
  check("same branch address, separate staff", akosTiles.length === 1 && akosTiles[0].includes("Ama Akos") && bukaTiles.length === 1 && bukaTiles[0].includes("Kojo Buka"), `${akosTiles} | ${bukaTiles}`);
  await pin(client, "Ama Akos", "2468");
  check("staff sign in with their PIN under the client's address", pathOf(client) === "/c/mama-akos-grill/b/spintex/order", client.url());
  const nav = await client.$$eval("nav[aria-label=Till] a", (a) => a.map((x) => x.getAttribute("href")));
  check("every till link stays inside the client's branch", nav.length > 0 && nav.every((h) => h.startsWith("/c/mama-akos-grill/b/spintex/")), nav.join(" "));
  const session = await branchCookie(client, `${SITE}/c/mama-akos-grill/b/spintex`);
  check("…and so does its sign-in cookie", session?.path === "/c/mama-akos-grill/b/spintex", session?.path);
  const cookie = `enyo_session=${session.value}`;
  const events = async (url) => {
    const c = new AbortController();
    const r = await fetch(url, { headers: { cookie }, signal: c.signal });
    c.abort();
    return r.status;
  };
  check("the session works at its own branch", (await events(`${SITE}/c/mama-akos-grill/b/spintex/api/events`)) === 200);
  check("…and is refused at the other client's branch of the same name", (await events(`${SITE}/c/buka/b/spintex/api/events`)) === 401);
  check("a business can't be chosen with a made-up header", (await fetch(`${SITE}/b/spintex/login`, { headers: { "x-enyo-business": "buka" } })).status === 404);

  // --- Addresses that don't belong to a client
  check("unknown clients are not found", (await fetch(`${SITE}/c/nobody/login`)).status === 404);
  check("branches and head office need a client in the address", (await fetch(`${SITE}/b/spintex/login`)).status === 404 && (await fetch(`${SITE}/hq/login`)).status === 404);
  check("the seller's page isn't reachable under a client", (await fetch(`${SITE}/c/buka/admin`)).status === 404);

  // --- The back office works under the client's address
  await client.goto(`${SITE}/c/mama-akos-grill/b/spintex/office/login`, { waitUntil: "load" });
  await pin(client, "Ama Akos", "2468");
  check("the back office works under the client's address", pathOf(client) === "/c/mama-akos-grill/b/spintex/office" && (await waitText(client, "Dashboard")));

  // --- Finding a restaurant from the website
  const visitor = await device(browser);
  await visitor.goto(`${SITE}/login`, { waitUntil: "load" });
  check("the website's sign-in asks which restaurant", (await text(visitor)).includes("Find your restaurant"));
  await audit(visitor, "Find your restaurant");
  await visitor.type("#restaurant", "Mama Akos Grill");
  await Promise.all([visitor.waitForNavigation({ waitUntil: "load" }), visitor.click("button[type=submit]")]);
  check("…and takes you to its sign-in", pathOf(visitor) === "/c/mama-akos-grill/b/spintex/login", visitor.url());

  // --- Suspending a client
  await admin.reload({ waitUntil: "load" });
  check("the seller sees status and branches, not sales", /Set up.*Spintex/.test(await admin.$eval("[data-client='buka']", (li) => li.innerText.replace(/\s+/g, " "))) && !(await text(admin)).includes("GH₵"));
  await click(admin, "Suspend", "[data-client='buka']");
  await admin.waitForFunction(() => document.querySelector("[data-client='buka']")?.innerText.includes("Suspended"), { timeout: 10000 }).catch(() => {});
  check("a suspended client can't be opened", (await fetch(`${SITE}/c/buka/b/spintex/login`)).status === 404 && (await fetch(`${SITE}/c/buka/hq/login`)).status === 404);
  check("…while the others carry on", (await fetch(`${SITE}/c/mama-akos-grill/b/spintex/login`)).status === 200);
  await click(admin, "Reactivate", "[data-client='buka']");
  await admin.waitForFunction(() => !document.querySelector("[data-client='buka']")?.innerText.includes("Suspended"), { timeout: 10000 }).catch(() => {});
  check("reactivating brings it back, data and all", (await fetch(`${SITE}/c/buka/b/spintex/login`)).status === 200);
  await admin.screenshot({ path: path.join(OUT, "online-admin.png"), fullPage: true });

  await click(admin, "Sign out");
  await admin.waitForFunction(() => location.pathname === "/admin/login", { timeout: 10000 }).catch(() => {});
  await admin.goto(`${SITE}/admin`, { waitUntil: "load" });
  check("signing out of the seller's page works", pathOf(admin) === "/admin/login");

  const problems = [...admin.problems, ...client.problems, ...buka.problems, ...visitor.problems];
  check("no console errors or hydration warnings", problems.length === 0, problems.join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
