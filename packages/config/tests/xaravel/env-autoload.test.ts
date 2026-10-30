// Xaravel Test for Story 15.3: Bun's own `.env` autoload never sets a configuration value (XT-config-5, FR-20.2). A
// fixture app in a temp directory holds `.env`, `.env.local` and `.env.production`; its entry script runs as a child
// Bun process (`process.execPath`, the parent's env without `BUN_OPTIONS` and `NODE_OPTIONS`, as the harness spawns
// `bun test`, and with `NODE_ENV=production`, so Bun's rules would read all three files). The child prints one JSON
// line with the fixture keys' `process.env` values before Xaravel's loader runs and one after
// `Dotenv::createUnsafeImmutable(dir)->load()`. A control run, with no `bunfig.toml` and no `--no-env-file`, shows Bun
// would otherwise read every file; the neutralised runs copy the root `bunfig.toml` (`env = false`) from the
// repository and pass `--no-env-file`, as the spine's Config row requires of every entry script.
//
// F-10 recorded reason: Bun's `.env` autoload is a Bun runtime behaviour with no PHP counterpart, so no Upstream test
// (in the Test Inventory or in phpdotenv) covers it, and the Oracle cannot run it. The test contains no Upstream test.
// The entry-script lint (XT-config-6) and the Epic-close checks (XT-config-7) wait on ESC-15.3-1 and ESC-15.3-2.
import { join, resolve } from "node:path";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { Assert, xaravelTest } from "@xaravel/assert";

const REPO = resolve(import.meta.dir, "..", "..", "..", "..");

/** Fixture keys, prefixed so no real variable of the parent's environment can hold one. */
const DOT = "XT_CONFIG_5_DOT";
const LOCAL = "XT_CONFIG_5_LOCAL";
const PRODUCTION = "XT_CONFIG_5_PRODUCTION";
const SHARED = "XT_CONFIG_5_SHARED";
const KEYS = [DOT, LOCAL, PRODUCTION, SHARED] as const;

/** One snapshot the child prints: each key's `process.env` value and its `getenv` result (`false` when unset). */
interface Snapshot {
  env: Record<string, string | null>;
  getenv: Record<string, string | false>;
}

/** Writes the fixture app: the three env files and an entry script that snapshots, loads `.env`, and snapshots again. */
function writeFixture(dir: string): void {
  writeFileSync(join(dir, ".env"), `${DOT}=dot\n${SHARED}=dot\n`);
  writeFileSync(join(dir, ".env.local"), `${LOCAL}=local\n${SHARED}=local\n`);
  writeFileSync(join(dir, ".env.production"), `${PRODUCTION}=production\n${SHARED}=production\n`);
  const config = join(REPO, "packages", "config", "src", "index.ts");
  const php = join(REPO, "packages", "runtime", "src", "php", "index.ts");
  writeFileSync(join(dir, "entry.ts"), `
import { Dotenv } from ${JSON.stringify(config)};
import { getenv } from ${JSON.stringify(php)};
const keys = ${JSON.stringify(KEYS)};
const snapshot = () => ({
  env: Object.fromEntries(keys.map((key) => [key, process.env[key] ?? null])),
  getenv: Object.fromEntries(keys.map((key) => [key, getenv(key)])),
});
console.log(JSON.stringify(snapshot()));
Dotenv.createUnsafeImmutable(process.cwd()).load();
console.log(JSON.stringify(snapshot()));
`);
}

/**
 * Runs the fixture's entry script in a fresh temp directory: `neutralised` copies the root `bunfig.toml` there and
 * passes `--no-env-file`; `real` adds variables to the child's environment. Returns the snapshots before and after the
 * load. The directory is removed in `finally`.
 */
function run(neutralised: boolean, real: Record<string, string> = {}): { before: Snapshot; after: Snapshot } {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-xt-config-5-"));
  try {
    writeFixture(dir);
    if (neutralised) copyFileSync(join(REPO, "bunfig.toml"), join(dir, "bunfig.toml"));
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && key !== "BUN_OPTIONS" && key !== "NODE_OPTIONS" && !(KEYS as readonly string[]).includes(key)) env[key] = value;
    }
    env["NODE_ENV"] = "production";
    Object.assign(env, real);
    const args = neutralised ? [process.execPath, "--no-env-file", "entry.ts"] : [process.execPath, "entry.ts"];
    const child = Bun.spawnSync(args, { cwd: dir, env, timeout: 60_000, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const stdout = child.stdout.toString();
    Assert.assertSame(0, child.exitCode, stdout + child.stderr.toString());
    const lines = stdout.trim().split("\n");
    Assert.assertCount(2, lines, `the entry script prints one snapshot before the load and one after: ${stdout}`);
    return { before: JSON.parse(lines[0]!) as Snapshot, after: JSON.parse(lines[1]!) as Snapshot };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

xaravelTest(
  "XT-config-5",
  "Bun's own .env autoload never sets a value (FR-20.2): a fixture app with .env, .env.local and .env.production, run under NODE_ENV=production with no bunfig.toml and no --no-env-file, has all three files' keys in process.env with .env.local winning on a shared key, so Bun would read them; run with the root bunfig.toml (env = false) and --no-env-file, process.env holds none of those keys until Xaravel's loader runs, after which Dotenv::createUnsafeImmutable(dir)->load() puts .env's keys in process.env and getenv while the .env.local and .env.production keys stay absent; and a variable already in the real environment keeps its real value after the immutable load",
  () => {
    // Control: Bun's autoload, unneutralised, reads all three files.
    const control = run(false);
    Assert.assertSame("dot", control.before.env[DOT], "control: Bun read .env");
    Assert.assertSame("local", control.before.env[LOCAL], "control: Bun read .env.local");
    Assert.assertSame("production", control.before.env[PRODUCTION], "control: Bun read .env.production");
    Assert.assertSame("local", control.before.env[SHARED], "control: .env.local wins on a shared key");

    // Neutralised: the root bunfig.toml and --no-env-file leave process.env without any fixture key.
    const neutralised = run(true);
    for (const key of KEYS) {
      Assert.assertNull(neutralised.before.env[key], `neutralised: ${key} is not in process.env before the loader runs`);
      Assert.assertFalse(neutralised.before.getenv[key], `neutralised: getenv(${key}) is false before the loader runs`);
    }

    // Loader: only Xaravel's phpdotenv loader sets values, and only .env's.
    Assert.assertSame("dot", neutralised.after.env[DOT], "loader: .env's key is in process.env");
    Assert.assertSame("dot", neutralised.after.env[SHARED], "loader: .env's shared key is in process.env");
    Assert.assertSame("dot", neutralised.after.getenv[DOT], "loader: getenv reads .env's key");
    Assert.assertSame("dot", neutralised.after.getenv[SHARED], "loader: getenv reads .env's shared key");
    Assert.assertNull(neutralised.after.env[LOCAL], "loader: .env.local's key stays absent");
    Assert.assertNull(neutralised.after.env[PRODUCTION], "loader: .env.production's key stays absent");
    Assert.assertFalse(neutralised.after.getenv[LOCAL], "loader: getenv(.env.local's key) is false");
    Assert.assertFalse(neutralised.after.getenv[PRODUCTION], "loader: getenv(.env.production's key) is false");

    // Real env wins: the immutable load keeps a variable the real environment set.
    const real = run(true, { [SHARED]: "real" });
    Assert.assertSame("real", real.before.env[SHARED], "real env: the child starts with the real value");
    Assert.assertSame("real", real.after.env[SHARED], "real env: the immutable load keeps the real value");
    Assert.assertSame("real", real.after.getenv[SHARED], "real env: getenv reads the real value");
    Assert.assertSame("dot", real.after.env[DOT], "real env: .env's other key still loads");
  },
);
