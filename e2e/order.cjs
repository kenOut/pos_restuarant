// Phase 4 order screen checks. Run through `npm run test:e2e` (node e2e/run.mjs), which passes <baseUrl> <outDir>.
const path = require("path");
const { launch } = require("./lib.cjs");
const [BASE, OUT] = process.argv.slice(2);
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

async function newTill(browser, viewport) {
  const page = await (await browser.createBrowserContext()).newPage();
  page.problems = [];
  page.on("console", (m) => ["error", "warn", "warning"].includes(m.type()) && page.problems.push(m.text()));
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
  await page.waitForFunction(() => location.pathname === "/order", { timeout: 10000 });
  await sleep(600);
}
// Menu cards: the first span holds the dish name.
const tapDish = (page, name, times = 1) =>
  page.evaluate(
    (n, t) => {
      const b = [...document.querySelectorAll("section ul.grid button")].find((x) => x.querySelector("span")?.textContent === n);
      for (let i = 0; i < t; i++) b.click();
    },
    name,
    times
  );
const clickText = (page, text, root = "body") =>
  page.evaluate(
    (t, r) => {
      const b = [...document.querySelector(r).querySelectorAll("button")].find((x) => x.getClientRects().length > 0 && x.textContent.trim().startsWith(t));
      if (!b) throw new Error(`no button "${t}"`);
      b.click();
    },
    text,
    root
  );
const title = (page) => page.$eval("#order-title", (h) => h.textContent.trim());
const ticketText = (page) => page.$eval("aside", (a) => a.innerText);
const badges = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll("section ul.grid button")]
        .map((b) => [b.querySelector("span").textContent, b.querySelector("span[aria-hidden=true]")?.textContent])
        .filter(([, q]) => q)
    )
  );
const toastText = async (page) => {
  await page.waitForSelector("[role=status]", { timeout: 8000 }).catch(() => {});
  return page.evaluate(() => document.querySelector("[role=status]")?.textContent.trim() ?? "");
};
const waitToastGone = (page) => page.waitForFunction(() => !document.querySelector("[role=status]"), { timeout: 8000 }).catch(() => {});

(async () => {
  const browser = await launch();

  // ---------- Cashier on a tablet in landscape
  const till = await newTill(browser, { width: 1366, height: 900 });
  await signIn(till, "Efua M.", "4444");
  check("starts as a new order", (await title(till)) === "New order");
  const cards = await till.$$eval("section ul.grid button", (b) => b.map((x) => ({ name: x.querySelector("span").textContent, disabled: x.disabled })));
  check("shows the 16-item menu", cards.length === 16, `${cards.length}`);
  check("Pineapple sorbet is sold out and can't be tapped", cards.find((c) => c.name === "Pineapple sorbet")?.disabled === true);

  // The deck's order #1926
  await tapDish(till, "Jollof rice with chicken", 2);
  await tapDish(till, "Banku and tilapia");
  await tapDish(till, "Sobolo", 2);
  await tapDish(till, "Pineapple sorbet");
  await sleep(300);
  check("badges show quantities", JSON.stringify(await badges(till)) === JSON.stringify({ "Jollof rice with chicken": "2", "Banku and tilapia": "1", Sobolo: "2" }), JSON.stringify(await badges(till)));
  let ticket = await ticketText(till);
  check("ticket total GH₵ 408.00 with VAT 51.00, NHIL 8.50, GETFund 8.50", ticket.includes("GH₵ 408.00") && ticket.includes("GH₵ 51.00") && (ticket.match(/GH₵ 8\.50/g) || []).length >= 2);
  check("Send to kitchen counts 5 items", ticket.includes("Send to kitchen (5)"));
  await till.screenshot({ path: path.join(OUT, "order-desktop.png") });

  // Search and categories
  await till.type("input[type=search]", "suya");
  await sleep(200);
  let names = await till.$$eval("section ul.grid button", (b) => b.map((x) => x.querySelector("span").textContent));
  check("search finds Beef suya only", names.join() === "Beef suya", names.join());
  await till.click("input[type=search]", { clickCount: 3 });
  await till.keyboard.press("Backspace");
  await clickText(till, "Drinks", "nav[aria-label=Categories]");
  await sleep(200);
  names = await till.$$eval("section ul.grid button", (b) => b.map((x) => x.querySelector("span").textContent));
  check("Drinks shows the 5 drinks", names.length === 5 && names.includes("Sobolo"), names.join());
  await clickText(till, "All", "nav[aria-label=Categories]");

  // Note with a quick chip
  await till.evaluate(() => {
    const li = [...document.querySelectorAll("aside li")].find((l) => l.textContent.includes("Banku and tilapia"));
    [...li.querySelectorAll("button")].find((b) => b.textContent.includes("Note")).click();
  });
  await sleep(200);
  await clickText(till, "Extra pepper", "aside");
  await clickText(till, "Done", "aside");
  await sleep(200);
  check("note added from a quick chip", (await ticketText(till)).includes("Extra pepper"));

  // Dine-in needs a table
  await clickText(till, "Dine-in", "aside");
  await clickText(till, "Send to kitchen", "aside");
  await sleep(1200);
  check("dine-in without a table is refused", (await ticketText(till)).includes("Choose a table for dine-in."));
  await pickTable(till, "T7");
  await clickText(till, "Send to kitchen", "aside");
  check("send confirms with order number and count", (await toastText(till)) === "Order #1001 sent to the kitchen · 5 items", await toastText(till));
  await sleep(300);
  check("ticket clears for the next order", (await title(till)) === "New order" && Object.keys(await badges(till)).length === 0);
  await waitToastGone(till);

  // Reopen, add, hold (hold and fire)
  await clickText(till, "Open orders");
  await sleep(400);
  let rows = await till.$$eval("dialog[aria-labelledby=open-orders-title] li", (l) => l.map((x) => x.innerText.replace(/\s+/g, " ")));
  check("open orders lists #1001 as Sent to kitchen, GH₵ 408.00", rows.length === 1 && rows[0].includes("#1001") && rows[0].includes("Sent to kitchen") && rows[0].includes("Table T7") && rows[0].includes("GH₵ 408.00"), rows.join(" | "));
  await clickText(till, "#1001", "dialog[aria-labelledby=open-orders-title]");
  await till.waitForFunction(() => document.querySelector("#order-title").textContent.includes("#1001"), { timeout: 8000 }).catch(() => {});
  ticket = await ticketText(till);
  check("reopened order shows its sent lines, locked", (await title(till)) === "Order #1001" && (ticket.match(/Sent \d\d:\d\d/g) || []).length === 3, `${(ticket.match(/Sent \d\d:\d\d/g) || []).length} sent`);
  check("nothing new to send yet", ticket.includes("Send to kitchen") && !ticket.includes("Send to kitchen ("));
  await tapDish(till, "Kelewele");
  await clickText(till, "Hold", "aside");
  check("adding to a sent order and holding", (await toastText(till)) === "Order #1001 held", await toastText(till));
  await waitToastGone(till);
  await clickText(till, "Open orders");
  await sleep(400);
  rows = await till.$$eval("dialog[aria-labelledby=open-orders-title] li", (l) => l.map((x) => x.innerText.replace(/\s+/g, " ")));
  check("held items show as 'Items waiting'", rows[0]?.includes("Items waiting") && rows[0]?.includes("6 items"), rows[0]);
  await till.keyboard.press("Escape");

  // A second order
  await tapDish(till, "Sobolo");
  await clickText(till, "Hold", "aside");
  check("next order is #1002", (await toastText(till)) === "Order #1002 held", await toastText(till));
  await waitToastGone(till);

  // ---------- Two tills, same order
  const other = await newTill(browser, { width: 1366, height: 900 });
  await signIn(other, "Kwame B.", "2222");
  for (const page of [till, other]) {
    await clickText(page, "Open orders");
    await sleep(400);
    await clickText(page, "#1002", "dialog[aria-labelledby=open-orders-title]");
    await page.waitForFunction(() => document.querySelector("#order-title").textContent.includes("#1002"), { timeout: 8000 });
  }
  await tapDish(till, "Malt drink");
  await clickText(till, "Hold", "aside");
  await toastText(till);
  await tapDish(other, "Bottled water");
  await clickText(other, "Hold", "aside");
  await sleep(1500);
  check("second till's stale save is refused", (await ticketText(other)).includes("changed on another till"));

  // ---------- Kitchen staff can't reach the order screen or its actions
  const cook = await newTill(browser, { width: 1280, height: 800 });
  await cook.goto(`${BASE}/login`, { waitUntil: "load" });
  await cook.evaluate(() => [...document.querySelectorAll("button[aria-pressed]")].find((b) => b.textContent.includes("Yaw D.")).click());
  await sleep(150);
  await cook.keyboard.type("6666");
  await cook.waitForFunction(() => location.pathname === "/kitchen", { timeout: 10000 });
  await cook.goto(`${BASE}/order`, { waitUntil: "load" });
  check("kitchen staff are sent away from /order", cook.url().endsWith("/kitchen"));

  // ---------- Server on a phone
  const phone = await newTill(browser, { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await signIn(phone, "Kofi A.", "3333");
  await tapDish(phone, "Kelewele");
  await tapDish(phone, "Chicken wings", 2);
  await sleep(300);
  const bar = await phone.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.startsWith("View order"))?.innerText.replace(/\s+/g, " "));
  check("phone bar: View order · 3 items GH₵ 174.01 (the deck's phone order)", bar === "View order · 3 items GH₵ 174.01", bar);
  check("phone: no sideways scroll", await phone.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await phone.screenshot({ path: path.join(OUT, "order-phone.png") });
  await clickText(phone, "View order");
  await sleep(400);
  const sheet = await phone.evaluate(() => {
    const a = document.querySelector("aside");
    const r = a.getBoundingClientRect();
    return { full: r.width >= 389 && r.height >= 840, menuInert: document.querySelector("section").inert };
  });
  check("phone ticket opens full screen and the menu goes inert", sheet.full && sheet.menuInert, JSON.stringify(sheet));
  await phone.screenshot({ path: path.join(OUT, "order-phone-ticket.png") });
  await phone.click("aside button[aria-label='Back to the menu']");
  await sleep(300);
  check("phone ticket closes back to the menu", await phone.evaluate(() => getComputedStyle(document.querySelector("aside")).display === "none"));

  const problems = [till, other, cook, phone].flatMap((p) => p.problems);
  check("no console errors or hydration warnings", problems.length === 0, problems.join(" | "));

  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
