// Shared helpers for the browser tests. Uses the Chrome or Edge already
// installed on this computer (puppeteer-core never downloads a browser).
const fs = require("node:fs");
const puppeteer = require("puppeteer-core");

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

function browserPath() {
  const found = CANDIDATES.find((p) => p && fs.existsSync(p));
  if (!found) throw new Error("No Chrome or Edge found. Set CHROME_PATH to your browser's executable.");
  return found;
}

/** Headless Chrome/Edge. */
function launch(args = []) {
  return puppeteer.launch({ executablePath: browserPath(), headless: true, args });
}

module.exports = { launch };
