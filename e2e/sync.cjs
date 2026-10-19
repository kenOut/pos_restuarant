// Two-way sync, end to end: a restaurant computer (local mode, demo business
// with two branches) and ENYO Online, each on its own server. Pairs them,
// trades on both, takes each side offline in turn and brings it back, then
// checks both hold exactly the same data. Starts its own two servers (so it
// can stop them); run through `npm run test:e2e` (node e2e/run.mjs).
const fs = require("fs");
const os = require("os");
const path = require("path");
const Database = require("better-sqlite3");
const { freePort, launch, startServer } = require("./lib.cjs");
const [, OUT] = process.argv.slice(2);
const CODE = "e2e-sync-setup-code";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};
/** Waits until fn() is truthy (sync runs every second in this test). */
async function until(fn, timeout = 25_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      // not yet
    }
    await sleep(500);
  }
  return false;
}

async function device(browser) {
  const page = await (await browser.createBrowserContext()).newPage();
  page.on("dialog", (d) => d.accept());
  await page.setViewport({ width: 1366, height: 900 });
  return page;
}
async function click(page, text, root = "body") {
  const find = (t, r) => [...(document.querySelector(r)?.querySelectorAll("button, a") ?? [])].find((x) => x.getClientRects().length > 0 && x.textContent.trim().startsWith(t) && !x.disabled);
  const ready = await page.waitForFunction(find, { timeout: 10000, polling: 100 }, text, root).then(() => true, () => false);
  if (!ready) throw new Error(`no enabled button "${text}" in ${root}`);
  await page.evaluate((t, r, f) => new Function("t", "r", `return (${f})(t, r)`)(t, r).click(), text, root, find.toString());
}
const text = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
async function pin(page, url, name, digits) {
  await page.goto(`${url}/login`, { waitUntil: "load" });
  await page.evaluate((n) => [...document.querySelectorAll("button[aria-pressed]")].find((b) => b.textContent.includes(n)).click(), name);
  await sleep(150);
  await page.keyboard.type(digits);
  // The sign-in redirect can swap the page while it's being watched; check where it ended up instead.
  const signedIn = await until(() => !new URL(page.url()).pathname.endsWith("/login"), 20000);
  if (!signedIn) throw new Error(`sign-in as ${name} didn't leave ${page.url()}`);
  await sleep(500);
}
async function hqSignIn(page, url) {
  await page.goto(`${url}/login`, { waitUntil: "load" });
  await page.type("input[name=email]", "owner@chezaccra.test");
  await page.type("input[name=password]", "enyo-demo-2026");
  await page.click("button[type=submit]");
  if (!(await until(() => /\/hq$/.test(new URL(page.url()).pathname), 20000))) throw new Error("head office sign-in failed");
}
/** Takes an order of one dish and sends it; returns the number shown in the confirmation. */
async function takeOrder(page, branchUrl, dish, { pay = false } = {}) {
  await page.goto(`${branchUrl}/order`, { waitUntil: "load" });
  await page.evaluate((n) => [...document.querySelectorAll("section ul.grid button")].find((b) => b.textContent.includes(n)).click(), dish);
  await sleep(150);
  if (pay) {
    await click(page, "Pay", "aside");
    if (!(await until(() => new URL(page.url()).pathname.includes("/pay/"), 20000))) throw new Error("the pay screen didn't open");
    await sleep(500);
    const number = await page.evaluate(() => document.body.innerText.match(/Payment · #(W?\d+)/)?.[1]);
    await click(page, "Card", "[aria-label='Payment method']");
    await click(page, "Take GH₵");
    await page.waitForFunction(() => document.body.innerText.includes("Paid in full"), { timeout: 15000 });
    return number;
  }
  await click(page, "Send to kitchen", "aside");
  const toast = await page.waitForFunction(() => document.body.innerText.match(/Order #(W?\d+) sent to the kitchen/)?.[1], { timeout: 15000 });
  return toast.jsonValue();
}
/** Whether a branch's open orders (on that side's order screen) include an order number. */
async function openOrdersInclude(page, branchUrl, number) {
  await page.goto(`${branchUrl}/order`, { waitUntil: "load" });
  await click(page, "Open orders");
  await sleep(300);
  return (await page.evaluate(() => document.querySelector("dialog[open]")?.innerText ?? "")).includes(`#${number}`);
}

const SYNCED = ["restaurants", "staff", "menu_categories", "menu_items", "floor_areas", "dining_tables", "orders", "kitchen_tickets", "order_lines", "payments"];
const LOCAL_ONLY = { restaurants: ["backup_copy_dir", "api_allowed_origins"] };
function snapshot(file) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    return JSON.stringify(
      SYNCED.map((t) => db.prepare(`SELECT * FROM "${t}" ORDER BY id`).all().map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !(LOCAL_ONLY[t] ?? []).includes(k)))))
    );
  } finally {
    db.close();
  }
}

(async () => {
  const localDir = fs.mkdtempSync(path.join(os.tmpdir(), "enyo-sync-local-"));
  const onlineDir = fs.mkdtempSync(path.join(os.tmpdir(), "enyo-sync-online-"));
  const [localPort, onlinePort] = [await freePort(), await freePort()];
  const LOCAL = { ENYO_DATA_DIR: localDir, DATABASE_PATH: "", ENYO_MODE: "", ENYO_SEED_DEMO: "1", ENYO_BASE_DOMAIN: "", ENYO_BACKUPS: "0", ENYO_SYNC_INTERVAL_MS: "1000", ENYO_FAILOVER_AFTER_MS: "4000" };
  const ONLINE = { ENYO_DATA_DIR: onlineDir, DATABASE_PATH: "", ENYO_MODE: "online", ENYO_SEED_DEMO: "0", ENYO_BASE_DOMAIN: "", ENYO_BACKUPS: "0", ENYO_ADMIN_SETUP_CODE: CODE, ENYO_FAILOVER_POLL_MS: "1500" };
  let local = await startServer(localPort, LOCAL);
  let online = await startServer(onlinePort, ONLINE);
  const browser = await launch();
  try {
    // --- ENYO Online: a client whose business already runs on its own computer
    const admin = await device(browser);
    await admin.goto(`${online.url}/admin`, { waitUntil: "load" });
    await admin.type("input[name=code]", CODE);
    await admin.type("input[name=name]", "Seller");
    await admin.type("input[name=email]", "seller@enyo.test");
    await admin.type("input[name=password]", "a-long-password");
    await admin.click("button[type=submit]");
    if (!(await until(() => new URL(admin.url()).pathname === "/admin", 20000))) throw new Error("seller setup failed");
    await admin.type("input[maxlength='60']", "Chez Accra Group");
    await admin.focus("input[maxlength='32']");
    await admin.keyboard.down("Control");
    await admin.keyboard.press("KeyA");
    await admin.keyboard.up("Control");
    await admin.keyboard.press("Backspace");
    await admin.type("input[maxlength='32']", "chez");
    await click(admin, "Add client");
    await admin.waitForFunction(() => !!document.querySelector("[data-setup-link]"), { timeout: 10000 });
    const link = (await admin.$eval("[data-setup-link]", (c) => c.textContent.trim())).replace(/^https?:\/\/[^/]+/, online.url);

    const owner = await device(browser);
    await owner.goto(link, { waitUntil: "load" });
    await click(owner, "Connect our restaurant computer");
    await owner.waitForFunction(() => !!document.querySelector("[data-sync-key]"), { timeout: 10000 });
    const address = await owner.$eval("[data-sync-address]", (c) => c.textContent.trim());
    const key = await owner.$eval("[data-sync-key]", (c) => c.textContent.trim());
    check("an online client can pair with its existing restaurant computer", address === `${online.url}/c/chez` && /^enyos_[\w-]{43}$/.test(key), address);

    // --- The restaurant's head office connects
    const hq = await device(browser);
    await hqSignIn(hq, `${local.url}/hq`);
    await hq.type("input[name=url]", address);
    await hq.type("input[name=key]", key);
    await click(hq, "Connect", "section[aria-labelledby=online]");
    check("the restaurant computer connects", !!(await until(async () => (await text(hq)).includes(`Connected to ${address}`), 30000)));

    // The business comes across: both branches, staff and head office sign-in
    const visitor = await device(browser);
    check(
      "the business, both branches and their staff arrive online",
      !!(await until(async () => {
        await visitor.goto(`${online.url}/c/chez/login`, { waitUntil: "load" });
        const t = await text(visitor);
        return t.includes("Chez Accra Osu") && t.includes("Chez Accra Mall");
      }))
    );
    const onlineHq = await device(browser);
    await hqSignIn(onlineHq, `${online.url}/c/chez/hq`);
    check("head office signs in online with the same email and password", (await text(onlineHq)).includes("Chez Accra Group"));
    check("…and sees the restaurant computer in step", (await text(onlineHq)).includes("In step with the restaurant's main computer"));
    await admin.reload({ waitUntil: "load" });
    check("the seller sees when the restaurant computer last synced", (await admin.$eval("[data-client='chez']", (li) => li.innerText)).includes("Restaurant computer: last contact"));

    // --- Trading on both sides
    const localOsu = `${local.url}/b/osu`;
    const onlineOsu = `${online.url}/c/chez/b/osu`;
    const tillHere = await device(browser);
    await pin(tillHere, localOsu, "Efua M.", "4444");
    const tillOnline = await device(browser);
    await pin(tillOnline, onlineOsu, "Efua M.", "4444");
    check("staff sign in online with the same PIN", new URL(tillOnline.url()).pathname === "/c/chez/b/osu/order", tillOnline.url());

    const a = await takeOrder(tillHere, localOsu, "Jollof rice with chicken");
    check("an order taken at the restaurant shows online", !!(await until(() => openOrdersInclude(tillOnline, onlineOsu, a))), a);
    const w = await takeOrder(tillOnline, onlineOsu, "Kelewele");
    check("orders taken online are numbered W…", w === "W1001", w);
    check("…and show at the restaurant", !!(await until(() => openOrdersInclude(tillHere, localOsu, w))));

    // --- ENYO Online down: the restaurant carries on, then catches up
    online.stop();
    const b = await takeOrder(tillHere, localOsu, "Sobolo");
    const c = await takeOrder(tillHere, localOsu, "Beef suya", { pay: true });
    check("the restaurant keeps trading while ENYO Online is down", b === "1002" && c === "1003", `${b} ${c}`);
    check(
      "…and shows the changes waiting and why",
      !!(await until(async () => {
        await hq.reload({ waitUntil: "load" });
        const waiting = Number(await hq.$eval("[data-sync-waiting]", (d) => d.textContent));
        return waiting > 0 && (await text(hq)).includes("Can't reach ENYO Online");
      }))
    );
    online = await startServer(onlinePort, ONLINE);
    check(
      "when ENYO Online is back, everything is sent",
      !!(await until(async () => {
        await hq.reload({ waitUntil: "load" });
        return (await hq.$eval("[data-sync-waiting]", (d) => d.textContent)) === "0" && !(await text(hq)).includes("Can't reach");
      }, 40000))
    );
    check("…and the order shows online", !!(await until(() => openOrdersInclude(tillOnline, onlineOsu, b))));

    // --- The restaurant computer down: its tills and kitchen screen switch to ENYO Online, then back
    await tillHere.goto(`${localOsu}/order`, { waitUntil: "load" });
    const kitchen = await device(browser);
    await pin(kitchen, localOsu, "Yaw D.", "6666");
    local.stop();
    const offer = await until(async () => {
      const t = await tillHere.$eval("[role=alert]", (a) => a.innerText).catch(() => "");
      return /main computer is offline/.test(t) ? t : false;
    }, 20000);
    check("a till offers ENYO Online when the main computer stops answering", !!offer, offer);
    const kitchenLink = await until(() => kitchen.$eval("[role=alert] a", (a) => a.getAttribute("href")).catch(() => null), 20000);
    check("…so does the kitchen screen, for its own screen online", kitchenLink === `${onlineOsu}/kitchen`, kitchenLink);
    await Promise.all([tillHere.waitForNavigation({ waitUntil: "load" }).catch(() => {}), click(tillHere, "Continue online")]);
    check("Continue online opens the same branch on ENYO Online", tillHere.url().startsWith(onlineOsu), tillHere.url());
    await pin(tillHere, onlineOsu, "Efua M.", "4444");
    const w2 = await takeOrder(tillHere, onlineOsu, "Waakye special", { pay: true });
    check("ENYO Online keeps trading while the restaurant computer is off", w2 === "W1002", w2);
    await tillHere.goto(`${onlineOsu}/order`, { waitUntil: "load" });
    local = await startServer(localPort, LOCAL);
    const back = await until(async () => {
      const t = await tillHere.$eval("[role=status]", (s) => s.innerText).catch(() => "");
      return /main computer is back/.test(t) ? t : false;
    }, 40000);
    check("ENYO Online says when the main computer is back", !!back, back);
    await Promise.all([tillHere.waitForNavigation({ waitUntil: "load" }).catch(() => {}), click(tillHere, "Switch back")]);
    check("Switch back returns to the same screen on the main computer, still signed in", tillHere.url() === `${localOsu}/order`, tillHere.url());
    const localDb = path.join(localDir, "branches", "chez-accra", "enyo.db");
    check(
      "when the restaurant computer is back, it collects what was done online",
      !!(await until(() => {
        const db = new Database(localDb, { readonly: true });
        try {
          return db.prepare("SELECT status FROM orders WHERE number = 501002").get()?.status === "paid";
        } finally {
          db.close();
        }
      }, 40000))
    );

    // --- Both sides hold exactly the same data
    const businessId = fs.readdirSync(path.join(onlineDir, "businesses"))[0];
    for (const [branchId, label] of [["chez-accra", "Osu"], ["chez-accra-mall", "Accra Mall"]]) {
      const here = path.join(localDir, "branches", branchId, "enyo.db");
      const there = path.join(onlineDir, "businesses", businessId, "branches", branchId, "enyo.db");
      const same = await until(() => snapshot(here) === snapshot(there), 30000);
      check(`${label}: both sides hold exactly the same orders, payments, menu and staff`, !!same);
    }
    await onlineHq.screenshot({ path: path.join(OUT, "sync-online-hq.png"), fullPage: true });
  } finally {
    await browser.close();
    local.stop();
    online.stop();
    await sleep(500);
    for (const d of [localDir, onlineDir]) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
