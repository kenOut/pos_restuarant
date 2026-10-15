// Phase 1 landing page checks. Run through `npm run test:e2e` (node e2e/run.mjs), which passes <baseUrl> <outDir>.
// At desktop, tablet and phone sizes, with motion on and reduced: no sideways
// scroll, every piece of text revealed after scrolling, no console errors.
const path = require("path");
const { launch } = require("./lib.cjs");
const [BASE, OUT] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 820, height: 1180, isMobile: true, hasTouch: true },
  { name: "phone", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];

(async () => {
  // Security headers and the not-found page
  const home = await fetch(BASE);
  check("pages can't be framed by other sites", home.headers.get("x-frame-options") === "DENY" && (home.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'none'"));
  check("nosniff and same-origin referrer headers", home.headers.get("x-content-type-options") === "nosniff" && home.headers.get("referrer-policy") === "same-origin");
  const missing = await fetch(`${BASE}/no-such-page`);
  check("unknown address shows the ENYO not-found page", missing.status === 404 && (await missing.text()).includes("Page not found"), `${missing.status}`);

  const browser = await launch(["--hide-scrollbars"]);
  for (const reduced of [false, true]) {
    for (const vp of VIEWPORTS) {
      if (reduced && vp.name === "tablet") continue;
      const tag = `${vp.name}${reduced ? ", reduced motion" : ""}`;
      const page = await (await browser.createBrowserContext()).newPage();
      const problems = [];
      page.on("console", (m) => ["error", "warn", "warning"].includes(m.type()) && problems.push(m.text()));
      page.on("pageerror", (e) => problems.push(e.message));
      await page.setViewport(vp);
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }]);
      await page.goto(BASE, { waitUntil: "load" });
      await sleep(2000);
      if (!reduced) await page.screenshot({ path: path.join(OUT, `landing-${vp.name}.png`) });

      // Scroll through in half-screen steps so every scroll-triggered reveal fires.
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += Math.round(vp.height * 0.5)) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await sleep(250);
      }
      await sleep(1500);

      const result = await page.evaluate(() => {
        const hidden = [...document.querySelectorAll("main *")].filter((el) => {
          if (el.children.length || !el.textContent.trim() || el.closest(".sr-only")) return false;
          // Width-reserving copies (e.g. the stat counters) are meant to stay invisible.
          if (el.classList.contains("invisible") && el.nextElementSibling) return false;
          const s = getComputedStyle(el);
          return s.visibility === "hidden" || Number(s.opacity) < 0.05;
        });
        return {
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          widths: `${document.documentElement.scrollWidth}/${document.documentElement.clientWidth}`,
          hidden: hidden.slice(0, 5).map((el) => `${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}"`),
        };
      });
      check(`${tag}: no sideways scroll`, !result.overflow, result.widths);
      check(`${tag}: all text revealed after scrolling`, result.hidden.length === 0, result.hidden.join(", "));
      check(`${tag}: no console errors`, problems.length === 0, problems.join(" | "));
      await page.close();
    }
  }
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
