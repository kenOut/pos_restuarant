// Phase 3 shell checks. Run through `npm run test:e2e` (node e2e/run.mjs), which passes <baseUrl> <outDir>.
const path = require("path");
const { launch } = require("./lib.cjs");
const [BASE, OUT] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

async function signIn(page, name, pin) {
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.evaluate((n) => [...document.querySelectorAll("button[aria-pressed]")].find((b) => b.textContent.includes(n)).click(), name);
  await sleep(150);
  await page.keyboard.type(pin);
  await page.waitForFunction(() => location.pathname !== "/login", { timeout: 10000 });
  await sleep(500);
}
const visibleNav = (page) =>
  page.evaluate(() => {
    const nav = [...document.querySelectorAll("nav[aria-label=Till]")].find((n) => n.offsetParent !== null || getComputedStyle(n).position === "fixed" && n.getBoundingClientRect().height > 0);
    if (!nav) return null;
    return {
      rail: nav.getBoundingClientRect().left === 0 && nav.getBoundingClientRect().height > 300,
      links: [...nav.querySelectorAll("a")].map((a) => ({ text: a.textContent.trim(), current: a.getAttribute("aria-current") })),
      disabled: [...nav.querySelectorAll("[aria-disabled=true]")].map((s) => s.textContent.replace("(coming soon)", "").trim()),
    };
  });
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

(async () => {
  const browser = await launch();
  const problems = [];
  const watch = (p) => {
    p.on("console", (m) => ["error", "warn", "warning"].includes(m.type()) && problems.push(m.text()));
    p.on("pageerror", (e) => problems.push(e.message));
  };

  // --- Manager on a laptop
  const desk = await (await browser.createBrowserContext()).newPage();
  watch(desk);
  await desk.setViewport({ width: 1280, height: 800 });
  await signIn(desk, "Kwame B.", "2222");
  let nav = await visibleNav(desk);
  check("desktop shows the left rail", nav?.rail === true);
  check("manager sees all 13 sections", nav && nav.links.length + nav.disabled.length === 13, nav && `${nav.links.length} links + ${nav.disabled.length} coming later`);
  check("built screens are links: Order, Kitchen, Menu, Staff, Settings", JSON.stringify(nav?.links.map((l) => l.text)) === JSON.stringify(["Order", "Kitchen", "Menu", "Staff", "Settings"]), nav?.links.map((l) => l.text).join(","));
  check("Order marked as current page", nav?.links.find((l) => l.text === "Order")?.current === "page");
  const lockInView = await desk.evaluate(() => {
    const b = [...document.querySelectorAll("nav[aria-label=Till] button")].find((x) => x.textContent.includes("Lock") && x.offsetParent);
    const r = b.getBoundingClientRect();
    return r.bottom <= window.innerHeight && r.top >= 0;
  });
  check("Lock visible without scrolling the page", lockInView);
  await desk.screenshot({ path: path.join(OUT, "shell-desktop.png") });

  // Keyboard: Tab reaches the links and Lock, never the "coming later" items
  await desk.focus("body");
  const focused = [];
  for (let i = 0; i < 8; i++) {
    await desk.keyboard.press("Tab");
    focused.push(await desk.evaluate(() => document.activeElement?.textContent?.trim()));
  }
  check("Tab order: the five links, then Lock", focused.slice(0, 6).join(",") === "Order,Kitchen,Menu,Staff,Settings,Lock", focused.slice(0, 6).join(" → "));

  await desk.evaluate(() => [...document.querySelectorAll("nav[aria-label=Till] a")].find((a) => a.textContent.includes("Kitchen") && a.offsetParent).click());
  await desk.waitForFunction(() => location.pathname === "/kitchen", { timeout: 10000 });
  await sleep(400);
  nav = await visibleNav(desk);
  check("Kitchen link navigates and becomes current", nav?.links.find((l) => l.text === "Kitchen")?.current === "page");

  // --- Short laptop screen: rail scrolls inside itself, Lock stays visible
  await desk.setViewport({ width: 1280, height: 620 });
  await sleep(300);
  const shortScreen = await desk.evaluate(() => {
    const rail = [...document.querySelectorAll("nav[aria-label=Till]")].find((n) => n.offsetParent);
    const list = rail.querySelector("ul");
    const lock = [...rail.querySelectorAll("button")].find((b) => b.textContent.includes("Lock"));
    return { scrolls: list.scrollHeight > list.clientHeight, lockVisible: lock.getBoundingClientRect().bottom <= window.innerHeight, pageScroll: document.documentElement.scrollHeight > window.innerHeight };
  });
  check("on a short screen the rail scrolls, Lock stays visible, page doesn't scroll", shortScreen.scrolls && shortScreen.lockVisible && !shortScreen.pageScroll, JSON.stringify(shortScreen));

  // --- Tablet portrait
  await desk.setViewport({ width: 820, height: 1180, isMobile: true, hasTouch: true });
  await sleep(400);
  check("tablet portrait uses the rail", (await visibleNav(desk))?.rail === true);
  check("tablet: no sideways scroll", await noOverflow(desk));
  await desk.screenshot({ path: path.join(OUT, "shell-tablet.png") });

  // --- Phone
  const phone = await (await browser.createBrowserContext()).newPage();
  watch(phone);
  await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await signIn(phone, "Efua M.", "4444");
  const tabs = await phone.evaluate(() => {
    const bar = [...document.querySelectorAll("nav[aria-label=Till]")].find((n) => getComputedStyle(n).position === "fixed");
    return { shown: bar && bar.getBoundingClientRect().height > 0, labels: [...bar.querySelectorAll("li")].map((li) => li.textContent.replace("(coming soon)", "").trim()) };
  });
  check("phone shows bottom tabs", tabs.shown === true);
  check("cashier tabs: Home, Tables, Order, Kitchen, More", tabs.labels.join(",") === "Home,Tables,Order,Kitchen,More", tabs.labels.join(","));
  const railHidden = await phone.evaluate(() => [...document.querySelectorAll("nav[aria-label=Till]")].every((n) => getComputedStyle(n).position === "fixed" || n.offsetParent === null));
  check("phone hides the rail", railHidden);
  check("phone: no sideways scroll", await noOverflow(phone));
  await phone.screenshot({ path: path.join(OUT, "shell-phone.png") });

  await phone.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "More").click());
  await sleep(600);
  const sheet = await phone.evaluate(() => {
    const d = document.querySelector("dialog");
    return { open: d.open, items: [...d.querySelectorAll("li")].map((li) => li.textContent.replace("Soon", "").trim()) };
  });
  check("More opens a sheet", sheet.open);
  check("cashier's More: Orders, Bookings, Guests (no management sections)", sheet.items.join(",") === "Orders,Bookings,Guests", sheet.items.join(","));
  await phone.screenshot({ path: path.join(OUT, "shell-phone-more.png") });
  await phone.keyboard.press("Escape");
  await sleep(300);
  check("Escape closes the sheet", await phone.evaluate(() => !document.querySelector("dialog").open));

  await phone.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "More").click());
  await sleep(500);
  await phone.evaluate(() => [...document.querySelector("dialog").querySelectorAll("button")].find((b) => b.textContent.includes("Lock")).click());
  await phone.waitForFunction(() => location.pathname === "/login", { timeout: 10000 }).catch(() => {});
  check("Lock from the More sheet signs out", phone.url().endsWith("/login"), phone.url());

  // --- Kitchen staff
  const kitchen = await (await browser.createBrowserContext()).newPage();
  watch(kitchen);
  await kitchen.setViewport({ width: 1280, height: 800 });
  await signIn(kitchen, "Yaw D.", "6666");
  nav = await visibleNav(kitchen);
  check("kitchen staff rail: Kitchen only", nav && nav.links.map((l) => l.text).join(",") === "Kitchen" && nav.disabled.length === 0, nav && JSON.stringify(nav));
  await kitchen.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await sleep(400);
  const kTabs = await kitchen.evaluate(() => [...[...document.querySelectorAll("nav[aria-label=Till]")].find((n) => getComputedStyle(n).position === "fixed").querySelectorAll("li")].map((li) => li.textContent.trim()));
  check("kitchen staff phone tabs: Kitchen, More", kTabs.join(",") === "Kitchen,More", kTabs.join(","));

  check("no console errors or hydration warnings", problems.length === 0, problems.join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
