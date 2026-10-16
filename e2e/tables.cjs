// Phase 10 floor plan checks: statuses and live updates across tills, the
// table panel (start an order, print bill, move, change server, reserve, take
// payment), one order per table, and arrange mode. Run through
// `npm run test:e2e` (node e2e/run.mjs), which passes <branchUrl> <outDir>.
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
  page.on("console", (m) => ["error", "warn", "warning"].includes(m.type()) && page.problems.push(m.text()));
  page.on("pageerror", (e) => page.problems.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.setViewport(viewport);
  return page;
}
async function signIn(page, name, pin) {
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.evaluate((n) => [...document.querySelectorAll("button[aria-pressed]")].find((b) => b.textContent.includes(n)).click(), name);
  await sleep(150);
  await page.keyboard.type(pin);
  await page.waitForFunction(() => location.pathname !== "/login", { timeout: 10000 });
  await sleep(400);
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
const waitFor = (page, fn, arg, timeout = 10000) => page.waitForFunction(fn, { timeout, polling: 100 }, arg).then(() => true, () => false);
/** A table button's text, which is its accessible name, e.g. "T4, Eating, order #1001, 3 guests, 0 min". */
const tableText = (page, label) => page.$eval(`[data-table="${label}"]`, (b) => b.textContent).catch(() => null);
const waitStatus = (page, label, status, timeout = 10000) =>
  waitFor(page, ([l, s]) => document.querySelector(`[data-table="${l}"]`)?.textContent.startsWith(`${l}, ${s}`), [label, status], timeout);
async function openTable(page, label) {
  await page.click(`[data-table="${label}"]`);
  await waitFor(page, () => !!document.querySelector("dialog[open]"));
  await sleep(150);
}
async function selectOption(page, selector, startsWith) {
  const value = await page.$eval(selector, (s, t) => [...s.options].find((o) => o.textContent.startsWith(t))?.value, startsWith);
  await page.select(selector, value);
}
async function tapDish(page, name) {
  await page.evaluate((n) => [...document.querySelectorAll("section ul.grid button")].find((b) => b.textContent.includes(n)).click(), name);
  await sleep(120);
}
const dialogText = (page) => page.$eval("dialog[open]", (d) => d.innerText.replace(/\s+/g, " ")).catch(() => "");

(async () => {
  const browser = await launch();

  // --- The floor plan, as the cashier sees it
  const till = await device(browser);
  await signIn(till, "Efua M.", "4444");
  await till.goto(`${BASE}/tables`, { waitUntil: "load" });
  check("Tables is in the till's menu and opens the floor plan", (await till.$eval("nav[aria-label=Till] a[aria-current=page]", (a) => a.textContent.trim()).catch(() => "")) === "Tables");
  const legend = await till.$eval("[aria-label=Legend]", (l) => l.innerText.replace(/\s+/g, " "));
  check("legend shows all five statuses with counts", legend === "Free 16 Ordering 0 Eating 0 Waiting to pay 0 Reserved 0", legend);
  const areas = await till.$$eval("[aria-label=Areas] button", (b) => b.map((x) => x.textContent.replace(/\d+$/, "").trim()));
  check("areas: Main hall, Terrace, Bar", areas.join(",") === "Main hall,Terrace,Bar", areas.join(","));
  check("Main hall shows T1–T8", (await till.$$eval("[data-table]", (t) => t.map((x) => x.dataset.table))).join(",") === "T1,T2,T3,T4,T5,T6,T7,T8");
  check("cashiers can't arrange the floor plan", !(await till.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Arrange"))));
  await till.screenshot({ path: path.join(OUT, "tables-free.png") });

  // A second till watching the floor plan
  const watch = await device(browser);
  await signIn(watch, "Kwame B.", "2222");
  await watch.goto(`${BASE}/tables`, { waitUntil: "load" });

  // --- Start an order from a free table
  await openTable(till, "T4");
  check("a free table's panel offers an order and a reservation", (await dialogText(till)).includes("T4 · Free") && (await dialogText(till)).includes("Start an order") && (await dialogText(till)).includes("Reserve this table"));
  await click(till, "Start an order", "dialog[open]");
  await till.waitForFunction(() => location.pathname === "/order", { timeout: 10000 });
  await sleep(500);
  const picked = await till.$eval("aside select[name=table]", (s) => s.options[s.selectedIndex].textContent);
  check("the order screen opens as dine-in at T4", picked.startsWith("T4 ·") && (await till.$eval("aside [role=radio][aria-checked=true]", (b) => b.textContent)) === "Dine-in", picked);
  await till.type("aside input[name=guests]", "3");
  await tapDish(till, "Jollof rice with chicken");
  await tapDish(till, "Sobolo");
  await click(till, "Hold", "aside");
  await sleep(1200);
  check("held: the other till shows T4 Ordering, live", await waitStatus(watch, "T4", "Ordering"));
  check("…with its guests", ((await tableText(watch, "T4")) ?? "").includes("3 guests"), await tableText(watch, "T4"));

  // One order per table: T4 can't be picked for a new order
  await tapDish(till, "Kelewele");
  await click(till, "Dine-in", "aside");
  const t4InUse = await waitFor(till, () => {
    const option = [...(document.querySelector("aside select[name=table]")?.options ?? [])].find((o) => o.textContent.startsWith("T4 ·"));
    return option?.disabled && option.textContent.includes("in use");
  });
  check("a table with an order open can't be picked for another", t4InUse);
  await click(till, "New");
  await sleep(200);

  // Opening T4 from the floor plan goes to its order; sending makes it Eating
  await till.goto(`${BASE}/tables`, { waitUntil: "load" });
  await openTable(till, "T4");
  await click(till, "Add items", "dialog[open]");
  await till.waitForFunction(() => location.search.startsWith("?open="), { timeout: 10000 });
  await sleep(500);
  check("Add items opens T4's order", (await till.$eval("#order-title", (h) => h.textContent)) === "Order #1001");
  await tapDish(till, "Kelewele");
  await click(till, "Send to kitchen", "aside");
  check("sent: the other till shows T4 Eating", await waitStatus(watch, "T4", "Eating"));

  // --- Print bill → waiting to pay
  await till.goto(`${BASE}/tables`, { waitUntil: "load" });
  await openTable(till, "T4");
  await click(till, "Print bill", "dialog[open]");
  await till.waitForFunction(() => location.pathname.startsWith("/receipt/"), { timeout: 10000 });
  await sleep(500);
  check("Print bill opens the bill", (await till.evaluate(() => document.body.innerText)).includes("BILL"));
  check("…and T4 is waiting to pay", await waitStatus(watch, "T4", "Waiting to pay"));
  await click(till, "Back");
  await till.waitForFunction(() => location.pathname === "/tables", { timeout: 10000 });
  check("the bill's Back returns to the floor plan", true);

  // --- Move table and change server
  await openTable(till, "T4");
  check("an occupied table's panel shows the order", /Order #1001 Server Efua M\. Guests 3/.test(await dialogText(till)), await dialogText(till));
  await selectOption(till, "dialog[open] select[id$='-move']", "T10");
  await click(till, "Move", "dialog[open]");
  await sleep(1000);
  check("moving frees T4", await waitStatus(watch, "T4", "Free"));
  await click(watch, "Terrace", "[aria-label=Areas]");
  check("…and T10 on the Terrace takes the order, still waiting to pay", await waitStatus(watch, "T10", "Waiting to pay"));
  await click(till, "Terrace", "[aria-label=Areas]");
  await openTable(till, "T10");
  await selectOption(till, "dialog[open] select[id$='-server']", "Kofi A.");
  await click(till, "Change server", "dialog[open]");
  await waitFor(till, () => /Server\s+Kofi A\./.test(document.querySelector("dialog[open] dl")?.innerText ?? ""));
  check("changing the server shows at once", /Server Kofi A\./.test(await dialogText(till)), await dialogText(till));

  // --- Take payment frees the table
  await click(till, "Take payment", "dialog[open]");
  await till.waitForFunction(() => location.pathname.startsWith("/pay/"), { timeout: 10000 });
  await sleep(700);
  await click(till, "Card", "[aria-label='Payment method']");
  await click(till, "Take GH₵");
  await till.waitForFunction(() => document.body.innerText.includes("Paid in full"), { timeout: 10000 });
  check("paying in full frees T10", await waitStatus(watch, "T10", "Free"));

  // --- Reservations
  await till.goto(`${BASE}/tables`, { waitUntil: "load" });
  await openTable(till, "T1");
  await fill(till, "dialog[open] input[type=time]", "1930");
  await till.type("dialog[open] input[placeholder^='e.g. Mensah']", "Mensah, 4");
  await click(till, "Reserve", "dialog[open]");
  await click(watch, "Main hall", "[aria-label=Areas]");
  check("reserving marks the table, with its time", await waitStatus(watch, "T1", "Reserved"));
  check("…shown on the plan", ((await watch.$eval('[data-table="T1"]', (b) => b.innerText)) ?? "").includes("Reserved 19:30"));
  check("…and in its panel", await waitFor(till, () => document.querySelector("dialog[open]")?.innerText.includes("Reserved at 19:30 · Mensah, 4")));
  await click(till, "Seat guests and start an order", "dialog[open]");
  await till.waitForFunction(() => location.pathname === "/order", { timeout: 10000 });
  await sleep(400);
  await tapDish(till, "Sobolo");
  await click(till, "Send to kitchen", "aside");
  check("seating the guests uses up the reservation", await waitStatus(watch, "T1", "Eating"));
  await watch.screenshot({ path: path.join(OUT, "tables-live.png") });

  // --- Arrange mode (manager)
  await watch.goto(`${BASE}/tables`, { waitUntil: "load" });
  await click(watch, "Arrange");
  check("managers can arrange", await waitFor(watch, () => document.querySelector("h1")?.textContent === "Arrange tables"));
  await click(watch, "Add table");
  await watch.type("dialog[open] input[placeholder='e.g. T13']", "T13");
  await fill(watch, "dialog[open] input[type=number]", "2");
  await watch.click("dialog[open] input[value=round]");
  await click(watch, "Add table", "dialog[open] form");
  check("a new table appears on the plan", await waitFor(watch, () => !!document.querySelector('[data-table="T13"]')));
  const before = await watch.$eval('[data-table="T13"]', (b) => b.style.left);
  // Drag it onto empty floor near the bottom (onto another table is refused)...
  const box = await (await watch.$('[data-table="T13"]')).boundingBox();
  const cellH = (await watch.$eval('[data-table="T13"]', (b) => b.parentElement.getBoundingClientRect().height)) / 14;
  await watch.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await watch.mouse.down();
  for (let i = 1; i <= 6; i++) await watch.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + (cellH * 9 * i) / 6);
  await watch.mouse.up();
  await sleep(1200);
  // ...then one cell right with the keyboard
  await watch.focus('[data-table="T13"]');
  await watch.keyboard.press("ArrowRight");
  await sleep(1500);
  await watch.reload({ waitUntil: "load" });
  await click(watch, "Arrange");
  const after = await watch.$eval('[data-table="T13"]', (b) => b.textContent);
  check("dragging and arrow keys move it, and it stays put after a reload", after.includes("column 5, row 10"), `${before} → ${after}`);
  await watch.click('[data-table="T13"]');
  await waitFor(watch, () => document.querySelector("dialog[open] h2")?.textContent === "Edit T13");
  await fill(watch, "dialog[open] input[placeholder='e.g. T13']", "Window");
  await click(watch, "Save", "dialog[open]");
  check("tables can be renamed", await waitFor(watch, () => !!document.querySelector('[data-table="Window"]')));
  await watch.click('[data-table="Window"]');
  await waitFor(watch, () => !!document.querySelector("dialog[open]"));
  await click(watch, "Remove table", "dialog[open]");
  check("…and removed", await waitFor(watch, () => !document.querySelector('[data-table="Window"]')));
  await watch.click('[data-table="T1"]');
  await waitFor(watch, () => !!document.querySelector("dialog[open]"));
  await click(watch, "Remove table", "dialog[open]");
  check("a table with an order open can't be removed", await waitFor(watch, () => document.querySelector("dialog[open]")?.innerText.includes("has order #1002 open")));
  await watch.keyboard.press("Escape");
  await click(watch, "Done arranging");

  // --- Phone: a list of tables instead of the plan
  const phone = await device(browser, { width: 390, height: 844, isMobile: true, hasTouch: true });
  await signIn(phone, "Kofi A.", "3333");
  await phone.goto(`${BASE}/tables`, { waitUntil: "load" });
  await sleep(400);
  const cards = await phone.$$eval("[data-table-card]", (b) => b.filter((x) => x.getClientRects().length).map((x) => x.textContent));
  check("phones list the tables as cards", cards.length === 8 && cards[0].startsWith("T1, Eating"), cards.slice(0, 2).join(" | "));
  check("phone: no sideways scroll", await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await phone.screenshot({ path: path.join(OUT, "tables-phone.png") });

  const problems = [...till.problems, ...watch.problems, ...phone.problems].filter((p) => !p.startsWith("Failed to load resource"));
  check("no console errors or hydration warnings", problems.length === 0, problems.join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
