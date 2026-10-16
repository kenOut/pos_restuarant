// Phase 5 kitchen + live update checks. Run through `npm run test:e2e` (node e2e/run.mjs), which passes <baseUrl> <outDir> <dbPath>.
const path = require("path");
const { launch } = require("./lib.cjs");
const [BASE, OUT, DB_PATH] = process.argv.slice(2);
const Database = require("better-sqlite3");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Dine-in: choose a floor plan table by its name in the ticket's table list. */
async function pickTable(page, label) {
  const value = await page.$eval("aside select[name=table]", (s, l) => [...s.options].find((o) => o.textContent.startsWith(`${l} ·`))?.value, label);
  await page.select("aside select[name=table]", value);
}
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

async function device(browser, viewport) {
  const page = await (await browser.createBrowserContext()).newPage();
  page.problems = [];
  page.on("console", (m) => ["error", "warn", "warning"].includes(m.type()) && page.problems.push(m.text()));
  page.on("pageerror", (e) => page.problems.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.setViewport(viewport);
  return page;
}
async function signIn(page, name, pin, landing) {
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.evaluate((n) => [...document.querySelectorAll("button[aria-pressed]")].find((b) => b.textContent.includes(n)).click(), name);
  await sleep(150);
  await page.keyboard.type(pin);
  await page.waitForFunction((l) => location.pathname === l, { timeout: 10000 }, landing);
  await sleep(800);
}
const click = (page, text, root = "body") =>
  page.evaluate(
    (t, r) => {
      const b = [...document.querySelector(r).querySelectorAll("button")].find(
        (x) => x.getClientRects().length > 0 && x.textContent.trim().startsWith(t) && !x.disabled
      );
      if (!b) throw new Error(`no enabled button "${t}"`);
      b.click();
    },
    text,
    root
  );
const tapDish = (page, name, times = 1) =>
  page.evaluate(
    (n, t) => {
      const b = [...document.querySelectorAll("section ul.grid button")].find((x) => x.querySelector("span")?.textContent === n);
      for (let i = 0; i < t; i++) b.click();
    },
    name,
    times
  );
const cards = (page) =>
  page.$$eval("[data-ticket]", (els) => els.map((el) => ({ text: el.innerText.replace(/\s+/g, " "), header: el.firstElementChild.className })));
const readyStrip = (page) =>
  page.evaluate(() => [...document.querySelectorAll("[data-ready-chip]")].map((b) => b.innerText.replace(/\s+/g, " ")));
const kitchenBadge = (page) =>
  page.evaluate(() => {
    const link = [...document.querySelectorAll("nav[aria-label=Till] a")].find((a) => a.getClientRects().length && a.textContent.includes("Kitchen"));
    return link?.querySelector("span[aria-hidden=true]")?.textContent ?? null;
  });
async function openOrdersRow(page, number) {
  await click(page, "Open orders");
  await sleep(400);
  const row = await page.evaluate(
    (n) =>
      [...document.querySelectorAll("dialog[aria-labelledby=open-orders-title] li")]
        .map((l) => l.innerText.replace(/\s+/g, " "))
        .find((t) => t.includes(`#${n}`)),
    number
  );
  await page.keyboard.press("Escape");
  await sleep(200);
  return row ?? "";
}
const waitFor = (page, fn, arg, timeout = 4000) => page.waitForFunction(fn, { timeout, polling: 50 }, arg).then(() => true, () => false);

(async () => {
  const browser = await launch();

  // Signed-out visitors can't open the live stream
  const anon = await fetch(`${BASE}/api/events`);
  check("live stream refuses signed-out visitors", anon.status === 401, `${anon.status}`);

  const kitchen = await device(browser, { width: 1366, height: 860 });
  await signIn(kitchen, "Yaw D.", "6666", "/kitchen");
  check("empty board message", (await kitchen.content()).includes("No tickets right now."));
  check(
    "Recall last disabled on an empty board",
    await kitchen.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Recall last")).disabled)
  );

  const till = await device(browser, { width: 1366, height: 900 });
  await signIn(till, "Efua M.", "4444", "/order");

  // Cashier sends the deck's dine-in order
  await tapDish(till, "Jollof rice with chicken", 2);
  await tapDish(till, "Banku and tilapia");
  await tapDish(till, "Sobolo", 2);
  await till.evaluate(() => {
    const li = [...document.querySelectorAll("aside li")].find((l) => l.textContent.includes("Banku and tilapia"));
    [...li.querySelectorAll("button")].find((b) => b.textContent.includes("Note")).click();
  });
  await sleep(150);
  await click(till, "Extra pepper", "aside");
  await click(till, "Done", "aside");
  await click(till, "Dine-in", "aside");
  await pickTable(till, "T7");
  const sentAt = Date.now();
  await click(till, "Send to kitchen", "aside");

  // …and it appears on the kitchen screen without a reload
  const arrived = await waitFor(kitchen, () => !!document.querySelector("[data-ticket]"), null, 5000);
  const latency = Date.now() - sentAt;
  check("ticket appears on the kitchen screen live (no reload), within 2 s", arrived && latency < 2000, `${latency} ms`);
  let [card] = await cards(kitchen);
  check("ticket shows number, table, type and server", card?.text.includes("#1001") && card?.text.includes("Table T7 · Dine-in · Efua M."), card?.text);
  check("ticket lists items and the note", card?.text.includes("2× Jollof rice with chicken") && card?.text.includes("Extra pepper") && card?.text.includes("2× Sobolo"));
  check("timer is running", /#1001 \d\d:\d\d/.test(card?.text ?? ""), card?.text.slice(0, 20));
  check("new ticket header is green (under 10 min)", card?.header.includes("bg-eating-soft"));
  await sleep(500);
  check("till shows 1 on the Kitchen badge", (await kitchenBadge(till)) === "1", String(await kitchenBadge(till)));
  check("till's open orders: Sent to kitchen", (await openOrdersRow(till, 1001)).includes("Sent to kitchen"));

  // Station filters
  await click(kitchen, "Bar", "[aria-label=Station]");
  await sleep(200);
  [card] = await cards(kitchen);
  check("Bar filter shows only the drinks", card?.text.includes("Sobolo") && !card?.text.includes("Jollof"), card?.text);
  await click(kitchen, "Fryer", "[aria-label=Station]");
  await sleep(200);
  check("Fryer filter: nothing for Fryer", (await cards(kitchen)).length === 0 && (await kitchen.content()).includes("Nothing for Fryer right now."));
  await click(kitchen, "All stations", "[aria-label=Station]");
  await sleep(200);

  // Start → cooking, seen on the till
  await click(kitchen, "Start", "[data-ticket]");
  await waitFor(kitchen, () => document.querySelector("[data-ticket]")?.innerText.includes("Cooking"));
  check("Start marks the ticket Cooking", (await cards(kitchen))[0]?.text.includes("Cooking"));
  await sleep(600);
  check("till sees Cooking", (await openOrdersRow(till, 1001)).includes("Cooking"));

  // Bump → ready strip + toast on the till
  const bumpedAt = Date.now();
  await kitchen.click("[data-ticket] button[aria-label^='Bump']");
  const toast = await waitFor(till, () => document.querySelector("[role=status]")?.textContent.includes("is ready"), null, 5000);
  const toastMs = Date.now() - bumpedAt;
  const toastText = await till.evaluate(() => document.querySelector("[role=status]")?.textContent.trim());
  check("till gets 'Order #1001 is ready · Table T7' within 2 s", toast && toastText === "Order #1001 is ready · Table T7" && toastMs < 2000, `${toastText}, ${toastMs} ms`);
  await waitFor(kitchen, () => !document.querySelector("[data-ticket]"));
  check("bumped ticket leaves the board", (await cards(kitchen)).length === 0);
  const strip = await readyStrip(kitchen);
  check("ready strip shows #1001 · Table T7", strip.length === 1 && strip[0].startsWith("#1001 · Table T7"), strip.join(" | "));
  check("till's open orders: Ready to serve", (await openOrdersRow(till, 1001)).includes("Ready to serve"));
  check("Kitchen badge clears on the till", (await kitchenBadge(till)) === null);

  // Recall last
  await click(kitchen, "Recall last");
  await waitFor(kitchen, () => !!document.querySelector("[data-ticket]"));
  [card] = await cards(kitchen);
  check("Recall last brings it back as Cooking", card?.text.includes("#1001") && card?.text.includes("Cooking"));
  check("…and takes it off the ready strip", (await readyStrip(kitchen)).length === 0);
  await kitchen.click("[data-ticket] button[aria-label^='Bump']");
  await waitFor(kitchen, () => document.querySelectorAll("[data-ready-chip]").length === 1);

  // Served
  await kitchen.click("[data-ready-chip]");
  await waitFor(kitchen, () => document.querySelectorAll("[data-ready-chip]").length === 0);
  check("tapping a ready chip marks it served", (await readyStrip(kitchen)).length === 0);
  await sleep(500);
  check("till's open orders: Served", (await openOrdersRow(till, 1001)).includes("Served"));

  // Timer colours: three more tickets, two of them aged 16 and 12 minutes
  for (const [dish, table] of [
    ["Kelewele", "T2"],
    ["Beef suya", "T5"],
    ["Waakye special", "T9"],
  ]) {
    await tapDish(till, dish);
    await click(till, "Dine-in", "aside");
    await pickTable(till, table);
    await click(till, "Send to kitchen", "aside");
    await waitFor(till, () => document.querySelector("#order-title")?.textContent === "New order");
    await sleep(400);
  }
  await waitFor(kitchen, () => document.querySelectorAll("[data-ticket]").length === 3);
  const db = new Database(DB_PATH);
  const age = (number, minutes) =>
    db
      .prepare("update kitchen_tickets set created_at = ? where order_id = (select id from orders where number = ?)")
      .run(Date.now() - minutes * 60_000, number);
  age(1002, 16);
  age(1003, 12);
  db.close();
  await kitchen.reload({ waitUntil: "load" });
  await sleep(1500);
  const colours = (await cards(kitchen)).map((c) => [
    c.text.slice(0, 5),
    c.header.includes("bg-late") ? "red" : c.header.includes("bg-amber-soft") ? "amber" : "green",
  ]);
  check(
    "oldest first; 16 min red, 12 min amber, new green",
    JSON.stringify(colours) === JSON.stringify([["#1002", "red"], ["#1003", "amber"], ["#1004", "green"]]),
    JSON.stringify(colours)
  );
  check("header shows open count and average", /3 open · average \d+ min/.test(await kitchen.evaluate(() => document.querySelector("header").innerText)));
  await kitchen.screenshot({ path: path.join(OUT, "kitchen-desktop.png") });

  // Kitchen on a phone
  const phone = await device(browser, { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await signIn(phone, "Akosua T.", "7777", "/kitchen");
  check("phone kitchen: no sideways scroll", await phone.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await phone.screenshot({ path: path.join(OUT, "kitchen-phone.png") });

  const problems = [kitchen, till, phone].flatMap((p) => p.problems);
  check("no console errors or hydration warnings", problems.length === 0, problems.join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
