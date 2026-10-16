// Back office and data API checks: PIN sign-in for owners and managers only,
// a session separate from the till's, live order tracking, orders, payments,
// receipts, reports and CSV downloads, API keys, and the read-only API
// (key checks, revocation, paging, receipts, the request limit and browser
// access). Run through `npm run test:e2e` (node e2e/run.mjs), which passes <branchUrl> <outDir>.
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

async function device(browser, viewport = { width: 1366, height: 900 }) {
  const page = await (await browser.createBrowserContext()).newPage();
  page.problems = [];
  page.on("console", (m) => ["error", "warn", "warning"].includes(m.type()) && !m.text().startsWith("Failed to load resource") && page.problems.push(m.text()));
  page.on("pageerror", (e) => page.problems.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.setViewport(viewport);
  return page;
}
async function pin(page, name, digits, landing) {
  await page.evaluate((n) => [...document.querySelectorAll("button[aria-pressed]")].find((b) => b.textContent.includes(n)).click(), name);
  await sleep(150);
  await page.keyboard.type(digits);
  await page.waitForFunction((l) => location.pathname === l, { timeout: 10000 }, landing).catch(() => {});
  await sleep(400);
}
async function click(page, text, root = "body") {
  const find = (t, r) => [...(document.querySelector(r)?.querySelectorAll("button, a") ?? [])].find((x) => x.getClientRects().length > 0 && x.textContent.trim().startsWith(t) && !x.disabled);
  const ready = await page.waitForFunction(find, { timeout: 8000, polling: 100 }, text, root).then(() => true, () => false);
  if (!ready) throw new Error(`no enabled button "${text}" in ${root}`);
  await page.evaluate((t, r, f) => new Function("t", "r", `return (${f})(t, r)`)(t, r).click(), text, root, find.toString());
}
const text = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
const waitText = (page, needle, timeout = 10000) =>
  page.waitForFunction((n) => document.body.innerText.replace(/\s+/g, " ").includes(n), { timeout, polling: 100 }, needle).then(() => true, () => false);
async function audit(page, label) {
  await page.addScriptTag({ path: AXE });
  const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`));
  check(`${label}: no WCAG 2.2 AA violations`, violations.length === 0, violations.join(" | "));
}
const cookieHeader = async (page, url) => (await page.cookies(url)).map((c) => `${c.name}=${c.value}`).join("; ");
const api = (route, key, headers = {}) => fetch(`${BASE}/api/v1${route}`, { headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...headers } });
async function tapDish(page, name) {
  await page.evaluate((n) => [...document.querySelectorAll("section ul.grid button")].find((b) => b.textContent.includes(n)).click(), name);
  await sleep(120);
}

(async () => {
  const browser = await launch();

  // --- Sign-in: owners and managers, with their till PIN
  const office = await device(browser);
  await office.goto(`${BASE}/office`, { waitUntil: "load" });
  check("the back office needs signing in", office.url() === `${BASE}/office/login`, office.url());
  const tiles = await office.$$eval("button[aria-pressed]", (b) => b.map((x) => x.textContent));
  check("only owners and managers are offered", tiles.length === 2 && tiles.some((t) => t.includes("Ama Owner")) && tiles.some((t) => t.includes("Kwame B.")), tiles.join(" | "));
  check("it's the till's sign-in screen, marked Back office", (await text(office)).includes("ENYO POS · Back office") && (await text(office)).includes("Who’s signing in?"));
  await audit(office, "Back office sign-in");

  // A till session doesn't open the back office
  const till = await device(browser);
  await till.goto(`${BASE}/login`, { waitUntil: "load" });
  await pin(till, "Efua M.", "4444", "/order");
  await till.goto(`${BASE}/office`, { waitUntil: "load" });
  check("being signed in to the till doesn't open the back office", till.url() === `${BASE}/office/login`, till.url());
  await till.goto(`${BASE}/order`, { waitUntil: "load" });

  await pin(office, "Kwame B.", "0000", "/office");
  check("a wrong PIN is refused", (await text(office)).includes("Wrong PIN"));
  await pin(office, "Kwame B.", "2222", "/office");
  check("the manager's PIN opens the dashboard", office.url() === `${BASE}/office` && (await office.$eval("h1", (h) => h.textContent)) === "Dashboard", office.url());
  const nav = await office.$$eval("nav[aria-label='Back office'] a, nav[aria-label='Back office'] button", (n) => n.filter((x) => x.getClientRects().length).map((x) => x.textContent.trim()));
  check("side menu: Dashboard, Orders, Payments, Reports, Settings, Log out", nav.join(",") === "Dashboard,Orders,Payments,Reports,Settings,Log out", nav.join(","));
  const officeCookie = (await office.cookies(`${BASE}/office`)).find((c) => c.name === "enyo_office");
  check("its cookie is only sent to the back office", officeCookie?.path === "/office" && officeCookie.httpOnly, officeCookie?.path);
  check("the dashboard starts at zero", (await text(office)).includes("Total orders 0") && (await text(office)).includes("No orders open right now."));
  await audit(office, "Dashboard");

  // --- Live order tracking
  await tapDish(till, "Jollof rice with chicken");
  await tapDish(till, "Sobolo");
  await click(till, "Send to kitchen", "aside");
  check("an order sent from a till appears on the dashboard, live", await waitText(office, "#1001"));
  check("…with its kitchen progress and server", await office.$eval("[data-order='1001']", (li) => /Sent/.test(li.innerText) && li.innerText.includes("Efua M.")).catch(() => false));
  check("active orders counts it", (await text(office)).includes("Active orders 1"));
  await office.screenshot({ path: path.join(OUT, "office-dashboard.png"), fullPage: true });

  // Paid on the till: leaves the live list and counts as an order and a payment
  await click(till, "Open orders");
  await sleep(300);
  await till.evaluate(() => [...document.querySelectorAll("dialog[open] button")].find((b) => b.textContent.includes("#1001")).click());
  await sleep(800);
  await click(till, "Pay", "aside");
  await till.waitForFunction(() => location.pathname.startsWith("/pay/"), { timeout: 10000 });
  await sleep(600);
  await click(till, "Card", "[aria-label='Payment method']");
  await click(till, "Take GH₵");
  await till.waitForFunction(() => document.body.innerText.includes("Paid in full"), { timeout: 10000 });
  check("once paid it leaves the live list", await waitText(office, "No orders open right now."));
  await office.reload({ waitUntil: "load" });
  const dash = await text(office);
  check("…and the totals count the order and its payment", dash.includes("Total orders 1") && /Total payments GH₵ \d/.test(dash) && !dash.includes("Total payments GH₵ 0.00"), dash.slice(0, 300));

  // --- Orders, an order, its receipt
  await click(office, "Orders", "nav[aria-label='Back office']");
  await office.waitForFunction(() => location.pathname === "/office/orders", { timeout: 10000 });
  await sleep(300);
  check("orders lists #1001 as paid", /#1001.*Efua M\..*Paid/.test(await text(office)));
  await audit(office, "Orders");
  await office.goto(`${BASE}/office/orders?period=today&status=held`, { waitUntil: "load" });
  check("filters narrow the list", (await text(office)).includes("No orders match."));
  await office.goto(`${BASE}/office/orders`, { waitUntil: "load" });
  await click(office, "#1001", "table");
  await office.waitForFunction(() => /^\/office\/orders\/./.test(location.pathname), { timeout: 10000 });
  await sleep(300);
  const detail = await text(office);
  check("an order shows its items, bill and payment", detail.includes("Jollof rice with chicken") && detail.includes("Sobolo") && detail.includes("Card") && detail.includes("Total"), detail.slice(0, 200));
  await audit(office, "Order");
  await click(office, "Receipt");
  await office.waitForFunction(() => location.pathname.startsWith("/office/receipt/"), { timeout: 10000 });
  check("the receipt opens from the back office", await waitText(office, "RECEIPT"));
  const orderId = office.url().split("/").pop();

  // --- Payments and CSV
  await office.goto(`${BASE}/office/payments`, { waitUntil: "load" });
  check("payments lists the card payment with totals by method", /Card GH₵ [1-9]/.test(await text(office)) && (await text(office)).includes("#1001"));
  await audit(office, "Payments");
  const csv = await fetch(`${BASE}/office/export/payments?period=today`, { headers: { cookie: await cookieHeader(office, `${BASE}/office`) } });
  const body = await csv.text();
  check("payments download as CSV", csv.headers.get("content-type").startsWith("text/csv") && body.includes("Taken,Order,Method") && body.includes("1001,Card"), body.slice(0, 120));
  check("CSV downloads need the back office sign-in", (await fetch(`${BASE}/office/export/orders`)).status === 401);

  // --- Reports
  await office.goto(`${BASE}/office/reports`, { waitUntil: "load" });
  const reports = await office.$$eval("main h2", (h) => h.map((x) => x.textContent));
  check("reports: by day, dish, category, server, method, taxes and hours", ["Sales by day", "Sales by dish", "Sales by category", "Sales by server", "Payment methods", "Taxes", "Busiest hours"].every((t) => reports.includes(t)), reports.join(", "));
  check("the tax report has VAT, NHIL and GETFund", /VAT.*NHIL.*GETFund/.test(await text(office)));
  await audit(office, "Reports");
  await office.screenshot({ path: path.join(OUT, "office-reports.png"), fullPage: true });

  // --- Settings: managers see API access but only owners create keys
  await office.goto(`${BASE}/office/settings`, { waitUntil: "load" });
  check("managers can't create API keys", (await text(office)).includes("Only an owner can create or revoke keys."));
  await click(office, "Log out");
  await office.waitForFunction(() => location.pathname === "/office/login", { timeout: 10000 });
  await office.goto(`${BASE}/office`, { waitUntil: "load" });
  check("Log out ends the back office session", office.url() === `${BASE}/office/login`);

  const owner = await device(browser);
  await owner.goto(`${BASE}/office/login`, { waitUntil: "load" });
  await pin(owner, "Ama Owner", "1111", "/office");
  await owner.goto(`${BASE}/office/settings`, { waitUntil: "load" });
  await owner.type("input[maxlength='40']", "Head office sync");
  await click(owner, "Create key");
  check("a new key is shown once", await waitText(owner, "copy it now. It won’t be shown again."));
  const key = await owner.$eval("[data-api-key]", (c) => c.textContent.trim());
  check("…in the expected form", /^enyo_[\w-]{8}_[\w-]{43}$/.test(key), key.slice(0, 14));
  check("API access shows this branch's address", (await text(owner)).includes(`${BASE}/api/v1`));
  await audit(owner, "Settings with API access");

  // --- The API
  check("no key: 401", (await api("/orders")).status === 401);
  check("a wrong key: 401", (await api("/orders", key.slice(0, -2) + "xx")).status === 401);
  const info = await (await api("", key)).json();
  check("the key reads this branch", info.name === "Chez Accra Osu" && info.api_version === "1", JSON.stringify(info));
  const list = await (await api("/orders", key)).json();
  check("orders: one paid order, with lines and payments", list.data.length === 1 && list.data[0].status === "paid" && list.data[0].lines.length === 2 && list.data[0].payments[0].method === "card" && list.next_cursor === null, JSON.stringify(list).slice(0, 160));
  const o = list.data[0];
  check("amounts add up: subtotal − discount + taxes + tip = total = paid", o.subtotal - o.discount + o.taxes.reduce((n, t) => n + t.amount, 0) + o.tip === o.total && o.paid === o.total && o.balance === 0);
  check("one order by id", (await (await api(`/orders/${orderId}`, key)).json()).data.number === 1001);
  check("an unknown order: 404", (await api("/orders/nope", key)).status === 404);
  const receipt = await (await api(`/receipts/${orderId}`, key)).json();
  check("the receipt as data", receipt.data.kind === "receipt" && receipt.data.total === o.total && receipt.data.tax_lines.length >= 1);
  const html = await api(`/receipts/${orderId}?format=html`, key);
  check("…or as a printable page", html.headers.get("content-type").startsWith("text/html") && (await html.text()).includes("RECEIPT"));
  const payments = await (await api("/payments?method=card", key)).json();
  check("payments", payments.data.length === 1 && payments.data[0].order_number === 1001 && payments.data[0].amount === o.total);
  const summary = await (await api("/summary?period=today", key)).json();
  check("summary matches the dashboard", summary.data.orders === 1 && summary.data.sales === o.total && summary.data.payments === o.total);
  check("bad filters: 400 with a reason", (await api("/orders?limit=900", key)).status === 400);

  // Live: an order that's open now
  await till.goto(`${BASE}/order`, { waitUntil: "load" });
  await tapDish(till, "Kelewele");
  await click(till, "Send to kitchen", "aside");
  await sleep(1200);
  const active = await (await api("/active-orders", key)).json();
  check("active orders, with the kitchen's progress", active.data.length === 1 && active.data[0].number === 1002 && active.data[0].kitchen === "sent", JSON.stringify(active.data[0] ?? {}));
  const since = await (await api(`/orders?updated_since=${encodeURIComponent(new Date(Date.now() - 60_000).toISOString())}`, key)).json();
  check("updated_since picks up new and changed orders", since.data.some((x) => x.number === 1002));

  // Browser access only for listed websites
  check("websites not listed get no browser access", !(await api("", key, { Origin: "https://evil.example" })).headers.get("access-control-allow-origin"));
  await owner.reload({ waitUntil: "load" });
  await owner.type("textarea", "https://dashboard.example.com");
  await click(owner, "Save websites");
  check("websites can be listed", await waitText(owner, "Websites saved."));
  check("…and then read the API from a browser", (await api("", key, { Origin: "https://dashboard.example.com" })).headers.get("access-control-allow-origin") === "https://dashboard.example.com");

  // Request limit per key
  let limited = null;
  for (let i = 0; i < 130 && !limited; i++) {
    const r = await api("", key);
    if (r.status === 429) limited = r;
  }
  check("too many requests in a minute: 429 with Retry-After", limited && Number(limited.headers.get("retry-after")) > 0);

  // Revoking stops the key at once
  await owner.reload({ waitUntil: "load" });
  check("the key shows when it was last used", (await owner.$eval("[data-key-name='Head office sync']", (li) => li.innerText)).includes("last used"));
  await click(owner, "Revoke", "[data-key-name='Head office sync']");
  await owner.waitForFunction(() => document.querySelector("[data-key-name='Head office sync']")?.innerText.includes("Revoked"), { timeout: 10000 }).catch(() => {});
  check("a revoked key stops working", (await api("", key)).status === 401);

  // --- Phone
  const phone = await device(browser, { width: 390, height: 844, isMobile: true, hasTouch: true });
  await phone.goto(`${BASE}/office/login`, { waitUntil: "load" });
  await pin(phone, "Kwame B.", "2222", "/office");
  check("phone: dashboard with bottom tabs, no sideways scroll", (await phone.$eval("h1", (h) => h.textContent)) === "Dashboard" && (await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)));
  await audit(phone, "Phone dashboard");
  await phone.goto(`${BASE}/office/orders`, { waitUntil: "load" });
  check("phone: the orders table scrolls inside its box, not the page", await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  const problems = [...office.problems, ...owner.problems, ...till.problems, ...phone.problems];
  check("no console errors or hydration warnings", problems.length === 0, problems.join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
