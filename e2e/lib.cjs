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

/**
 * Starts a production server of this app (after `npm run build`) on a port,
 * with its own environment, for suites that need servers they can stop and
 * restart (e.g. to take one side offline). Returns its address and stop().
 */
async function startServer(port, env, timeoutMs = 60_000) {
  const { spawn, spawnSync } = require("node:child_process");
  const path = require("node:path");
  const root = path.resolve(__dirname, "..");
  const child = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], {
    cwd: root,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  const log = [];
  child.stdout.on("data", (d) => log.push(String(d)));
  child.stderr.on("data", (d) => log.push(String(d)));
  const url = `http://localhost:${port}`;
  const end = Date.now() + timeoutMs;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`server exited: ${log.join("")}`);
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      // not up yet
    }
    if (Date.now() > end) throw new Error("server did not start");
    await new Promise((r) => setTimeout(r, 250));
  }
  const stop = () => {
    if (child.exitCode !== null) return;
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGTERM");
  };
  return { url, stop, log };
}

/** A free TCP port. */
function freePort() {
  const net = require("node:net");
  return new Promise((resolve, reject) => {
    const server = net.createServer().listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

module.exports = { launch, startServer, freePort };
