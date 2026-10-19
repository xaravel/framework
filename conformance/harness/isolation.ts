// Per-worktree backend isolation for the harness (Story 5.5; AD-17, FR-9,
// NFR-10).
//
// Worktree. The harness root must be the top level of a git worktree
// (`git -C <root> rev-parse --path-format=absolute --show-toplevel
// --absolute-git-dir`, compared with the root's realpath). Its creation id is
// the 32 lowercase hex characters in `<git-dir>/xaravel-worktree-id`, created
// on first use with an exclusive create from 16 random bytes; a lost race
// re-reads the file. `git worktree remove` deletes the git dir, so a new
// worktree at the same path gets a new id. The worktree key is the first 8 hex
// characters of SHA-256 over `<realpath of the top level>\n<id>`.
//
// Lock. `<root>/.cache/harness.lock` is created exclusively and holds one JSON
// line `{pid, host, started, command}`. An existing lock naming a live pid (on
// any host) is held: the harness fails a precondition naming the holder. A
// lock whose pid is on this host and not alive (`kill(pid, 0)` throws `ESRCH`)
// is stale: it is removed and the create retried once. An unreadable lock is
// held, with `unknown` for each field.
//
// Backends:
//   sqlite  `<root>/.cache/sqlite/`, removed and recreated on a full run, only
//           created on a fast run;
//   pgsql   the databases `xaravel_test_<key>` and `xaravel_test_<key>_<suffix>`
//           (suffix `^[a-z0-9_]+$`); a full run drops every one of them and
//           creates `xaravel_test_<key>`, a fast run creates it only when
//           missing. Nothing else is ever dropped;
//   redis   locally, one `redis-server` per harness run on the unix socket
//           `<root>/.cache/redis.sock`, with no persistence, stopped when the
//           harness ends; in CI the job's service (see ./backends.ts).
//
// Nothing here writes outside `<root>/.cache/` and the creation id file.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { parsePort, probe, setting, tryConnect, type ProbeResult } from "./backends";

type Env = Readonly<Record<string, string | undefined>>;

/** A failed isolation precondition; the harness exits 1 with its message. */
export class IsolationError extends Error {}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errnoCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : null;
}

// ---------------------------------------------------------------------------
// Worktree

export const WORKTREE_ID_FILE = "xaravel-worktree-id";
const ID = /^[0-9a-f]{32}$/;

export interface Worktree {
  /** The realpath of the worktree's top level. */
  readonly path: string;
  /** The absolute git dir of the worktree (`.git/worktrees/<name>` for a linked one). */
  readonly gitDir: string;
}

/** The git worktree whose top level is `root`; throws `IsolationError` when `root` is not one. */
export function worktreeOf(root: string, env: Env = process.env): Worktree {
  const failure = new IsolationError(`${root} is not the top level of a git worktree (AD-17)`);
  let real: string;
  try {
    real = realpathSync(root);
  } catch {
    throw failure;
  }
  // GIT_DIR and friends would point git at another repository.
  const gitEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !key.startsWith("GIT_")) {
      gitEnv[key] = value;
    }
  }
  let result;
  try {
    // git is found on the harness's own PATH, not the run env's.
    result = Bun.spawnSync([Bun.which("git") ?? "git", "-C", root, "rev-parse", "--path-format=absolute", "--show-toplevel", "--absolute-git-dir"], { env: gitEnv, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  } catch (error) {
    throw new IsolationError(`${failure.message}: ${message(error)}`);
  }
  if (result.exitCode !== 0) {
    const last = result.stderr
      .toString()
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .at(-1);
    throw last === undefined ? failure : new IsolationError(`${failure.message}: ${last}`);
  }
  const [top, gitDir] = result.stdout.toString().split("\n");
  if (top === undefined || gitDir === undefined || top === "" || gitDir === "") {
    throw failure;
  }
  let realTop: string;
  try {
    realTop = realpathSync(top);
  } catch {
    throw failure;
  }
  if (realTop !== real) {
    throw failure;
  }
  return { path: realTop, gitDir };
}

/** The worktree's creation id, creating `<gitDir>/xaravel-worktree-id` on first use. */
export function creationId(gitDir: string): string {
  const path = join(gitDir, WORKTREE_ID_FILE);
  const read = (): string => {
    const text = readFileSync(path, "utf8");
    const id = text.endsWith("\n") ? text.slice(0, -1) : text;
    if (!ID.test(id)) {
      throw new IsolationError(`${path} is malformed: expected 32 lowercase hex characters (AD-17)`);
    }
    return id;
  };
  if (!existsSync(path)) {
    try {
      writeFileSync(path, `${randomBytes(16).toString("hex")}\n`, { flag: "wx" });
    } catch (error) {
      if (errnoCode(error) !== "EEXIST") {
        throw new IsolationError(`cannot create ${path}: ${message(error)}`);
      }
      // Another harness created it first: read theirs.
    }
  }
  return read();
}

/** The first 8 hex characters of SHA-256 over `<path>\n<id>`. */
export function worktreeKey(path: string, id: string): string {
  return createHash("sha256").update(`${path}\n${id}`).digest("hex").slice(0, 8);
}

// ---------------------------------------------------------------------------
// Lock

export const LOCK_FILE = ".cache/harness.lock";

export interface LockHolder {
  readonly pid: string;
  readonly host: string;
  readonly started: string;
  readonly command: string;
}

export interface Lock {
  /** Removes the lock file, if it is still this lock's. */
  release(): void;
}

function holderOf(text: string): LockHolder {
  const unknown: LockHolder = { pid: "unknown", host: "unknown", started: "unknown", command: "unknown" };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return unknown;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return unknown;
  }
  const record = data as Record<string, unknown>;
  const field = (name: string): string => {
    const value = record[name];
    return typeof value === "string" || (typeof value === "number" && Number.isFinite(value)) ? String(value) : "unknown";
  };
  return { pid: field("pid"), host: field("host"), started: field("started"), command: field("command") };
}

/** Whether `pid` is not a live process on this host. */
function isDead(pid: string): boolean {
  if (!/^[1-9][0-9]*$/.test(pid)) {
    return false;
  }
  try {
    process.kill(Number(pid), 0);
    return false;
  } catch (error) {
    return errnoCode(error) === "ESRCH";
  }
}

/** Takes `<root>/.cache/harness.lock` for `command`; throws `IsolationError` naming the holder when it is held. */
export function acquireLock(root: string, command: string): Lock {
  const cache = join(root, ".cache");
  const path = join(root, LOCK_FILE);
  mkdirSync(cache, { recursive: true });
  const content = `${JSON.stringify({ pid: process.pid, host: hostname(), started: new Date().toISOString(), command })}\n`;
  const read = (): string | null => {
    try {
      return readFileSync(path, "utf8");
    } catch (error) {
      return errnoCode(error) === "ENOENT" ? null : "";
    }
  };
  let staleRetried = false;
  let vanishedRetried = false;
  for (;;) {
    try {
      writeFileSync(path, content, { flag: "wx" });
      return {
        release(): void {
          if (read() === content) {
            rmSync(path, { force: true });
          }
        },
      };
    } catch (error) {
      if (errnoCode(error) !== "EEXIST") {
        throw new IsolationError(`cannot create ${LOCK_FILE}: ${message(error)}`);
      }
    }
    const text = read();
    if (text === null && !vanishedRetried) {
      // Released between the create and the read: the lock is free.
      vanishedRetried = true;
      continue;
    }
    const holder = holderOf(text ?? "");
    if (text !== null && !staleRetried && holder.host === hostname() && isDead(holder.pid)) {
      staleRetried = true;
      // Remove it only if it is still the stale lock read above; another harness may have taken it over already.
      if (read() === text) {
        rmSync(path, { force: true });
        continue;
      }
      const current = read();
      if (current === null) {
        continue;
      }
      const taker = holderOf(current);
      throw new IsolationError(`${LOCK_FILE} is held by pid ${taker.pid} on ${taker.host} since ${taker.started}: ${taker.command}`);
    }
    throw new IsolationError(`${LOCK_FILE} is held by pid ${holder.pid} on ${holder.host} since ${holder.started}: ${holder.command}`);
  }
}

// ---------------------------------------------------------------------------
// Postgres

const SUFFIX = /^[a-z0-9_]+$/;

/** The test database of the worktree `key`. */
export function databaseName(key: string): string {
  return `xaravel_test_${key}`;
}

/** Whether the database `name` belongs to the worktree `key`: `xaravel_test_<key>` or `xaravel_test_<key>_<suffix>`. */
export function ownsDatabase(key: string, name: string): boolean {
  const base = databaseName(key);
  if (name === base) {
    return true;
  }
  return name.startsWith(`${base}_`) && SUFFIX.test(name.slice(base.length + 1));
}

/** The maintenance operations the harness needs on a Postgres server. */
export interface PgAdmin {
  /** Every database name on the server. */
  list(): Promise<string[]>;
  drop(name: string): Promise<void>;
  create(name: string): Promise<void>;
  close(): Promise<void>;
}

/** Any worktree's test database name; the only names the admin will quote into DDL. */
const TEST_DATABASE = /^xaravel_test_[0-9a-f]{8}(?:_[a-z0-9_]+)?$/;

function quoted(name: string): string {
  if (!TEST_DATABASE.test(name)) {
    throw new Error(`refusing to touch database ${JSON.stringify(name)}: not an xaravel_test_<key> name (AD-17)`);
  }
  return `"${name}"`;
}

/** A `Bun.SQL` admin on the maintenance database `PGDATABASE` (default `postgres`) of the server in `env`. */
export function postgresAdmin(env: Env): PgAdmin {
  const host = setting(env, "PGHOST", "127.0.0.1");
  const portText = setting(env, "PGPORT", "5432");
  const port = parsePort(portText);
  if (port === null) {
    throw new Error(`PGPORT is not a port: ${JSON.stringify(portText)}`);
  }
  const user = setting(env, "PGUSER", setting(env, "USER", "postgres"));
  const password = env["PGPASSWORD"];
  const sql = new Bun.SQL({
    adapter: "postgres",
    database: setting(env, "PGDATABASE", "postgres"),
    username: user,
    ...(password === undefined || password === "" ? {} : { password }),
    ...(host.startsWith("/") ? { path: `${host}/.s.PGSQL.${port}` } : { hostname: host, port }),
    max: 1,
    connectionTimeout: 5,
  });
  return {
    async list(): Promise<string[]> {
      const rows = (await sql.unsafe("SELECT datname FROM pg_database")) as { datname: unknown }[];
      return rows.map((row) => String(row.datname));
    },
    async drop(name: string): Promise<void> {
      await sql.unsafe(`DROP DATABASE IF EXISTS ${quoted(name)} WITH (FORCE)`);
    },
    async create(name: string): Promise<void> {
      await sql.unsafe(`CREATE DATABASE ${quoted(name)}`);
    },
    async close(): Promise<void> {
      await sql.close();
    },
  };
}

export interface Recreated {
  readonly dropped: string[];
  readonly created: string[];
}

/**
 * Drops every database `ownsDatabase(key, …)` accepts (sorted), then creates
 * `xaravel_test_<key>`. With `fast`, drops nothing and creates it only when
 * missing.
 */
export async function recreateDatabases(admin: PgAdmin, key: string, options: { fast?: boolean } = {}): Promise<Recreated> {
  const base = databaseName(key);
  const names = await admin.list();
  if (options.fast === true) {
    if (names.includes(base)) {
      return { dropped: [], created: [] };
    }
    await admin.create(base);
    return { dropped: [], created: [base] };
  }
  const owned = names.filter((name) => ownsDatabase(key, name)).sort();
  for (const name of owned) {
    if (!ownsDatabase(key, name)) {
      throw new Error(`refusing to drop ${JSON.stringify(name)}: not a database of worktree ${key} (AD-17)`);
    }
    await admin.drop(name);
  }
  await admin.create(base);
  return { dropped: owned, created: [base] };
}

/** Probes Postgres, then recreates the worktree's databases; a failure is NOT-RUN. */
export async function preparePostgres(env: Env, key: string, fast: boolean, factory: (env: Env) => PgAdmin = postgresAdmin): Promise<ProbeResult> {
  const reachable = await probe("pgsql", env);
  if (!reachable.reachable) {
    return reachable;
  }
  let admin: PgAdmin | null = null;
  try {
    admin = factory(env);
    await recreateDatabases(admin, key, { fast });
    return { reachable: true };
  } catch (error) {
    return { reachable: false, why: `Postgres database reset failed: ${message(error)}` };
  } finally {
    if (admin !== null) {
      try {
        await admin.close();
      } catch {
        // Closing is best-effort.
      }
    }
  }
}

// ---------------------------------------------------------------------------
// SQLite

/** `<root>/.cache/sqlite`: removed and recreated on a full run, only created on a fast run. */
export function prepareSqlite(root: string, fast: boolean): string {
  const dir = join(root, ".cache", "sqlite");
  if (!fast) {
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Redis

export const REDIS_START_MS = 5000;
/** The longest unix socket path the harness uses (`sun_path` is 104 bytes on macOS, with the NUL). */
export const MAX_SOCKET_BYTES = 103;

export interface RedisServer {
  readonly socket: string;
  /** SIGTERM, then awaits the exit. */
  stop(): Promise<void>;
}

export type RedisStart = { readonly reachable: true; readonly server: RedisServer | null } | { readonly reachable: false; readonly why: string };

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/** Collects a piped stream's text until it ends. */
function collect(stream: ReadableStream<Uint8Array>): { text: () => string; done: Promise<void> } {
  let text = "";
  const decoder = new TextDecoder();
  const done = (async (): Promise<void> => {
    try {
      for await (const chunk of stream) {
        text += decoder.decode(chunk, { stream: true });
        if (text.length > 65_536) {
          text = text.slice(-16_384);
        }
      }
    } catch {
      // The stream ends with the process.
    }
  })();
  return { text: () => text, done };
}

/**
 * Locally, starts the worktree's `redis-server` on `<root>/.cache/redis.sock`;
 * with `CI=true`, probes `REDIS_HOST`/`REDIS_PORT` instead and starts nothing.
 */
export async function startRedis(root: string, env: Env): Promise<RedisStart> {
  if (env["CI"] === "true") {
    const status = await probe("redis", env);
    return status.reachable ? { reachable: true, server: null } : status;
  }
  const configured = env["XARAVEL_REDIS_SERVER"];
  let bin: string;
  if (configured !== undefined && configured !== "") {
    if (!existsSync(configured)) {
      return { reachable: false, why: `redis-server not found at ${configured} (AD-17)` };
    }
    bin = configured;
  } else {
    const found = Bun.which("redis-server", { PATH: env["PATH"] ?? "" });
    if (found === null) {
      return { reachable: false, why: "redis-server not found on PATH (AD-17)" };
    }
    bin = found;
  }
  const socket = join(root, ".cache", "redis.sock");
  if (Buffer.byteLength(socket) > MAX_SOCKET_BYTES) {
    return { reachable: false, why: `socket path ${socket} is longer than ${MAX_SOCKET_BYTES} bytes` };
  }
  const dir = join(root, ".cache", "redis");
  mkdirSync(dir, { recursive: true });
  // A leftover from a killed harness; safe to remove because the lock is held.
  rmSync(socket, { force: true });
  const childEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      childEnv[key] = value;
    }
  }
  let child;
  try {
    child = Bun.spawn([bin, "--port", "0", "--unixsocket", socket, "--unixsocketperm", "700", "--save", "", "--appendonly", "no", "--dir", dir], { cwd: dir, env: childEnv, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  } catch (error) {
    return { reachable: false, why: `redis-server exited -1: ${message(error)}` };
  }
  const out = collect(child.stdout);
  const err = collect(child.stderr);
  const state: { exited: number | null } = { exited: null };
  void child.exited.then((code) => {
    state.exited = code;
  });
  const stop = async (): Promise<void> => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }
    const finished = await Promise.race([child.exited.then(() => true), sleep(REDIS_START_MS).then(() => false)]);
    if (!finished) {
      child.kill("SIGKILL");
      await child.exited;
    }
    await Promise.all([out.done, err.done]);
  };
  const deadline = Date.now() + REDIS_START_MS;
  const lines = (text: string): string[] =>
    text
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line !== "");
  while (Date.now() < deadline) {
    if (state.exited !== null) {
      await Promise.all([out.done, err.done]);
      const line = lines(err.text()).at(-1) ?? lines(out.text()).at(-1) ?? "";
      return { reachable: false, why: `redis-server exited ${String(state.exited)}: ${line}` };
    }
    if (existsSync(socket) && (await tryConnect({ path: socket, label: `redis-server at ${socket}` })) === null) {
      return { reachable: true, server: { socket, stop } };
    }
    await sleep(25);
  }
  await stop();
  return { reachable: false, why: `redis-server did not listen on ${socket} within ${REDIS_START_MS} ms` };
}

// ---------------------------------------------------------------------------
// Child env

/** The env every harness run gets for the worktree `key` (plus `XARAVEL_REDIS_SOCKET` when the harness started Redis). */
export function isolationEnv(root: string, key: string): Record<string, string> {
  const cache = join(root, ".cache");
  return {
    XARAVEL_WORKTREE_KEY: key,
    XARAVEL_CACHE_DIR: cache,
    XARAVEL_SQLITE_DIR: join(cache, "sqlite"),
    XARAVEL_PG_DATABASE: databaseName(key),
  };
}
