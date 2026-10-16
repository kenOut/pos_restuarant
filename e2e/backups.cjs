// Phase 9 backup checks. Run through `npm run test:e2e` (node e2e/run.mjs), which passes <baseUrl> <outDir> <dbPath>.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { launch } = require("./lib.cjs");
const [BASE, OUT, DB_PATH] = process.argv.slice(2);
const BACKUPS = path.join(path.dirname(DB_PATH), "backups");
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
  page.on("response", (r) => r.status() >= 400 && !r.url().includes("/api/backups/") && page.problems.push(`${r.status()} ${r.url().replace(BASE, "")}`));
  await page.setViewport({ width: 1366, height: 900 });
  return page;
}
async function signIn(page, name, pin) {
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.evaluate((n) => [...document.querySelectorAll("button[aria-pressed]")].find((b) => b.textContent.includes(n)).click(), name);
  await sleep(150);
  await page.keyboard.type(pin);
  await page.waitForFunction(() => location.pathname !== "/login", { timeout: 10000 });
  await sleep(500);
}
async function click(page, text, root = "body") {
  const find = (t, r) => [...(document.querySelector(r)?.querySelectorAll("button, a") ?? [])].find((x) => x.getClientRects().length > 0 && x.textContent.trim().startsWith(t) && !x.disabled);
  const ready = await page.waitForFunction(find, { timeout: 8000, polling: 100 }, text, root).then(() => true, () => false);
  if (!ready) throw new Error(`no enabled button "${text}"`);
  await page.evaluate((t, r, f) => new Function("t", "r", `return (${f})(t, r)`)(t, r).click(), text, root, find.toString());
}
const waitText = (page, needle, timeout = 10000) =>
  page.waitForFunction((n) => document.body.innerText.replace(/\s+/g, " ").includes(n), { timeout, polling: 100 }, needle).then(() => true, () => false);
const backupRows = (page) =>
  page.evaluate(() => {
    const section = [...document.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent === "Server and backups");
    return [...(section?.querySelectorAll("li") ?? [])].map((li) => li.innerText.replace(/\s+/g, " "));
  });
async function fill(page, selector, value) {
  await page.focus(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  if (value) await page.type(selector, value);
}
const cookieHeader = async (page) => (await page.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");

(async () => {
  const browser = await launch();
  const owner = await device(browser);
  await signIn(owner, "Ama Owner", "1111");

  // The start-up backup is taken about 10 s after the server starts
  await owner.goto(`${BASE}/settings`, { waitUntil: "load" });
  const deadline = Date.now() + 25000;
  let rows = [];
  while (Date.now() < deadline) {
    rows = await backupRows(owner);
    if (rows.some((r) => r.includes("On start-up"))) break;
    await sleep(2000);
    await owner.reload({ waitUntil: "load" });
  }
  check("a backup is taken automatically on start-up, and passes its check", rows.some((r) => r.includes("On start-up") && r.includes("check passed")), rows.join(" | "));

  // Back up now
  await click(owner, "Back up now");
  check("Back up now takes and checks a backup", await waitText(owner, "Backup taken and checked."));
  await sleep(500);
  rows = await backupRows(owner);
  check("…and it's listed", rows.some((r) => r.includes("Backed up by hand")), rows.join(" | "));
  const manualId = fs.readdirSync(BACKUPS).filter((n) => n.endsWith("_manual")).sort().pop();
  check("backup folder holds the database and a manifest", !!manualId && ["enyo.db", "manifest.json"].every((f) => fs.existsSync(path.join(BACKUPS, manualId, f))), manualId);

  // Downloads: owners only
  const ownerDownload = await fetch(`${BASE}/api/backups/${manualId}`, { headers: { cookie: await cookieHeader(owner) } });
  const head = Buffer.from(await ownerDownload.arrayBuffer()).subarray(0, 16).toString("latin1");
  check("owner can download a backup (a SQLite file)", ownerDownload.status === 200 && head === "SQLite format 3\u0000" && (ownerDownload.headers.get("content-disposition") ?? "").includes(`enyo-${manualId}.db`));
  check("signed-out visitors can't", (await fetch(`${BASE}/api/backups/${manualId}`)).status === 401);
  const manager = await device(browser);
  await signIn(manager, "Kwame B.", "2222");
  check("managers can't", (await fetch(`${BASE}/api/backups/${manualId}`, { headers: { cookie: await cookieHeader(manager) } })).status === 403);
  check("odd backup names are refused", (await fetch(`${BASE}/api/backups/..%2F..%2Fenyo`, { headers: { cookie: await cookieHeader(owner) } })).status === 404);
  await manager.goto(`${BASE}/settings`, { waitUntil: "load" });
  check("managers see that backups are the owner's", await waitText(manager, "Backups are looked after by the owner."));

  // Second copy folder
  await fill(owner, "input[placeholder^='e.g. E:']", "relative\\folder");
  await click(owner, "Save", "section:has(input[type=time])");
  check("the copy folder must be a full path", await waitText(owner, "Enter the full path of the folder"));
  const usb = fs.mkdtempSync(path.join(os.tmpdir(), "enyo-usb-"));
  await fill(owner, "input[placeholder^='e.g. E:']", usb);
  await fill(owner, "input[type=time]", "2215");
  await click(owner, "Save", "section:has(input[type=time])");
  check("saves the copy folder and nightly time", await waitText(owner, "Backup settings saved."));
  await click(owner, "Back up now");
  await waitText(owner, "Backup taken and checked.");
  // Each branch gets its own folder in the copy folder, named after its address.
  const copied = fs.existsSync(path.join(usb, "osu")) ? fs.readdirSync(path.join(usb, "osu")).filter((n) => /_manual/.test(n)) : [];
  check("new backups are also copied to that folder, under the branch's name", copied.length >= 1, copied.join(","));

  // Change something, then restore the earlier backup
  await fill(owner, "input[maxlength='60']", "Changed after backup");
  await click(owner, "Save details");
  await waitText(owner, "Saved.");
  const cashier = await device(browser);
  await signIn(cashier, "Efua M.", "4444");
  check("the change shows on the tills", await waitText(cashier, "Changed after backup"));

  await owner.reload({ waitUntil: "load" });
  await owner.evaluate((id) => {
    const section = [...document.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent === "Server and backups");
    const li = [...section.querySelectorAll("li")].find((l) => l.querySelector(`a[href$="${id}"]`));
    [...li.querySelectorAll("button")].find((b) => b.textContent.trim() === "Restore").click();
  }, manualId);
  await sleep(300);
  const restoreButton = () => owner.$eval("dialog[open] button[type=submit]", (b) => b.disabled);
  check("Restore needs the 'I understand' box ticked", (await restoreButton()) === true);
  await owner.click("dialog[open] input[type=checkbox]");
  await owner.click("dialog[open] button[type=submit]");
  await owner.waitForFunction(() => location.pathname === "/login", { timeout: 20000 }).catch(() => {});
  check("restoring signs the owner out with a notice", owner.url().includes("/login?restored=1") && (await waitText(owner, "Backup restored. Everyone needs to sign in again.")), owner.url());
  await cashier.waitForFunction(() => location.pathname === "/login", { timeout: 10000 }).catch(() => {});
  check("…and every other till goes to the sign-in screen", cashier.url().includes("/login"), cashier.url());

  await signIn(owner, "Ama Owner", "1111");
  await owner.goto(`${BASE}/settings`, { waitUntil: "load" });
  check("the data is back as it was at the backup", (await owner.$eval("input[maxlength='60']", (i) => i.value)) === "Chez Accra Osu");
  rows = await backupRows(owner);
  check("a backup of the data just replaced was taken first", rows.some((r) => r.includes("Before a restore")), rows.join(" | "));
  await owner.screenshot({ path: path.join(OUT, "backups.png"), fullPage: true });

  fs.rmSync(usb, { recursive: true, force: true });
  const problems = [owner, manager, cashier].flatMap((p) => p.problems);
  check("no console errors or hydration warnings", problems.length === 0, problems.join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
