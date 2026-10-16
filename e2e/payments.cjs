// Phase 7 payment checks. Run through `npm run test:e2e` (node e2e/run.mjs), which passes <baseUrl> <outDir>.
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

async function device(browser, viewport) {
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
  await page.waitForFunction(() => location.pathname === "/order", { timeout: 10000 });
  await sleep(600);
}
const click = (page, text, root = "body") =>
  page.evaluate(
    (t, r) => {
      const b = [...document.querySelector(r).querySelectorAll("button, a")].find(
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
const text = (page, selector = "body") => page.$eval(selector, (el) => el.innerText.replace(/\s+/g, " "));
const waitText = (page, needle, timeout = 8000) =>
  page.waitForFunction((n) => document.body.innerText.replace(/\s+/g, " ").includes(n), { timeout, polling: 100 }, needle).then(() => true, () => false);
const amountValue = (page) => page.$eval("input[id$='-amount']", (i) => i.value);
async function setField(page, selector, value) {
  await page.focus(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type(selector, value);
}
async function startPayment(page, dishes, { table } = {}) {
  for (const [dish, n] of dishes) await tapDish(page, dish, n);
  if (table) {
    await click(page, "Dine-in", "aside");
    await pickTable(page, table);
  }
  await click(page, "Pay", "aside");
  await page.waitForFunction(() => location.pathname.startsWith("/pay/"), { timeout: 10000 });
  await sleep(700);
}

(async () => {
  const browser = await launch();
  const till = await device(browser, { width: 1366, height: 900 });
  await signIn(till, "Efua M.", "4444");

  // The deck's order, held (not sent), straight to Pay
  await startPayment(till, [["Jollof rice with chicken", 2], ["Banku and tilapia", 1], ["Sobolo", 2]], { table: "T7" });
  check("Pay holds the order and opens the pay screen", /\/pay\/[\w-]+$/.test(till.url()), till.url());
  let page = await text(till);
  check("pay screen shows #1001 and total due GH₵ 408.00", page.includes("Payment · #1001") && page.includes("Total due GH₵ 408.00"));
  check("warns that unsent items go to the kitchen with the first payment", page.includes("5 items not sent to the kitchen yet will go when you take the first payment"));
  check("amount to collect starts at the full balance", (await amountValue(till)) === "408.00", await amountValue(till));

  // Discount as a cashier: needs a manager's PIN
  await click(till, "Add discount");
  await sleep(300);
  check("cashier sees the manager approval section", (await text(till, "dialog[open]")).includes("Manager approval"));
  await till.type("dialog[open] input[id$='-value']", "10");
  await click(till, "Regular guest", "dialog[open]");
  await till.select("dialog[open] select", "staff-kwame");
  await till.type("dialog[open] input[type=password]", "0000");
  await click(till, "Apply discount", "dialog[open]");
  check("wrong manager PIN is refused", await waitText(till, "Wrong manager PIN."));
  await till.type("dialog[open] input[type=password]", "2222");
  await click(till, "Apply discount", "dialog[open]");
  check("discount applied before tax with the manager's name", await waitText(till, "Approved by Kwame B."));
  page = await text(till);
  check("10% discount: 306.00 taxed → VAT 45.90, total 367.20", page.includes("−GH₵ 34.00") && page.includes("GH₵ 45.90") && page.includes("GH₵ 367.20"));

  // Tip 10% of the discounted subtotal (30.60), not taxed
  await click(till, "10%", "[aria-label='Tip']");
  check("10% tip of 30.60 added after tax: total 397.80", await waitText(till, "Total due GH₵ 397.80"));
  await sleep(300);
  check("amount to collect follows the new balance", (await amountValue(till)) === "397.80", await amountValue(till));

  // Split: half by MTN MoMo
  await till.click("button[aria-label='Split 2 ways']");
  check("½ splits the bill", (await amountValue(till)) === "198.90", await amountValue(till));
  await click(till, "Mobile money", "[aria-label='Payment method']");
  await sleep(100);
  await till.type("input[type=tel]", "024 000 5821");
  await click(till, "Take GH₵ 198.90");
  check("first payment leaves GH₵ 198.90 to pay", await waitText(till, "Still to pay GH₵ 198.90"));
  page = await text(till);
  check("payment listed with network and number", page.includes("Mobile money · MTN MoMo · 024 000 5821"));
  check("unsent items went to the kitchen", !page.includes("not sent to the kitchen yet"));
  check(
    "tip and discount are now fixed",
    await till.evaluate(() => [...document.querySelectorAll("[aria-label='Tip'] button")].every((b) => b.disabled)) && page.includes("fixed once a payment has been taken")
  );

  // Too much is refused
  await click(till, "Card", "[aria-label='Payment method']");
  await setField(till, "input[id$='-amount']", "500");
  await click(till, "Take GH₵ 500.00");
  check("more than the balance is refused", await waitText(till, "That's more than the 198.90 still to pay."));

  // Rest in cash with change
  await click(till, "Cash", "[aria-label='Payment method']");
  await till.click("button[aria-label='Full balance']");
  await sleep(100);
  await click(till, "GH₵ 200.00", "[aria-label='Cash received shortcuts']");
  check("change is shown before taking cash", await waitText(till, "Change: GH₵ 1.10"));
  await click(till, "Take GH₵ 198.90 and close");
  check("paid in full, with change to give", (await waitText(till, "Paid in full")) && (await waitText(till, "Change to give: GH₵ 1.10")));
  await till.screenshot({ path: path.join(OUT, "pay-paid.png") });

  // Receipt
  const payUrl = till.url();
  await click(till, "Print receipt");
  await till.waitForFunction(() => location.pathname.startsWith("/receipt/"), { timeout: 10000 });
  await sleep(800);
  const receipt = await text(till, "article");
  check(
    "receipt: header, lines, discount, separate taxes, tip, total",
    ["RECEIPT", "Order #1001 · Dine-in · Table T7", "2× Jollof rice with chicken", "Discount (Regular guest)", "VAT (15%) 45.90", "NHIL (2.5%) 7.65", "GETFund Levy (2.5%) 7.65", "Tip 30.60", "TOTAL GH₵ 397.80"].every((s) =>
      receipt.includes(s)
    ),
    receipt.slice(0, 400)
  );
  check("receipt: both payments and the change", receipt.includes("Mobile money · MTN MoMo · 024 000 5821 198.90") && receipt.includes("Received 200.00 · Change 1.10"));
  await till.screenshot({ path: path.join(OUT, "receipt.png") });

  // Paid orders leave Open orders; revisiting the pay screen shows it's paid
  await till.goto(`${BASE}/order`, { waitUntil: "load" });
  await sleep(600);
  check("paid order leaves Open orders", (await text(till, "header")).includes("Open orders 0"));
  await till.goto(payUrl, { waitUntil: "load" });
  check("pay screen for a paid order says Paid in full", await waitText(till, "Paid in full"));

  // Back from the pay screen reopens the order
  await till.goto(`${BASE}/order`, { waitUntil: "load" });
  await sleep(500);
  await startPayment(till, [["Kelewele", 1]]);
  await till.click("a[aria-label='Back to the order']");
  await till.waitForFunction(() => location.pathname === "/order", { timeout: 10000 });
  await sleep(600);
  check("Back reopens the order on the till", (await text(till, "#order-title")) === "Order #1002");

  // Managers approve their own discounts
  const manager = await device(browser, { width: 1366, height: 900 });
  await signIn(manager, "Kwame B.", "2222");
  await startPayment(manager, [["Beef suya", 2]]);
  await click(manager, "Add discount");
  await sleep(300);
  check("manager isn't asked for a second PIN", !(await text(manager, "dialog[open]")).includes("Manager approval"));
  await click(manager, "Amount (GH₵)", "dialog[open]");
  await manager.type("dialog[open] input[id$='-value']", "20");
  await click(manager, "Staff meal", "dialog[open]");
  await click(manager, "Apply discount", "dialog[open]");
  check("manager's discount applied", await waitText(manager, "Approved by Kwame B."));

  // Part paid shows on Open orders, and opening it goes to the pay screen
  await manager.goto(`${BASE}/order`, { waitUntil: "load" });
  await sleep(400);
  await startPayment(manager, [["Malt drink", 2]]);
  await click(manager, "Card", "[aria-label='Payment method']");
  await setField(manager, "input[id$='-amount']", "10");
  await click(manager, "Take GH₵ 10.00");
  await waitText(manager, "Still to pay");
  await manager.goto(`${BASE}/order`, { waitUntil: "load" });
  await sleep(500);
  await click(manager, "Open orders");
  await sleep(300);
  const rows = await manager.$$eval("dialog[aria-labelledby=open-orders-title] li", (l) => l.map((x) => x.innerText.replace(/\s+/g, " ")));
  const partRow = rows.find((r) => r.includes("Part paid"));
  check("part-paid order is marked Part paid", !!partRow, rows.join(" | "));
  await manager.evaluate(() => [...document.querySelectorAll("dialog[aria-labelledby=open-orders-title] li button")].find((b) => b.innerText.includes("Part paid")).click());
  await manager.waitForFunction(() => location.pathname.startsWith("/pay/"), { timeout: 10000 }).catch(() => {});
  check("opening a part-paid order goes to the pay screen", manager.url().includes("/pay/"), manager.url());

  // Phone
  const phone = await device(browser, { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await signIn(phone, "Kofi A.", "3333");
  await tapDish(phone, "Kelewele");
  await click(phone, "View order");
  await sleep(300);
  await click(phone, "Pay", "aside");
  await phone.waitForFunction(() => location.pathname.startsWith("/pay/"), { timeout: 10000 });
  await sleep(700);
  check("phone pay screen: no sideways scroll", await phone.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  const overlap = await phone.evaluate(() => {
    const methods = document.querySelector("[aria-label='Payment method']").getBoundingClientRect();
    const bill = document.querySelector("section[aria-labelledby=bill-title]").getBoundingClientRect();
    return Math.round(bill.top - methods.bottom);
  });
  check("phone pay screen: bill sits below the payment controls, not over them", overlap >= 0, `gap ${overlap}px`);
  await phone.screenshot({ path: path.join(OUT, "pay-phone.png"), fullPage: true });

  const problems = [till, manager, phone].flatMap((p) => p.problems);
  check("no console errors or hydration warnings", problems.length === 0, problems.join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
