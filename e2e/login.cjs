// Phase 2 sign-in checks. Run through `npm run test:e2e` (node e2e/run.mjs), which passes <baseUrl> <outDir>.
const path = require("path");
const { launch } = require("./lib.cjs");
const [BASE, OUT] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

async function tapTile(page, name) {
  await page.evaluate((n) => {
    [...document.querySelectorAll("button[aria-pressed]")].find((b) => b.textContent.includes(n)).click();
  }, name);
  await sleep(150);
}
async function tapKeys(page, digits) {
  for (const d of digits) {
    await page.evaluate((k) => {
      [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === k && !b.hasAttribute("aria-pressed")).click();
    }, d);
    await sleep(60);
  }
}
const statusText = (page) => page.$eval("[role=status]", (el) => el.textContent.trim());

(async () => {
  const browser = await launch();
  const page = await browser.newPage();
  const consoleProblems = [];
  page.on("console", (m) => ["error", "warn", "warning"].includes(m.type()) && consoleProblems.push(m.text()));
  page.on("pageerror", (e) => consoleProblems.push(e.message));
  await page.setViewport({ width: 1280, height: 860 });

  // 1. Protected pages send signed-out visitors to /login
  await page.goto(`${BASE}/order`, { waitUntil: "load" });
  check("signed-out /order redirects to /login", page.url().endsWith("/login"), page.url());
  const tiles = await page.$$eval("button[aria-pressed]", (b) => b.map((x) => x.textContent));
  check("seven staff tiles shown", tiles.length === 7, `${tiles.length}`);
  const html = await page.content();
  check("no PIN hashes in the page", !html.includes("$argon2"));
  await page.screenshot({ path: path.join(OUT, "login-desktop.png") });

  // 2. Keypad disabled until a name is chosen
  const disabled = await page.$$eval("button[disabled]", (b) => b.length);
  check("keypad disabled before choosing a name", disabled === 12, `${disabled} disabled`);

  // 3. Wrong PIN via the physical keyboard
  await tapTile(page, "Kwame B.");
  await page.keyboard.type("1234");
  await sleep(1500);
  check("wrong PIN shows an error", (await statusText(page)).includes("Wrong PIN"), await statusText(page));
  const filled = await page.$$eval("[aria-hidden=true] > span.bg-amber", (d) => d.length);
  check("PIN dots cleared after wrong PIN", filled === 0, `${filled} filled`);
  check("still on /login", page.url().endsWith("/login"));

  // 4. Right PIN via the on-screen keypad
  await tapKeys(page, "2222");
  await page.waitForNavigation({ waitUntil: "load", timeout: 10000 }).catch(() => {});
  check("manager lands on /order", page.url().endsWith("/order"), page.url());
  check("signed-in name shown", (await page.content()).includes("Signed in as Kwame B."));
  const cookie = (await page.cookies()).find((c) => c.name === "enyo_session");
  check("session cookie is httpOnly + SameSite=Lax", cookie?.httpOnly === true && cookie?.sameSite === "Lax");
  await page.screenshot({ path: path.join(OUT, "order-placeholder.png") });

  // 5. /login while signed in goes back to work
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  check("signed-in /login redirects to /order", page.url().endsWith("/order"), page.url());

  // 6. Lock ends the session
  await page.click("form button[type=submit]"); await page.waitForFunction(() => location.pathname === "/login", { timeout: 10000 }).catch(() => {}); await sleep(300);
  check("Lock returns to /login", page.url().endsWith("/login"), page.url());
  check("Lock clears the cookie", !(await page.cookies()).some((c) => c.name === "enyo_session"));
  await page.setCookie({ ...cookie }); // replay the old token
  await page.goto(`${BASE}/order`, { waitUntil: "load" });
  check("old session token no longer works after Lock", page.url().endsWith("/login"), page.url());
  await page.deleteCookie({ name: "enyo_session", url: BASE });

  // 7. Kitchen staff only see the kitchen
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await tapTile(page, "Yaw D.");
  await page.keyboard.type("6666");
  await page.waitForNavigation({ waitUntil: "load", timeout: 10000 }).catch(() => {});
  check("kitchen staff land on /kitchen", page.url().endsWith("/kitchen"), page.url());
  await page.goto(`${BASE}/order`, { waitUntil: "load" });
  check("kitchen staff can't open /order", page.url().endsWith("/kitchen"), page.url());
  await page.click("form button[type=submit]"); await page.waitForFunction(() => location.pathname === "/login", { timeout: 10000 }).catch(() => {}); await sleep(300);

  // 8. Lockout after 5 wrong PINs
  await tapTile(page, "Kofi A.");
  for (let i = 0; i < 5; i++) {
    await page.keyboard.type("0000");
    await sleep(1200);
  }
  const lockedMsg = await statusText(page);
  check("5 wrong PINs lock the person out", lockedMsg.includes("Too many wrong PINs"), lockedMsg);
  await page.keyboard.type("3333");
  await sleep(1500);
  check("right PIN refused while locked", page.url().endsWith("/login") && (await statusText(page)).includes("Too many"));

  check("no console errors or hydration warnings", consoleProblems.length === 0, consoleProblems.join(" | "));

  // 9. Phone layout
  const phone = await browser.newPage();
  await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await phone.goto(`${BASE}/login`, { waitUntil: "load" });
  await sleep(800);
  const widths = await phone.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  check("no sideways scroll on a phone", widths[0] <= widths[1], widths.join(" / "));
  await tapTile(phone, "Efua M.");
  await sleep(900); await phone.screenshot({ path: path.join(OUT, "login-phone.png") }); const padVisible = await phone.evaluate(() => { const r = document.querySelector("[aria-labelledby=pin-title]").getBoundingClientRect(); return r.bottom <= window.innerHeight + 2; }); check("PIN pad in view after choosing a name on a phone", padVisible);

  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
