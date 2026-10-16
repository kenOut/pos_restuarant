// Which branch an npm script works on: `--branch <address>` (e.g. --branch osu),
// or the only branch when there is just one. Reads the head office database
// (data/control.db) the same way the app does.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { branchFiles } from "../src/lib/tenancy/files.ts";

export function dataDir() {
  if (process.env.ENYO_DATA_DIR) return path.resolve(process.env.ENYO_DATA_DIR);
  if (process.env.DATABASE_PATH) return path.dirname(path.resolve(process.env.DATABASE_PATH));
  return path.resolve("data");
}

export function listBranches() {
  const controlFile = path.join(dataDir(), "control.db");
  if (!fs.existsSync(controlFile)) {
    // Not started since the upgrade to branches: the single restaurant database.
    const legacy = path.resolve(process.env.DATABASE_PATH ?? path.join(dataDir(), "enyo.db"));
    return fs.existsSync(legacy) ? [{ slug: "main", name: "Restaurant", active: 1, dbPath: path.relative(dataDir(), legacy) }] : [];
  }
  const control = new Database(controlFile, { readonly: true, fileMustExist: true });
  try {
    return control.prepare("SELECT slug, name, active, db_path AS dbPath FROM branches ORDER BY sort_order, name").all();
  } finally {
    control.close();
  }
}

/** The branch named on the command line, with its files; exits with help if it's unclear. */
export function chooseBranch(argv) {
  const all = listBranches();
  const flag = argv.indexOf("--branch");
  const slug = flag >= 0 ? argv[flag + 1] : undefined;
  const branch = slug ? all.find((b) => b.slug === slug) : all.length === 1 ? all[0] : undefined;
  if (!branch) {
    if (all.length === 0) console.error(`No branches found in ${dataDir()}. Start the app once first.`);
    else {
      console.error(slug ? `There's no branch called ${slug}.` : "This install has several branches. Choose one with --branch:");
      for (const b of all) console.error(`  --branch ${b.slug}   ${b.name}${b.active ? "" : " (closed)"}`);
    }
    process.exit(1);
  }
  return { branch, ...branchFiles(dataDir(), branch) };
}

/** The arguments that aren't --branch <address>. */
export function positional(argv) {
  const flag = argv.indexOf("--branch");
  return argv.filter((_, i) => flag < 0 || (i !== flag && i !== flag + 1));
}
