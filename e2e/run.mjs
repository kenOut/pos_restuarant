// Runs the browser tests. Each suite gets its own fresh database and its own
// production server, so suites can't affect each other (the sign-in suite,
// for example, deliberately locks a member of staff out).
//
//   npm run test:e2e                  build, then run every suite
//   npm run test:e2e -- order kitchen run only these suites
//   npm run test:e2e -- --no-build    reuse the last build
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUITES = ["landing", "login", "shell", "order", "kitchen", "payments", "admin", "setup", "a11y"];
/** Extra environment for particular suites: setup needs an empty database. */
const SUITE_ENV = { setup: { ENYO_SEED_DEMO: "0" } };
const OUT = path.join(ROOT, "e2e", "output");

const args = process.argv.slice(2);
const build = !args.includes("--no-build");
const chosen = args.filter((a) => !a.startsWith("--"));
const unknown = chosen.filter((s) => !SUITES.includes(s));
if (unknown.length) {
  console.error(`Unknown suite(s): ${unknown.join(", ")}. Available: ${SUITES.join(", ")}`);
  process.exit(2);
}
const suites = chosen.length ? chosen : SUITES;

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer().listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function waitForServer(url, child, timeoutMs = 60_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error(`server exited with code ${child.exitCode}`);
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server didn't start within ${timeoutMs / 1000} s`);
}

function stop(child) {
  if (child.exitCode !== null) return;
  // Next starts a child process of its own; stop the whole tree.
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else process.kill(-child.pid, "SIGTERM");
}

/**
 * OneDrive turns files in a synced .next folder into read-only cloud placeholders,
 * which the build then can't delete (EPERM). Clear the old production output
 * first, resetting those attributes. .next/dev (a running dev server) is left alone.
 */
function clearOldBuild() {
  const dirs = ["server", "static"].map((d) => path.join(ROOT, ".next", d)).filter((d) => fs.existsSync(d));
  if (dirs.length === 0) return;
  if (process.platform === "win32") {
    const list = dirs.map((d) => `'${d.replace(/'/g, "''")}'`).join(",");
    spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `foreach ($d in @(${list})) { Get-ChildItem $d -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object { try { $_.Attributes = 'Normal' } catch {} }; Remove-Item $d -Recurse -Force -ErrorAction SilentlyContinue }`,
      ],
      { stdio: "ignore" }
    );
  } else {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  }
}

if (build) {
  clearOldBuild();
  // Sync tools such as OneDrive can still briefly lock files in .next, which
  // can fail a build with EPERM; a retry a few seconds later normally gets through.
  for (let attempt = 1; ; attempt++) {
    if (attempt > 1) clearOldBuild();
    console.log(attempt === 1 ? "Building…" : `Build failed; retrying (${attempt}/3)…`);
    // A single command string (no argument list) so the shell needs no escaping.
    const result = spawnSync("npm run build", { cwd: ROOT, stdio: "inherit", shell: true });
    if (result.status === 0) break;
    if (attempt === 3) process.exit(result.status ?? 1);
    await new Promise((r) => setTimeout(r, 4000));
  }
}

fs.mkdirSync(OUT, { recursive: true });
const results = [];

for (const suite of suites) {
  const port = await freePort();
  const base = `http://localhost:${port}`;
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), `enyo-e2e-${suite}-`));
  const dbPath = path.join(dbDir, "enyo.db");
  const log = [];

  console.log(`\n=== ${suite} (${base})`);
  const server = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_PATH: dbPath, ENYO_SEED_DEMO: "1", NEXT_TELEMETRY_DISABLED: "1", ...SUITE_ENV[suite] },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  server.stdout.on("data", (d) => log.push(String(d)));
  server.stderr.on("data", (d) => log.push(String(d)));

  let status;
  try {
    await waitForServer(`${base}/`, server);
    status = spawnSync(process.execPath, [path.join(ROOT, "e2e", `${suite}.cjs`), base, OUT, dbPath], { cwd: ROOT, stdio: "inherit" }).status;
  } catch (error) {
    console.error(`Couldn't start the server: ${error.message}\n${log.join("")}`);
    status = 1;
  } finally {
    stop(server);
  }
  if (status !== 0 && log.length) console.log(`--- server output for ${suite} ---\n${log.join("").slice(-3000)}`);
  results.push({ suite, ok: status === 0 });
  fs.rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

console.log("\n=== Summary");
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.suite}`);
console.log(`Screenshots: ${path.relative(ROOT, OUT)}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
