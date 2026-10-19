// Xaravel Tests for Story 5.5 (backend isolation per worktree; AD-17, FR-9,
// NFR-10). These run under plain `bun test` until the harness's `xaravelTest`
// lands in Story 5.9. Fixture roots are hermetic temp directories, each the top
// level of its own `git init` repository, holding a root `bunfig.toml`, an
// Inventory, an Expectations shard, `conformance/variants` and Ported Test
// files that import `portedTest` from the real `packages/assert` by absolute
// path. Postgres is an in-memory recording admin (and a live server when one
// is reachable at the default env); Redis is a fake `redis-server` (and a real
// one when it is on PATH). The real repository is only read.
import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { hostname, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { probe } from "../../harness/backends";
import { runHarness, type HarnessOptions } from "../../harness/harness";
import { IsolationError, WORKTREE_ID_FILE, acquireLock, creationId, ownsDatabase, postgresAdmin, recreateDatabases, worktreeKey, worktreeOf, type PgAdmin } from "../../harness/isolation";

const root = resolve(import.meta.dir, "..", "..", "..");
const HARNESS = join(root, "conformance", "harness", "harness.ts");
const ASSERT = join(root, "packages", "assert", "src", "index.ts");
const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Fixture

const HASH = "0".repeat(64);
const CLASS = "Illuminate\\Tests\\Support\\SupportIsolationTest";
const A = `${CLASS}::testA`;
const B = `${CLASS}::testB`;
const SHARD = "conformance/expectations/support/framework/tests/Support/SupportIsolationTest.jsonl";
const TEST_FILE = "packages/support/tests/ported/Support/SupportIsolationTest.test.ts";
const VARIANTS = "mysql\nnone\npgsql\nqueue-database@pgsql\nqueue-redis@redis\nredis\nsqlite\n";
const NO_REDIS_SERVER = join(tmpdir(), "xt-isolation-no-redis-server", "redis-server");

interface Line {
  id: string;
  variant: string;
  status?: string;
}

function inventory(lines: readonly Line[]): string {
  const backends = new Map<string, string[]>();
  for (const line of lines) {
    backends.set(line.id, [...(backends.get(line.id) ?? []), line.variant]);
  }
  return [...backends]
    .map(([id, list], index) => `${JSON.stringify({ id, component: "support", kind: "unit", backends: list.sort(), source: `framework/tests/Support/SupportIsolationTest.php:${10 * (index + 1)}-${10 * (index + 1) + 1}`, hash: HASH, assertions: null, oracle: {} })}\n`)
    .join("");
}

function shard(lines: readonly Line[]): string {
  return lines
    .map((line) => {
      const status = line.status ?? "pass";
      return `${JSON.stringify({ id: line.id, variant: line.variant, status, reason: status === "skip" ? "not-ported-yet" : null, adapted: null, escalation: null })}\n`;
    })
    .join("");
}

function ported(body: string): string {
  return `import { Assert, portedTest } from ${JSON.stringify(ASSERT)};\n${body}\n`;
}

function write(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

function git(dir: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", dir, "-c", "user.name=xt", "-c", "user.email=xt@example.invalid", ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
  }
  return result.stdout.toString();
}

/** A hermetic harness root at the top level of its own git repository. */
function makeRoot(lines: readonly Line[], files: Record<string, string> = {}, base: string | null = null): string {
  const dir = base ?? mkdtempSync(join(tmpdir(), "xt-iso-"));
  if (base === null) {
    roots.push(dir);
  }
  write(dir, { "bunfig.toml": "env = false\n", "conformance/variants": VARIANTS, "conformance/inventory/support.jsonl": inventory(lines), [SHARD]: shard(lines), ...files });
  Bun.spawnSync(["git", "init", "-q", dir]);
  return realpathSync(dir);
}

function tempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(dir);
  return dir;
}

async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

async function listening(): Promise<{ server: Server; port: number }> {
  const server = createServer((socket) => socket.destroy());
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return { server, port: (server.address() as { port: number }).port };
}

/** The env for a fixture run: no CI, Postgres and Redis at a closed port, no local redis-server, unless overridden. */
async function env(extra: Record<string, string | undefined> = {}): Promise<Record<string, string | undefined>> {
  const port = String(await closedPort());
  return { ...process.env, CI: undefined, PGHOST: "127.0.0.1", PGPORT: port, REDIS_HOST: "127.0.0.1", REDIS_PORT: port, XARAVEL_REDIS_SERVER: NO_REDIS_SERVER, XARAVEL_API_SURFACE: undefined, ...extra };
}

/** Top-level code for a Ported Test file: with `XT_RELEASE` set, its load blocks until that file exists (no test timeout applies while loading). */
const HOLD = [
  `import { existsSync as releaseExists } from "node:fs";`,
  `const release = process.env["XT_RELEASE"];`,
  `if (release !== undefined) { const deadline = Date.now() + 60_000; while (!releaseExists(release) && Date.now() < deadline) { await new Promise((done) => setTimeout(done, 20)); } }`,
].join("\n");

async function waitFor(condition: () => boolean, ms = 30_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`condition not met within ${ms} ms`);
    }
    await Bun.sleep(10);
  }
}

/** Every file under `dir` outside `.cache` and `.git`, with a hash of its content. */
function outsideCache(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (current === dir && (name === ".cache" || name === ".git")) {
        continue;
      }
      if (statSync(path).isDirectory()) {
        walk(path);
      } else {
        found.push(`${path} ${createHash("sha256").update(readFileSync(path)).digest("hex")}`);
      }
    }
  };
  walk(dir);
  return found.sort();
}

/** The key the harness derives for `dir`. */
function keyOf(dir: string): string {
  const tree = worktreeOf(dir);
  return worktreeKey(tree.path, creationId(tree.gitDir));
}

/** An in-memory Postgres server shared by admins; each admin records its own operations. */
class FakePostgres {
  readonly databases: Set<string>;
  constructor(names: readonly string[]) {
    this.databases = new Set(names);
  }
  admin(log: string[], failure: string | null = null): PgAdmin {
    return {
      list: async () => {
        if (failure !== null) {
          throw new Error(failure);
        }
        await Bun.sleep(5);
        return [...this.databases];
      },
      drop: async (name) => {
        await Bun.sleep(5);
        log.push(`drop ${name}`);
        this.databases.delete(name);
      },
      create: async (name) => {
        await Bun.sleep(5);
        log.push(`create ${name}`);
        this.databases.add(name);
      },
      close: async () => {
        log.push("close");
      },
    };
  }
  sorted(): string[] {
    return [...this.databases].sort();
  }
}

// ---------------------------------------------------------------------------
// XT-conformance-110

test("XT-conformance-110: the harness derives the worktree key from SHA-256 over the worktree path and its creation id, and a full run drops and recreates exactly the xaravel_test_<key>[_<name>] databases (AD-17)", async () => {
  const lines: Line[] = [{ id: A, variant: "none" }, { id: B, variant: "pgsql" }];
  const seen = join(tempDir("xt-iso-seen-"), "env");
  const body = ported(
    [
      `import { appendFileSync } from "node:fs";`,
      `portedTest(${JSON.stringify(A)}, {}, () => {`,
      `  const e = process.env;`,
      `  appendFileSync(${JSON.stringify(seen)}, JSON.stringify({ variant: e["XARAVEL_VARIANT"], key: e["XARAVEL_WORKTREE_KEY"], cache: e["XARAVEL_CACHE_DIR"], sqlite: e["XARAVEL_SQLITE_DIR"], pg: e["XARAVEL_PG_DATABASE"], redis: e["XARAVEL_REDIS_SOCKET"] ?? null }) + "\\n");`,
      `  Assert.assertTrue(true);`,
      `});`,
      `portedTest(${JSON.stringify(B)}, {}, () => { Assert.assertTrue(true); });`,
    ].join("\n"),
  );
  const dir = makeRoot(lines, { [TEST_FILE]: body });
  const { server, port } = await listening();
  try {
    // The key: the first 8 hex characters of SHA-256 over `<realpath>\n<creation id>`.
    const pgEnv = await env({ PGPORT: String(port) });
    const firstLog: string[] = [];
    const empty = new FakePostgres([]);
    const first = await runHarness(dir, { env: pgEnv, postgres: () => empty.admin(firstLog) });
    expect(first.out).toEqual(["SUMMARY variants=2 run=2 not-run=0 checked=2 differ=0"]);
    expect(first.code).toBe(0);
    const gitDir = join(dir, ".git");
    const id = readFileSync(join(gitDir, WORKTREE_ID_FILE), "utf8");
    expect(id).toMatch(/^[0-9a-f]{32}\n$/);
    const key = createHash("sha256").update(`${dir}\n${id.trimEnd()}`).digest("hex").slice(0, 8);
    expect(first.worktree).toEqual({ path: dir, key });
    expect(firstLog).toEqual([`create xaravel_test_${key}`, "close"]);

    // Every run gets the isolation env; Redis was not started, so no socket.
    const runs = readFileSync(seen, "utf8").trim().split("\n").map((text) => JSON.parse(text) as Record<string, unknown>);
    const isolated = { key, cache: join(dir, ".cache"), sqlite: join(dir, ".cache", "sqlite"), pg: `xaravel_test_${key}`, redis: null };
    expect(runs).toEqual([
      { variant: "none", ...isolated },
      { variant: "pgsql", ...isolated },
    ]);

    // The same worktree keeps its key.
    const OTHER = "0123abcd";
    const shared = new FakePostgres([`xaravel_test_${key}`, `xaravel_test_${key}_a`, `xaravel_test_${key}x`, `xaravel_test_${key}_B`, `xaravel_test_${OTHER}`, `xaravel_test_${OTHER}_a`, "app", "postgres"]);
    const fullLog: string[] = [];
    const full = await runHarness(dir, { env: pgEnv, postgres: () => shared.admin(fullLog) });
    expect(full.worktree).toEqual({ path: dir, key });
    expect(full.code).toBe(0);
    // Full run: drops K and K_a (sorted), creates K; K-x, K_B (not ^[a-z0-9_]+$), another key's and app are untouched.
    expect(fullLog).toEqual([`drop xaravel_test_${key}`, `drop xaravel_test_${key}_a`, `create xaravel_test_${key}`, "close"]);
    expect(shared.sorted()).toEqual(["app", "postgres", `xaravel_test_${OTHER}`, `xaravel_test_${OTHER}_a`, `xaravel_test_${key}`, `xaravel_test_${key}_B`, `xaravel_test_${key}x`].sort());

    // Fast run: K absent → created, nothing dropped; K present → nothing at all.
    const fastServer = new FakePostgres([`xaravel_test_${key}_a`, "app"]);
    const fastLog: string[] = [];
    const fast = await runHarness(dir, { env: pgEnv, seed: "s", postgres: () => fastServer.admin(fastLog) });
    expect(fast.code).toBe(0);
    expect(fastLog).toEqual([`create xaravel_test_${key}`, "close"]);
    fastLog.length = 0;
    await runHarness(dir, { env: pgEnv, seed: "s", postgres: () => fastServer.admin(fastLog) });
    expect(fastLog).toEqual(["close"]);
    expect(fastServer.sorted()).toEqual(["app", `xaravel_test_${key}`, `xaravel_test_${key}_a`]);

    // A reset failure makes the Variant NOT-RUN; in CI that is a difference.
    const failing = await runHarness(dir, { env: pgEnv, postgres: () => new FakePostgres([]).admin([], "permission denied to create database") });
    expect(failing.out).toEqual(["NOT-RUN [pgsql] 1 line(s): Postgres database reset failed: permission denied to create database", "SUMMARY variants=2 run=1 not-run=1 checked=1 differ=0"]);
    const failingCi = await runHarness(dir, { env: { ...pgEnv, CI: "true" }, postgres: () => new FakePostgres([]).admin([], "boom") });
    expect(failingCi.out[0]).toBe("NOT-RUN [pgsql] 1 line(s): Postgres database reset failed: boom; CI runs every alpha variant (FR-9)");
    expect(failingCi.code).toBe(1);
    const throwingFactory = await runHarness(dir, {
      env: pgEnv,
      postgres: () => {
        throw new Error("no driver");
      },
    });
    expect(throwingFactory.out[0]).toBe("NOT-RUN [pgsql] 1 line(s): Postgres database reset failed: no driver");
  } finally {
    server.close();
  }

  // Two Variants on one Postgres (pgsql, queue-database@pgsql): the databases are reset once.
  const both = makeRoot([{ id: A, variant: "pgsql", status: "skip" }, { id: A, variant: "queue-database@pgsql", status: "skip" }]);
  const bothKey = keyOf(both);
  const bothServer = new FakePostgres([`xaravel_test_${bothKey}`, `xaravel_test_${bothKey}_a`]);
  const bothLog: string[] = [];
  let factories = 0;
  const twice = await listening();
  try {
    const shared = await runHarness(both, {
      env: await env({ PGPORT: String(twice.port) }),
      postgres: () => {
        factories++;
        return bothServer.admin(bothLog);
      },
    });
    expect(shared.out).toEqual(["SUMMARY variants=2 run=2 not-run=0 checked=2 differ=0"]);
  } finally {
    twice.server.close();
  }
  expect(factories).toBe(1);
  expect(bothLog).toEqual([`drop xaravel_test_${bothKey}`, `drop xaravel_test_${bothKey}_a`, `create xaravel_test_${bothKey}`, "close"]);

  // An unreachable Postgres is NOT-RUN as before, and no admin is made.
  let made = 0;
  const down = await runHarness(dir, {
    env: await env(),
    postgres: () => {
      made++;
      return new FakePostgres([]).admin([]);
    },
  });
  expect(down.out[0]).toMatch(/^NOT-RUN \[pgsql\] 1 line\(s\): Postgres at 127\.0\.0\.1:\d+ is not reachable \(ECONNREFUSED\)$/);
  expect(made).toBe(0);

  // ownsDatabase and the guards.
  expect(ownsDatabase("abcd1234", "xaravel_test_abcd1234")).toBe(true);
  expect(ownsDatabase("abcd1234", "xaravel_test_abcd1234_cache_2")).toBe(true);
  expect(ownsDatabase("abcd1234", "xaravel_test_abcd1234_")).toBe(false);
  expect(ownsDatabase("abcd1234", "xaravel_test_abcd1234_A")).toBe(false);
  expect(ownsDatabase("abcd1234", "xaravel_test_abcd1234-x")).toBe(false);
  expect(ownsDatabase("abcd1234", 'xaravel_test_abcd1234_a"; DROP DATABASE app; --')).toBe(false);
  expect(ownsDatabase("abcd1234", "xaravel_test_abcd12345")).toBe(false);
  expect(ownsDatabase("abcd1234", "xaravel_test_0123abcd")).toBe(false);
  expect(ownsDatabase("abcd1234", "app")).toBe(false);
  const admin = postgresAdmin({ PGHOST: "127.0.0.1", PGPORT: String(await closedPort()) });
  try {
    const rejection = async (promise: Promise<unknown>): Promise<string> => {
      try {
        await promise;
        return "resolved";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };
    expect(await rejection(admin.drop("app"))).toContain('refusing to touch database "app"');
    expect(await rejection(admin.create('x"; DROP DATABASE app; --'))).toContain("refusing to touch database");
  } finally {
    await admin.close();
  }
  expect(() => postgresAdmin({ PGPORT: "x" })).toThrow('PGPORT is not a port: "x"');
  const direct = new FakePostgres(["xaravel_test_abcd1234_z", "xaravel_test_abcd1234", "xaravel_test_abcd1234_a"]);
  expect(await recreateDatabases(direct.admin([]), "abcd1234")).toEqual({ dropped: ["xaravel_test_abcd1234", "xaravel_test_abcd1234_a", "xaravel_test_abcd1234_z"], created: ["xaravel_test_abcd1234"] });

  // The root must be the top level of a git worktree.
  const notGit = tempDir("xt-iso-nogit-");
  write(notGit, { "bunfig.toml": "env = false\n", "conformance/variants": VARIANTS, "conformance/inventory/support.jsonl": inventory(lines), [SHARD]: shard(lines) });
  const refused = await runHarness(notGit, { env: await env() });
  expect(refused.code).toBe(1);
  expect(refused.out).toEqual([]);
  expect(refused.err).toHaveLength(1);
  // git's last stderr line follows the message.
  expect(refused.err[0]).toMatch(new RegExp(`^harness: ${notGit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} is not the top level of a git worktree \\(AD-17\\): .*not a git repository`));
  expect(refused.worktree).toBeNull();
  expect(existsSync(join(notGit, ".cache"))).toBe(false);
  const outer = tempDir("xt-iso-outer-");
  Bun.spawnSync(["git", "init", "-q", outer]);
  const nested = join(outer, "sub");
  write(nested, { "bunfig.toml": "env = false\n", "conformance/variants": VARIANTS, "conformance/inventory/support.jsonl": inventory(lines), [SHARD]: shard(lines) });
  const inner = await runHarness(nested, { env: await env() });
  expect(inner.err).toEqual([`harness: ${nested} is not the top level of a git worktree (AD-17)`]);
  // GIT_DIR in the env does not redirect the check.
  expect(worktreeOf(dir, { ...process.env, GIT_DIR: join(outer, ".git") }).path).toBe(dir);

  // A malformed creation id fails a precondition.
  const malformed = makeRoot(lines);
  writeFileSync(join(malformed, ".git", WORKTREE_ID_FILE), "not-an-id\n");
  const bad = await runHarness(malformed, { env: await env() });
  expect(bad.code).toBe(1);
  expect(bad.err.join("\n")).toContain(`${WORKTREE_ID_FILE} is malformed`);

  // A new worktree at the same path gets a new creation id, so a new key.
  const repo = tempDir("xt-iso-repo-");
  git(repo, "init", "-q");
  git(repo, "commit", "-q", "--allow-empty", "-m", "init");
  const linked = join(tempDir("xt-iso-linked-"), "wt");
  git(repo, "worktree", "add", "-q", "--detach", linked);
  const tree = worktreeOf(linked);
  expect(tree.path).toBe(realpathSync(linked));
  expect(tree.gitDir).toContain(join(".git", "worktrees"));
  const before = keyOf(linked);
  expect(keyOf(linked)).toBe(before);
  expect(keyOf(repo)).not.toBe(before);
  git(repo, "worktree", "remove", linked);
  git(repo, "worktree", "add", "-q", "--detach", linked);
  expect(keyOf(linked)).not.toBe(before);

  // Live Postgres, when one is reachable at the default env.
  const live = await probe("pgsql", process.env);
  if (live.reachable) {
    const liveKey = keyOf(dir);
    const setup = postgresAdmin(process.env);
    try {
      for (const name of [`xaravel_test_${liveKey}`, `xaravel_test_${liveKey}_a`]) {
        await setup.drop(name);
        await setup.create(name);
      }
    } finally {
      await setup.close();
    }
    const liveRun = await runHarness(dir, { env: { ...process.env, CI: undefined, XARAVEL_REDIS_SERVER: NO_REDIS_SERVER } });
    expect(liveRun.out.some((line) => line.startsWith("NOT-RUN [pgsql]"))).toBe(false);
    const check = postgresAdmin(process.env);
    try {
      const names = (await check.list()).filter((name) => ownsDatabase(liveKey, name));
      expect(names).toEqual([`xaravel_test_${liveKey}`]);
      await check.drop(`xaravel_test_${liveKey}`);
    } finally {
      await check.close();
    }
  }
}, 60_000);

// ---------------------------------------------------------------------------
// XT-conformance-111

test("XT-conformance-111: the SQLite variant's database files live under the worktree's .cache/ (AD-17)", async () => {
  const lines: Line[] = [{ id: A, variant: "sqlite" }];
  const body = ported(
    [
      `import { Database } from "bun:sqlite";`,
      `import { join } from "node:path";`,
      `portedTest(${JSON.stringify(A)}, {}, () => {`,
      `  const dir = process.env["XARAVEL_SQLITE_DIR"]!;`,
      `  Assert.assertSame(join(process.env["XARAVEL_CACHE_DIR"]!, "sqlite"), dir);`,
      `  const db = new Database(join(dir, "test.db"));`,
      `  db.run("CREATE TABLE t (x INTEGER)");`,
      `  db.run("INSERT INTO t VALUES (1)");`,
      `  Assert.assertSame(1, (db.query("SELECT x FROM t").get() as { x: number }).x);`,
      `  db.close();`,
      `});`,
    ].join("\n"),
  );
  const dir = makeRoot(lines, { [TEST_FILE]: body, ".cache/sqlite/old.db": "stale" });
  const before = outsideCache(dir);
  const full = await runHarness(dir, { env: await env() });
  expect(full.out).toEqual(["SUMMARY variants=1 run=1 not-run=0 checked=1 differ=0"]);
  expect(full.code).toBe(0);
  // The stale file is gone; the test's database is under .cache/sqlite/, and nothing else was written outside .cache.
  expect(existsSync(join(dir, ".cache", "sqlite", "old.db"))).toBe(false);
  expect(existsSync(join(dir, ".cache", "sqlite", "test.db"))).toBe(true);
  expect(outsideCache(dir)).toEqual(before);

  // A fast run only creates the directory: the previous database survives (the test recreates its table, so it fails).
  writeFileSync(join(dir, ".cache", "sqlite", "keep.db"), "kept");
  const fast = await runHarness(dir, { env: await env(), seed: "x" });
  expect(existsSync(join(dir, ".cache", "sqlite", "keep.db"))).toBe(true);
  expect(fast.out.at(-1)).toBe("SUMMARY variants=1 run=1 not-run=0 checked=1 differ=1 mode=fast seed=x");
  // The next full run starts clean again.
  const again = await runHarness(dir, { env: await env() });
  expect(again.code).toBe(0);
  expect(existsSync(join(dir, ".cache", "sqlite", "keep.db"))).toBe(false);
}, 60_000);

// ---------------------------------------------------------------------------
// XT-conformance-112

/** A fake `redis-server`: records its argv, serves PING and FLUSHDB on its unix socket, exits on SIGTERM. */
function fakeRedis(dir: string): string {
  const path = join(dir, "redis-server");
  const script = `#!${process.execPath}
import { appendFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
const log = process.env["FAKE_REDIS_LOG"]!;
const mode = process.env["FAKE_REDIS_MODE"] ?? "serve";
const args = process.argv.slice(2);
const record = (event: Record<string, unknown>): void => appendFileSync(log, JSON.stringify(event) + "\\n");
record({ event: "start", pid: process.pid, args, cwd: process.cwd() });
if (mode === "exit") {
  console.log("starting");
  console.error("FATAL CONFIG FILE ERROR: bad directive");
  process.exit(3);
}
const socket = args[args.indexOf("--unixsocket") + 1]!;
const parse = (buffer: string): { args: string[]; used: number } | null => {
  if (!buffer.startsWith("*")) {
    const end = buffer.indexOf("\\r\\n");
    return end === -1 ? null : { args: buffer.slice(0, end).split(" "), used: end + 2 };
  }
  let at = buffer.indexOf("\\r\\n");
  if (at === -1) return null;
  const count = Number(buffer.slice(1, at));
  at += 2;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const end = buffer.indexOf("\\r\\n", at);
    if (end === -1) return null;
    const length = Number(buffer.slice(at + 1, end));
    if (buffer.length < end + 2 + length + 2) return null;
    out.push(buffer.slice(end + 2, end + 2 + length));
    at = end + 2 + length + 2;
  }
  return { args: out, used: at };
};
const server = createServer((connection) => {
  let buffer = "";
  connection.on("error", () => undefined);
  connection.on("data", (chunk) => {
    buffer += chunk.toString();
    for (let command = parse(buffer); command !== null; command = parse(buffer)) {
      buffer = buffer.slice(command.used);
      const name = (command.args[0] ?? "").toUpperCase();
      record({ event: "command", args: command.args });
      connection.write(name === "PING" ? "+PONG\\r\\n" : name === "FLUSHDB" ? "+OK\\r\\n" : "-ERR unknown command\\r\\n");
    }
  });
});
process.on("SIGTERM", () => {
  record({ event: "stop" });
  server.close();
  rmSync(socket, { force: true });
  process.exit(0);
});
if (mode === "serve") {
  server.listen(socket);
} else {
  setInterval(() => undefined, 1000);
}
`;
  writeFileSync(path, script);
  chmodSync(path, 0o755);
  return path;
}

function events(log: string): Record<string, unknown>[] {
  return existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter((line) => line !== "").map((line) => JSON.parse(line) as Record<string, unknown>) : [];
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test("XT-conformance-112: locally the harness launches one redis-server per worktree on a unix socket in .cache/ with no persistence, tests may flushdb it, and it stops afterwards (AD-17)", async () => {
  const lines: Line[] = [{ id: A, variant: "redis" }];
  const body = ported(
    [
      `import { connect } from "node:net";`,
      `const send = (command: string): Promise<string> => new Promise((done, fail) => {`,
      `  const socket = connect({ path: process.env["XARAVEL_REDIS_SOCKET"]! });`,
      `  let data = "";`,
      `  socket.on("data", (chunk) => { data += chunk.toString(); if (data.endsWith("\\r\\n")) { socket.end(); done(data); } });`,
      `  socket.on("error", fail);`,
      `  socket.write("*1\\r\\n$" + command.length + "\\r\\n" + command + "\\r\\n");`,
      `});`,
      `portedTest(${JSON.stringify(A)}, {}, async () => {`,
      `  Assert.assertSame(process.env["XARAVEL_CACHE_DIR"] + "/redis.sock", process.env["XARAVEL_REDIS_SOCKET"]);`,
      `  Assert.assertSame("+PONG\\r\\n", await send("PING"));`,
      `  Assert.assertSame("+OK\\r\\n", await send("FLUSHDB"));`,
      `});`,
    ].join("\n"),
  );
  const bin = tempDir("xt-iso-bin-");
  const fake = fakeRedis(bin);
  const log = join(tempDir("xt-iso-log-"), "redis.jsonl");
  const dir = makeRoot(lines, { [TEST_FILE]: body });
  // A leftover socket from a killed harness is removed before the start.
  write(dir, { ".cache/redis.sock": "" });
  const socket = join(dir, ".cache", "redis.sock");

  const run = await runHarness(dir, { env: await env({ XARAVEL_REDIS_SERVER: fake, FAKE_REDIS_LOG: log }) });
  expect(run.out).toEqual(["SUMMARY variants=1 run=1 not-run=0 checked=1 differ=0"]);
  expect(run.code).toBe(0);
  const seen = events(log);
  expect(seen.map((event) => event["event"])).toEqual(["start", "command", "command", "stop"]);
  const start = seen[0]!;
  expect(start["args"]).toEqual(["--port", "0", "--unixsocket", socket, "--unixsocketperm", "700", "--save", "", "--appendonly", "no", "--dir", join(dir, ".cache", "redis")]);
  expect(seen.filter((event) => event["event"] === "command").map((event) => event["args"])).toEqual([["PING"], ["FLUSHDB"]]);
  expect(seen.at(-1)).toEqual({ event: "stop" });
  expect(alive(start["pid"] as number)).toBe(false);
  expect(existsSync(join(dir, ".cache", "harness.lock"))).toBe(false);

  // Found on PATH when XARAVEL_REDIS_SERVER is unset.
  rmSync(log, { force: true });
  const onPath = await runHarness(dir, { env: await env({ XARAVEL_REDIS_SERVER: undefined, PATH: `${bin}:${process.env["PATH"] ?? ""}`, FAKE_REDIS_LOG: log }) });
  expect(onPath.code).toBe(0);
  expect(events(log)[0]?.["args"]).toContain(socket);

  // Not found: at the configured path, or on PATH.
  const missing = await runHarness(dir, { env: await env() });
  expect(missing.out).toEqual([`NOT-RUN [redis] 1 line(s): redis-server not found at ${NO_REDIS_SERVER} (AD-17)`, "SUMMARY variants=1 run=0 not-run=1 checked=0 differ=0"]);
  const noPath = await runHarness(dir, { env: await env({ XARAVEL_REDIS_SERVER: undefined, PATH: tempDir("xt-iso-empty-path-") }) });
  expect(noPath.out[0]).toBe("NOT-RUN [redis] 1 line(s): redis-server not found on PATH (AD-17)");

  // It exits at once: the last stderr line.
  const exited = await runHarness(dir, { env: await env({ XARAVEL_REDIS_SERVER: fake, FAKE_REDIS_LOG: log, FAKE_REDIS_MODE: "exit" }) });
  expect(exited.out[0]).toBe("NOT-RUN [redis] 1 line(s): redis-server exited 3: FATAL CONFIG FILE ERROR: bad directive");

  // It never listens: stopped after 5 s.
  rmSync(log, { force: true });
  const silent = await runHarness(dir, { env: await env({ XARAVEL_REDIS_SERVER: fake, FAKE_REDIS_LOG: log, FAKE_REDIS_MODE: "silent" }) });
  expect(silent.out[0]).toBe(`NOT-RUN [redis] 1 line(s): redis-server did not listen on ${socket} within 5000 ms`);
  const silentEvents = events(log);
  expect(silentEvents.at(-1)).toEqual({ event: "stop" });
  expect(alive(silentEvents[0]!["pid"] as number)).toBe(false);

  // A socket path longer than 103 bytes.
  const longBase = join(tempDir("xt-iso-long-"), "x".repeat(100));
  mkdirSync(longBase, { recursive: true });
  const longRoot = makeRoot(lines, { [TEST_FILE]: body }, longBase);
  const long = await runHarness(longRoot, { env: await env({ XARAVEL_REDIS_SERVER: fake, FAKE_REDIS_LOG: log }) });
  expect(long.out[0]).toBe(`NOT-RUN [redis] 1 line(s): socket path ${join(longRoot, ".cache", "redis.sock")} is longer than 103 bytes`);

  // In CI the job's service is the server: nothing is launched, REDIS_HOST/REDIS_PORT is probed.
  rmSync(log, { force: true });
  const ciDown = await runHarness(dir, { env: await env({ CI: "true", XARAVEL_REDIS_SERVER: fake, FAKE_REDIS_LOG: log }) });
  expect(ciDown.out[0]).toMatch(/^NOT-RUN \[redis\] 1 line\(s\): Redis at 127\.0\.0\.1:\d+ is not reachable \(ECONNREFUSED\); CI runs every alpha variant \(FR-9\)$/);
  const { server, port } = await listening();
  try {
    const ciUp = await runHarness(dir, { env: await env({ CI: "true", REDIS_PORT: String(port), XARAVEL_REDIS_SERVER: fake, FAKE_REDIS_LOG: log }) });
    // The probe passes; the test itself has no socket to reach, so it fails rather than being NOT-RUN.
    expect(ciUp.out.some((line) => line.startsWith("NOT-RUN"))).toBe(false);
  } finally {
    server.close();
  }
  expect(existsSync(log)).toBe(false);

  // Two Variants on one Redis (redis, queue-redis@redis) beside sqlite: one server, one socket, and none for sqlite,
  // even with an inherited XARAVEL_REDIS_SOCKET.
  const sockets = join(tempDir("xt-iso-sockets-"), "sockets");
  const multi = makeRoot([{ id: A, variant: "queue-redis@redis" }, { id: A, variant: "redis" }, { id: A, variant: "sqlite" }], {
    [TEST_FILE]: ported(`import { appendFileSync } from "node:fs";\nportedTest(${JSON.stringify(A)}, {}, () => { appendFileSync(${JSON.stringify(sockets)}, process.env["XARAVEL_VARIANT"] + " " + String(process.env["XARAVEL_REDIS_SOCKET"] ?? null) + "\\n"); Assert.assertTrue(true); });`),
  });
  rmSync(log, { force: true });
  const multiRun = await runHarness(multi, { env: await env({ XARAVEL_REDIS_SERVER: fake, FAKE_REDIS_LOG: log, XARAVEL_REDIS_SOCKET: "/inherited.sock" }) });
  expect(multiRun.out).toEqual(["SUMMARY variants=3 run=3 not-run=0 checked=3 differ=0"]);
  expect(events(log).map((event) => event["event"])).toEqual(["start", "stop"]);
  const multiSocket = join(multi, ".cache", "redis.sock");
  expect(readFileSync(sockets, "utf8")).toBe(`queue-redis@redis ${multiSocket}\nredis ${multiSocket}\nsqlite null\n`);

  // SIGTERM to the CLI while it runs: it stops its redis-server, releases the lock and exits 143.
  const release = join(tempDir("xt-iso-release-"), "release");
  const held = makeRoot(lines, { [TEST_FILE]: ported(`${HOLD}\nportedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });`) });
  rmSync(log, { force: true });
  const cli = Bun.spawn([process.execPath, "--no-env-file", HARNESS, "--root", held], { env: (await env({ XARAVEL_REDIS_SERVER: fake, FAKE_REDIS_LOG: log, XT_RELEASE: release })) as Record<string, string>, stdout: "pipe", stderr: "pipe" });
  try {
    await waitFor(() => events(log).length > 0 && existsSync(join(held, ".cache", "harness.lock")));
    // Let the harness spawn its bun test run before the signal.
    await Bun.sleep(200);
    cli.kill("SIGTERM");
    expect(await cli.exited).toBe(143);
    const killed = events(log);
    expect(killed.map((event) => event["event"])).toEqual(["start", "stop"]);
    expect(alive(killed[0]!["pid"] as number)).toBe(false);
    expect(existsSync(join(held, ".cache", "harness.lock"))).toBe(false);
  } finally {
    writeFileSync(release, "");
    cli.kill("SIGKILL");
  }

  // A real redis-server on PATH, when there is one.
  if (Bun.which("redis-server") !== null) {
    const real = await runHarness(dir, { env: await env({ XARAVEL_REDIS_SERVER: undefined }) });
    expect(real.out).toEqual(["SUMMARY variants=1 run=1 not-run=0 checked=1 differ=0"]);
    expect(existsSync(join(dir, ".cache", "redis", "dump.rdb"))).toBe(false);
    expect(existsSync(join(dir, ".cache", "redis", "appendonlydir"))).toBe(false);
  }
}, 60_000);

// ---------------------------------------------------------------------------
// XT-conformance-113

test("XT-conformance-113: a second harness started in the same worktree while .cache/harness.lock is held exits 1 naming the holder (AD-17)", async () => {
  const lines: Line[] = [{ id: A, variant: "none" }, { id: B, variant: "none" }];
  const body = ported(`${HOLD}\nportedTest(${JSON.stringify(A)}, {}, () => { Assert.assertTrue(true); });\nportedTest(${JSON.stringify(B)}, {}, () => { Assert.assertTrue(true); });`);
  const dir = makeRoot(lines, { [TEST_FILE]: body });
  const lockPath = join(dir, ".cache", "harness.lock");
  const holder = (fields: Record<string, unknown>): void => write(dir, { ".cache/harness.lock": `${JSON.stringify(fields)}\n` });

  // Held by a live pid on this host.
  holder({ pid: process.pid, host: hostname(), started: "2026-10-19T10:00:00.000Z", command: "bun run harness --fast" });
  const held = await runHarness(dir, { env: await env() });
  expect(held.code).toBe(1);
  expect(held.out).toEqual([]);
  expect(held.err).toEqual([`harness: .cache/harness.lock is held by pid ${process.pid} on ${hostname()} since 2026-10-19T10:00:00.000Z: bun run harness --fast`]);
  expect(readFileSync(lockPath, "utf8")).toContain("bun run harness --fast");

  // Held on another host, whatever its pid.
  holder({ pid: 2_000_000_000, host: "elsewhere.invalid", started: "s", command: "c" });
  expect((await runHarness(dir, { env: await env() })).err).toEqual(["harness: .cache/harness.lock is held by pid 2000000000 on elsewhere.invalid since s: c"]);

  // Unreadable: held, every field unknown.
  write(dir, { ".cache/harness.lock": "{not json" });
  expect((await runHarness(dir, { env: await env() })).err).toEqual(["harness: .cache/harness.lock is held by pid unknown on unknown since unknown: unknown"]);

  // Stale (a dead pid on this host): taken over, the run proceeds, the lock is removed afterwards.
  const dead = Bun.spawnSync([process.execPath, "-e", "process.stdout.write(String(process.pid))"], { stdout: "pipe" });
  const deadPid = Number(dead.stdout.toString());
  expect(alive(deadPid)).toBe(false);
  holder({ pid: deadPid, host: hostname(), started: "s", command: "c" });
  const stale = await runHarness(dir, { env: await env() });
  expect(stale.out).toEqual(["SUMMARY variants=1 run=1 not-run=0 checked=2 differ=0"]);
  expect(existsSync(lockPath)).toBe(false);

  // Two harnesses at once, in one process: the second fails while the first runs, and the first still passes.
  const firstRun = runHarness(dir, { env: await env() });
  const second = await runHarness(dir, { env: await env() });
  expect(second.code).toBe(1);
  expect(second.err[0]).toMatch(new RegExp(`^harness: \\.cache/harness\\.lock is held by pid ${process.pid} on ${hostname().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} since \\d{4}-\\d\\d-\\d\\dT[^ ]+: `));
  expect((await firstRun).code).toBe(0);
  expect(existsSync(lockPath)).toBe(false);

  // Two CLI processes: the second exits 1 naming the first's pid and command.
  // The first run's Ported Test file holds until the release file is written, after the second CLI is checked.
  const release = join(tempDir("xt-iso-release-"), "release");
  const cliEnv = await env({ XT_RELEASE: release });
  const first = Bun.spawn([process.execPath, "--no-env-file", HARNESS, "--root", dir], { env: cliEnv as Record<string, string>, stdout: "pipe", stderr: "pipe" });
  await waitFor(() => existsSync(lockPath));
  const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { pid: number; host: string; command: string };
  expect(lock.pid).toBe(first.pid);
  expect(lock.host).toBe(hostname());
  expect(lock.command).toContain(`${HARNESS} --root ${dir}`);
  const blocked = Bun.spawnSync([process.execPath, "--no-env-file", HARNESS, "--root", dir], { env: cliEnv as Record<string, string>, stdout: "pipe", stderr: "pipe" });
  expect(blocked.exitCode).toBe(1);
  expect(blocked.stdout.toString()).toBe("");
  expect(blocked.stderr.toString()).toContain(`harness: .cache/harness.lock is held by pid ${first.pid} on ${hostname()} since `);
  expect(blocked.stderr.toString()).toContain(`--root ${dir}`);
  writeFileSync(release, "");
  expect(await first.exited).toBe(0);
  expect(existsSync(lockPath)).toBe(false);

  // The lock API: a released lock removes only its own file.
  const taken = acquireLock(dir, "x");
  expect(() => acquireLock(dir, "y")).toThrow(IsolationError);
  writeFileSync(lockPath, "replaced by someone else\n");
  taken.release();
  expect(existsSync(lockPath)).toBe(true);
  rmSync(lockPath);
}, 60_000);

// ---------------------------------------------------------------------------
// XT-conformance-114

test("XT-conformance-114: two worktrees running in parallel against one Postgres each drop and recreate only their own databases (AD-17)", async () => {
  const lines: Line[] = [{ id: A, variant: "pgsql", status: "skip" }];
  const one = makeRoot(lines);
  const two = makeRoot(lines);
  const k1 = keyOf(one);
  const k2 = keyOf(two);
  expect(k1).not.toBe(k2);
  const OTHER = "fedcba98";
  const shared = new FakePostgres([`xaravel_test_${k1}`, `xaravel_test_${k1}_a`, `xaravel_test_${k2}`, `xaravel_test_${k2}_a`, `xaravel_test_${k2}_b`, `xaravel_test_${OTHER}`, "app"]);
  const log1: string[] = [];
  const log2: string[] = [];
  const { server, port } = await listening();
  try {
    const pgEnv = await env({ PGPORT: String(port) });
    const options = (log: string[]): HarnessOptions => ({ env: pgEnv, postgres: () => shared.admin(log) });
    const [r1, r2] = await Promise.all([runHarness(one, options(log1)), runHarness(two, options(log2))]);
    expect(r1.worktree?.key).toBe(k1);
    expect(r2.worktree?.key).toBe(k2);
    expect([r1.code, r2.code]).toEqual([0, 0]);
  } finally {
    server.close();
  }
  expect(log1).toEqual([`drop xaravel_test_${k1}`, `drop xaravel_test_${k1}_a`, `create xaravel_test_${k1}`, "close"]);
  expect(log2).toEqual([`drop xaravel_test_${k2}`, `drop xaravel_test_${k2}_a`, `drop xaravel_test_${k2}_b`, `create xaravel_test_${k2}`, "close"]);
  expect(shared.sorted()).toEqual(["app", `xaravel_test_${OTHER}`, `xaravel_test_${k1}`, `xaravel_test_${k2}`].sort());
  // Each worktree has its own lock and cache.
  expect(existsSync(join(one, ".cache"))).toBe(true);
  expect(existsSync(join(two, ".cache"))).toBe(true);

  // Live, when a Postgres is reachable at the default env.
  if ((await probe("pgsql", process.env)).reachable) {
    const setup = postgresAdmin(process.env);
    try {
      for (const name of [`xaravel_test_${k1}_a`, `xaravel_test_${k2}_a`]) {
        await setup.drop(name);
        await setup.create(name);
      }
    } finally {
      await setup.close();
    }
    const liveEnv = { ...process.env, CI: undefined, XARAVEL_REDIS_SERVER: NO_REDIS_SERVER };
    const [l1, l2] = await Promise.all([runHarness(one, { env: liveEnv }), runHarness(two, { env: liveEnv })]);
    expect([l1.code, l2.code]).toEqual([0, 0]);
    const check = postgresAdmin(process.env);
    try {
      const names = await check.list();
      expect(names.filter((name) => ownsDatabase(k1, name))).toEqual([`xaravel_test_${k1}`]);
      expect(names.filter((name) => ownsDatabase(k2, name))).toEqual([`xaravel_test_${k2}`]);
      await check.drop(`xaravel_test_${k1}`);
      await check.drop(`xaravel_test_${k2}`);
    } finally {
      await check.close();
    }
  }
}, 60_000);
