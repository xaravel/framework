// The Bun primitive probes (Story 8.3; OQ-11, AD-5, AD-20, FR-84;
// docs/ops/probes.md documents usage and how to re-record after a Bun bump).
//
//   bun conformance/probes/probes.ts run [--json] [--root <dir>]
//       (`bun run probes:run`) runs every probe in PROBES on this Bun and
//       prints `<id>: <status>: <evidence>` per probe (or, with --json, one
//       JSON object of `{ "<id>": { "status", "evidence", "workaround" } }`). Exit 0, or 1
//       when the running Bun is not the `.bun-version` pin.
//   bun conformance/probes/probes.ts check [--require-backends] [--root <dir>]
//       (`bun run probes:check`) re-runs the probes and compares them with
//       the record conformance/probes/results.json and with REPORT.md. Prints
//       one violation per line on stderr and exits 1, or prints one
//       `<id>: <status>: <evidence>` line per probe and then
//       `PROBES OK: <s> supported, <u> unsupported, <n> not run (of <t>).`
//   bun conformance/probes/probes.ts record [--root <dir>]
//       (`bun run probes:record`) runs the probes and rewrites results.json
//       from them, keeping each still-unsupported probe's recorded
//       Escalation. Refuses (exit 1, nothing written) when any probe is
//       not-run: a backend row is recorded only from a run against that
//       backend.
//   bun conformance/probes/probes.ts generate [--root <dir>]
//       (`bun run probes:generate`) rewrites conformance/probes/REPORT.md
//       wholly from PROBES and results.json (`renderReport`).
//
// A probe returns `supported` or `unsupported` with evidence. A backend probe
// reads only its XARAVEL_PROBE_* variable (PROBE_ENV) and returns `not-run`
// when it is unset; it never falls back to a default host. A probe that
// throws, or runs past PROBE_TIMEOUT_MS, is `unsupported` with the error as
// evidence. A probe may declare a `workaround` (the AD-5 or ESC-8.3
// workaround an unsupported result rests on); its live result then carries the workaround's
// outcome (`true` restores, `false` fails, `null` not tried, which includes a
// probe that threw or timed out), and `run --json` prints it. The `bun test` probes run committed `*.probe.ts` fixtures (never
// `*.test.ts`, so `bun run test` never collects them) in a `bun test`
// subprocess and read its junit report; the fixtures are found next to this
// file, not under `--root`.
//
// `check` violations (one line each, naming the probe id):
//   - `<id>: live <a>, recorded <b>: <evidence>` (a live result differs);
//   - `<id>: missing from the record (live <status>: <evidence>)`;
//   - `<id>: recorded but not in the registry`;
//   - `<id>: not run (<VARIABLE> unset)`, under --require-backends only;
//   - `<id>: unsupported with no Escalation` (escalation null, or its file
//     conformance/escalations/<ESC>.md missing);
//   - `<id>: unsupported and its workaround (<workaround>) does not hold:
//     <evidence>` (a probe with a workaround is live unsupported and its
//     workaround outcome is not `true`; fails closed on `null`);
//   - `<id>: <ESC> ...` for an Escalation that does not parse, whose
//     `test_ids` lack XT-conformance-156, or whose `proposed` names neither
//     `deferred:` nor `workaround`;
//   - `<id>: <ESC> has no decision (decisions/<ESC>.md does not exist)` or
//     `(decisions/<ESC>.md does not decide it)` (the decision is invalid,
//     stale, or for another id): an unsupported probe's Escalation must be
//     ruled;
//   - `<id>: supported but names Escalation <ESC>`;
//   - `running Bun <Bun.version>, .bun-version <pin>` (the Bun running the
//     probes is not the pinned one; `run` reports it too and exits 1, and
//     `record` refuses to write);
//   - `conformance/probes/results.json: bun <x> differs from .bun-version <y>`;
//   - `conformance/probes/REPORT.md: drift at line <n>; run bun run probes:generate`.
// `check` never writes the record.
//
// Exit codes: 0 pass, 1 violations or any failure (fail closed), 2 usage error.
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { UsageError } from "../../tools/expectations/expectations";
import { decisionStatus, parseEscalation } from "../../tools/escalations/escalations";

export const RESULTS_FILE = "conformance/probes/results.json";
export const REPORT_FILE = "conformance/probes/REPORT.md";
export const BUN_VERSION_FILE = ".bun-version";
export const ESCALATIONS_DIR = "conformance/escalations";
export const DECISIONS_DIR = "decisions";
/** The Xaravel Test every probe Escalation cites (Story 8.3). */
export const ESCALATION_TEST_ID = "XT-conformance-156";
export const ESCALATION_ID = /^ESC-8\.3-[1-9][0-9]*$/;
export const PROBE_TIMEOUT_MS = 60_000;
const FIXTURES_DIR = join(import.meta.dir, "fixtures");
const TOOL_ROOT = resolve(import.meta.dir, "..", "..");

/** The variables backend probes read; nothing else selects a backend. */
export const PROBE_ENV = {
  pgsql: "XARAVEL_PROBE_PGSQL_URL",
  mysql: "XARAVEL_PROBE_MYSQL_URL",
  redis: "XARAVEL_PROBE_REDIS_URL",
  s3: "XARAVEL_PROBE_S3_ENDPOINT",
} as const;
/** The S3-compatible service's fixed bucket and credentials (docs/ops/probes.md). */
export const S3_BUCKET = "probes";
export const S3_ACCESS_KEY = "xaravel-probe";
export const S3_SECRET_KEY = "xaravel-probe-secret";

export type ProbeStatus = "supported" | "unsupported" | "not-run";
export type Env = Readonly<Record<string, string | undefined>>;

export interface LiveResult {
  readonly status: ProbeStatus;
  readonly evidence: string;
  /** Whether the probe's workaround restored what the plain run lacked: `true` restores, `false` fails, `null` not tried (no workaround, supported, not-run, threw or timed out). */
  readonly workaround: boolean | null;
}

/** What a probe's `run` returns; `workaround` is the workaround's outcome when it was tried (absent means not tried). */
export interface ProbeOutcome {
  readonly supported: boolean;
  readonly evidence: string;
  readonly workaround?: boolean | null;
}

export interface Probe {
  readonly id: string;
  readonly group: string;
  /** One line for the report's "What it checks" column (no `|`). */
  readonly checks: string;
  /** The XARAVEL_PROBE_* variable a backend probe needs, or null. */
  readonly backend: string | null;
  /** The workaround an unsupported result rests on (AD-5's bind/snapshot wrapping, or an ESC-8.3 ruling), or null; `check` requires it to hold while the probe is unsupported. */
  readonly workaround: string | null;
  /** Runs the probe; `value` is the backend variable's value (`""` for a backend-free probe). */
  readonly run: (value: string) => Promise<ProbeOutcome>;
}

export interface RecordEntry {
  status: "supported" | "unsupported";
  escalation: string | null;
}

export interface ProbeRecord {
  bun: string;
  probes: Record<string, RecordEntry>;
}

export interface CheckReport {
  violations: string[];
  supported: number;
  unsupported: number;
  notRun: number;
  total: number;
}

function message(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Collects named checks; the probe is supported when every check passed. */
class Checks {
  private readonly failed: string[] = [];
  private readonly passed: string[] = [];
  ok(name: string, pass: boolean, detail?: string): void {
    if (pass) {
      this.passed.push(name);
    } else {
      this.failed.push(detail === undefined ? name : `${name} (${detail})`);
    }
  }
  result(extra = ""): { supported: boolean; evidence: string } {
    const suffix = extra === "" ? "" : `; ${extra}`;
    if (this.failed.length === 0) {
      return { supported: true, evidence: `${this.passed.length} check(s) pass: ${this.passed.join(", ")}${suffix}` };
    }
    return { supported: false, evidence: `failed: ${this.failed.join("; ")}${suffix}` };
  }
}

const show = (value: unknown): string => (typeof value === "bigint" ? `${value}n` : value === undefined ? "undefined" : JSON.stringify(value) ?? typeof value);

// ---------------------------------------------------------------------------
// `bun test` probes

interface JunitTestcase {
  readonly name: string;
  readonly assertions: number | null;
  readonly outcome: "passed" | "failed" | "skipped";
  readonly failure: string | null;
}

/** The `<testcase>` elements of a bun junit report, in document order. */
export function junitTestcases(xml: string): JunitTestcase[] {
  const cases: JunitTestcase[] = [];
  const decode = (text: string): string => text.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  for (const match of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const attributes = match[1]!;
    const inner = match[3] ?? "";
    const name = /\bname="([^"]*)"/.exec(attributes)?.[1];
    const assertions = /\bassertions="(\d+)"/.exec(attributes)?.[1];
    const failure = /<(?:failure|error)\b[^>]*?message="([^"]*)"/.exec(inner)?.[1];
    cases.push({
      name: decode(name ?? ""),
      assertions: assertions === undefined ? null : Number(assertions),
      outcome: /<(?:failure|error)\b/.test(inner) ? "failed" : /<skipped\b/.test(inner) ? "skipped" : "passed",
      failure: failure === undefined ? null : decode(failure),
    });
  }
  return cases;
}

interface BunTestRun {
  readonly exitCode: number;
  readonly cases: Map<string, JunitTestcase>;
  readonly log: string[];
  readonly output: string;
}

/** Runs `bun test` on fixture files (names under FIXTURES_DIR) in a subprocess, with the root's bunfig. */
async function bunTest(files: readonly string[], preload: string | null = null): Promise<BunTestRun> {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-probe-"));
  try {
    const junit = join(dir, "junit.xml");
    const logFile = join(dir, "log.txt");
    writeFileSync(logFile, "");
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && key !== "BUN_OPTIONS" && key !== "NODE_OPTIONS" && !key.startsWith("XARAVEL_")) {
        env[key] = value;
      }
    }
    env["XARAVEL_PROBE_LOG"] = logFile;
    const args = [process.execPath, "test", ...(preload === null ? [] : ["--preload", join(FIXTURES_DIR, preload)]), "--reporter=junit", `--reporter-outfile=${junit}`, ...files.map((file) => join(FIXTURES_DIR, file))];
    const child = Bun.spawn(args, { cwd: TOOL_ROOT, env, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    const xml = existsSync(junit) ? readFileSync(junit, "utf8") : "";
    const cases = new Map(junitTestcases(xml).map((testcase) => [testcase.name, testcase]));
    const log = readFileSync(logFile, "utf8").split("\n").filter((line) => line !== "");
    return { exitCode, cases, log, output: `${stdout}${stderr}`.trim().split("\n").slice(-3).join(" / ") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function caseOutcome(run: BunTestRun, name: string): string {
  const testcase = run.cases.get(name);
  return testcase === undefined ? "absent" : testcase.outcome;
}

async function probeFailing(): Promise<{ supported: boolean; evidence: string }> {
  const run = await bunTest(["failing.probe.ts"]);
  const checks = new Checks();
  checks.ok("a failing test.failing test passes", caseOutcome(run, "a failing test") === "passed", caseOutcome(run, "a failing test"));
  const passing = run.cases.get("a passing test");
  checks.ok("a passing test.failing test fails", passing?.outcome === "failed", `${caseOutcome(run, "a passing test")}${passing?.failure ? `: ${passing.failure}` : ""}`);
  checks.ok("bun test exits 1", run.exitCode === 1, `exit ${run.exitCode}`);
  return checks.result();
}

async function probeSkipIf(): Promise<{ supported: boolean; evidence: string }> {
  const run = await bunTest(["skip-if.probe.ts"]);
  const checks = new Checks();
  checks.ok("skipIf(true) is skipped", caseOutcome(run, "skipIf(true)") === "skipped", caseOutcome(run, "skipIf(true)"));
  checks.ok("skipIf(true)'s body does not run", !run.log.includes("ran skipIf(true)"), `log ${show(run.log)}`);
  checks.ok("skipIf(false) runs and passes", caseOutcome(run, "skipIf(false)") === "passed" && run.log.includes("ran skipIf(false)"), `${caseOutcome(run, "skipIf(false)")}, log ${show(run.log)}`);
  return checks.result();
}

async function probeAssertionCounts(): Promise<{ supported: boolean; evidence: string }> {
  const run = await bunTest(["assertion-counts.probe.ts"]);
  const checks = new Checks();
  const three = run.cases.get("three expects");
  const one = run.cases.get("one expect");
  checks.ok('junit assertions="3" for three expects', three?.assertions === 3, `got ${show(three?.assertions ?? null)}`);
  checks.ok('junit assertions="1" for one expect', one?.assertions === 1, `got ${show(one?.assertions ?? null)}`);
  const planned = run.cases.get("expect.assertions(2) with one");
  checks.ok("expect.assertions(2) fails a test with one expect", planned?.outcome === "failed", `${caseOutcome(run, "expect.assertions(2) with one")}${planned?.failure ? `: ${planned.failure}` : ""}`);
  return checks.result();
}

async function probeSetSystemTime(): Promise<{ supported: boolean; evidence: string }> {
  const run = await bunTest(["set-system-time.probe.ts"]);
  const checks = new Checks();
  const testcase = run.cases.get("setSystemTime sets and restores the clock");
  checks.ok("Date.now() and new Date() return the set instant, and setSystemTime() restores real time", testcase?.outcome === "passed", `${caseOutcome(run, "setSystemTime sets and restores the clock")}${testcase?.failure ? `: ${testcase.failure}` : ""}`);
  checks.ok("all three expects counted", testcase?.assertions === 3, `assertions ${show(testcase?.assertions ?? null)}`);
  return checks.result();
}

async function probePreloadAfterEach(): Promise<{ supported: boolean; evidence: string }> {
  const run = await bunTest(["preload-a.probe.ts", "preload-b.probe.ts"], "preload.ts");
  const checks = new Checks();
  const tests = run.log.filter((line) => line.startsWith("test "));
  checks.ok("four tests in two files ran", tests.length === 4 && tests.some((line) => line.startsWith("test a ")) && tests.some((line) => line.startsWith("test b ")), `log ${show(run.log)}`);
  const paired = run.log.length === 8 && run.log.every((line, index) => (index % 2 === 0 ? line.startsWith("test ") : line === "afterEach"));
  checks.ok("the preload's afterEach ran once after every test", paired, `log ${show(run.log)}`);
  checks.ok("bun test exits 0", run.exitCode === 0, `exit ${run.exitCode}: ${run.output}`);
  return checks.result();
}

// ---------------------------------------------------------------------------
// Bun.sql probes

type Dialect = "pgsql" | "mysql";

const RAW_BINDINGS: Readonly<Record<Dialect, string>> = {
  pgsql: "SELECT $1::int AS i, $2::text AS s, $3::text AS n",
  mysql: "SELECT CAST(? AS SIGNED) AS i, CAST(? AS CHAR) AS s, CAST(? AS CHAR) AS n",
};
const BIGINT_QUERY: Readonly<Record<Dialect, string>> = {
  pgsql: "SELECT 9007199254740993::int8 AS b",
  mysql: "SELECT CAST(9007199254740993 AS SIGNED) AS b",
};
const BACKEND_ID: Readonly<Record<Dialect, string>> = {
  pgsql: "SELECT pg_backend_pid() AS id",
  mysql: "SELECT CONNECTION_ID() AS id",
};
const SET_STATE: Readonly<Record<Dialect, [string, string]>> = {
  pgsql: ["SET application_name = 'xaravel_probe_reserve'", "SELECT current_setting('application_name') AS v"],
  mysql: ["SET @xaravel_probe = 'xaravel_probe_reserve'", "SELECT @xaravel_probe AS v"],
};

type Rows = Record<string, unknown>[];

async function probeRawBindings(dialect: Dialect, url: string): Promise<{ supported: boolean; evidence: string }> {
  const sql = new Bun.SQL(url, { max: 1 });
  const big = new Bun.SQL(url, { max: 1, bigint: true });
  const checks = new Checks();
  try {
    const rows = (await sql.unsafe(RAW_BINDINGS[dialect], [42, "O'Reilly", null])) as Rows;
    const row = rows[0] ?? {};
    checks.ok("an int binds and reads back", row["i"] === 42, `got ${show(row["i"])}`);
    checks.ok("a string with a quote binds", row["s"] === "O'Reilly", `got ${show(row["s"])}`);
    checks.ok("null binds", row["n"] === null, `got ${show(row["n"])}`);
    const bigRows = (await big.unsafe(BIGINT_QUERY[dialect])) as Rows;
    const value = bigRows[0]?.["b"];
    checks.ok("bigint: true reads 9007199254740993 as a bigint", value === 9007199254740993n, `got ${typeof value} ${show(value)}`);
  } finally {
    await sql.close({ timeout: 1 });
    await big.close({ timeout: 1 });
  }
  return checks.result();
}

async function probeReserve(dialect: Dialect, url: string): Promise<{ supported: boolean; evidence: string }> {
  const sql = new Bun.SQL(url, { max: 4 });
  const checks = new Checks();
  const id = async (client: { unsafe: (query: string) => Promise<unknown> }): Promise<string> => String(((await client.unsafe(BACKEND_ID[dialect])) as Rows)[0]?.["id"]);
  try {
    const first = await sql.reserve();
    const second = await sql.reserve();
    try {
      const before = await id(first);
      await first.unsafe(SET_STATE[dialect][0]);
      const state = ((await first.unsafe(SET_STATE[dialect][1])) as Rows)[0]?.["v"];
      const after = await id(first);
      const other = await id(second);
      checks.ok("a reserved connection keeps one backend id across queries", before === after, `${before} then ${after}`);
      checks.ok("a reserved connection keeps its session state (SET)", state === "xaravel_probe_reserve", `got ${show(state)}`);
      checks.ok("a second reserved connection has a different backend id", other !== before, `${before} and ${other}`);
    } finally {
      first.release();
      second.release();
    }
    const one = ((await sql.unsafe("SELECT 1 AS one")) as Rows)[0]?.["one"];
    checks.ok("the pool serves queries after release()", Number(one) === 1, `got ${show(one)}`);
  } finally {
    await sql.close({ timeout: 1 });
  }
  return checks.result();
}

// ---------------------------------------------------------------------------
// Bun.redis probes

const redisPrefix = (probe: string): string => `xaravel-probe:${probe}:${crypto.randomUUID()}:`;

async function probeRedisCommands(url: string): Promise<{ supported: boolean; evidence: string }> {
  const client = new Bun.RedisClient(url);
  const prefix = redisPrefix("commands");
  const [str, counter, hash, list] = ["str", "counter", "hash", "list"].map((name) => `${prefix}${name}`) as [string, string, string, string];
  const checks = new Checks();
  try {
    await client.connect();
    checks.ok("set", (await client.set(str, "value")) === "OK");
    checks.ok("get", (await client.get(str)) === "value");
    checks.ok("incr", (await client.incr(counter)) === 1 && (await client.incr(counter)) === 2);
    checks.ok("expire", (await client.expire(str, 100)) === 1);
    const ttl = await client.ttl(str);
    checks.ok("ttl", ttl > 0 && ttl <= 100, `got ${ttl}`);
    checks.ok("hmset", (await client.hmset(hash, { a: "1", b: "2" })) === "OK");
    const all = await client.hgetall(hash);
    checks.ok("hgetall", show(all) === show({ a: "1", b: "2" }), `got ${show(all)}`);
    const pushed: unknown = await client.send("LPUSH", [list, "x", "y"]);
    const range: unknown = await client.send("LRANGE", [list, "0", "-1"]);
    checks.ok("send() LPUSH and LRANGE", pushed === 2 && show(range) === show(["y", "x"]), `got ${show(pushed)} and ${show(range)}`);
    checks.ok("del", (await client.del(str, counter, hash, list)) === 4);
  } finally {
    await client.send("DEL", [str, counter, hash, list]).catch(() => null);
    client.close();
  }
  return checks.result();
}

async function probeRedisTransactions(url: string): Promise<{ supported: boolean; evidence: string }> {
  const first = new Bun.RedisClient(url);
  const second = new Bun.RedisClient(url);
  const prefix = redisPrefix("transactions");
  const [key, watched] = [`${prefix}key`, `${prefix}watched`];
  const checks = new Checks();
  try {
    await first.connect();
    await second.connect();
    const multi: unknown = await first.send("MULTI", []);
    const queued = [await first.send("SET", [key, "1"]), await first.send("INCR", [key])] as unknown[];
    const exec: unknown = await first.send("EXEC", []);
    checks.ok("MULTI, two commands and EXEC return both results", multi === "OK" && show(queued) === show(["QUEUED", "QUEUED"]) && show(exec) === show(["OK", 2]), `MULTI ${show(multi)}, queued ${show(queued)}, EXEC ${show(exec)}`);
    await first.set(watched, "start");
    await first.send("WATCH", [watched]);
    await second.set(watched, "changed");
    await first.send("MULTI", []);
    await first.send("SET", [watched, "mine"]);
    const aborted: unknown = await first.send("EXEC", []);
    const value = await first.get(watched);
    checks.ok("WATCH on a key changed by a second client makes EXEC return null", aborted === null && value === "changed", `EXEC ${show(aborted)}, value ${show(value)}`);
  } finally {
    await second.send("DEL", [key, watched]).catch(() => null);
    first.close();
    second.close();
  }
  return checks.result();
}

async function probeRedisPubsub(url: string): Promise<{ supported: boolean; evidence: string }> {
  const subscriber = new Bun.RedisClient(url);
  const channel = `${redisPrefix("pubsub")}channel`;
  const checks = new Checks();
  const received: string[] = [];
  let publisher: Bun.RedisClient | null = null;
  try {
    await subscriber.connect();
    publisher = await subscriber.duplicate();
    let arrived: () => void = () => undefined;
    const first = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    await subscriber.subscribe(channel, (text) => {
      received.push(text);
      arrived();
    });
    const receivers = await publisher.publish(channel, "first");
    await Promise.race([first, Bun.sleep(2000)]);
    checks.ok("a subscribe listener receives a message published from a duplicate()", receivers === 1 && show(received) === show(["first"]), `publish ${receivers}, received ${show(received)}`);
    await subscriber.unsubscribe(channel);
    const after = await publisher.publish(channel, "second");
    await Bun.sleep(200);
    checks.ok("unsubscribe stops delivery", after === 0 && show(received) === show(["first"]), `publish ${after}, received ${show(received)}`);
  } finally {
    publisher?.close();
    subscriber.close();
  }
  return checks.result();
}

// ---------------------------------------------------------------------------
// Bun.S3Client probe

async function probeS3(endpoint: string): Promise<{ supported: boolean; evidence: string }> {
  const s3 = new Bun.S3Client({ endpoint, bucket: S3_BUCKET, accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY, region: "us-east-1" });
  const prefix = `xaravel-probe-${crypto.randomUUID()}/`;
  const key = `${prefix}object.txt`;
  const body = "xaravel probe: O'Reilly ✓";
  const checks = new Checks();
  try {
    const written = await s3.write(key, body);
    checks.ok("write", written === Buffer.byteLength(body), `wrote ${written}`);
    const text = await s3.file(key).text();
    checks.ok("file().text()", text === body, `got ${show(text)}`);
    checks.ok("exists", (await s3.exists(key)) === true);
    const size = await s3.size(key);
    checks.ok("size", size === Buffer.byteLength(body), `got ${size}`);
    const listed = await s3.list({ prefix });
    const keys = (listed.contents ?? []).map((item) => item.key);
    checks.ok("list", show(keys) === show([key]), `got ${show(keys)}`);
    const streamed = await new Response(s3.file(key).stream()).text();
    checks.ok("a streamed read", streamed === body, `got ${show(streamed)}`);
    const url = s3.presign(key, { expiresIn: 60 });
    const response = await fetch(url);
    const served = await response.text();
    checks.ok("presign() returns a URL the service serves", response.status === 200 && served === body, `${response.status} ${show(served.slice(0, 80))}`);
    await s3.delete(key);
    checks.ok("delete", (await s3.exists(key)) === false);
  } finally {
    await s3.delete(key).catch(() => null);
  }
  return checks.result();
}

// ---------------------------------------------------------------------------
// Bun.Image probe

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    let c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Wraps raw 8-bit RGBA pixels in a PNG container (Bun.Image takes no raw input). */
export function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1);
  }
  return concat([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", new Uint8Array())]);
}

/** Decodes an 8-bit, non-interlaced RGB or RGBA PNG to RGBA pixels. Throws on anything else. */
export function decodePng(png: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Uint8Array[] = [];
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      const [depth, colour, interlace] = [data[8], data[9], data[12]];
      channels = colour === 6 ? 4 : colour === 2 ? 3 : colour === 0 ? 1 : 0;
      if (depth !== 8 || channels === 0 || interlace !== 0) {
        throw new Error(`unsupported PNG (depth ${depth}, colour type ${colour}, interlace ${interlace})`);
      }
    } else if (type === "IDAT") {
      idat.push(data);
    }
    offset += 12 + length;
  }
  const raw = inflateSync(concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x]!;
      const left = x >= channels ? pixels[y * stride + x - channels]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upLeft = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels]! : 0;
      let predictor = 0;
      if (filter === 1) {
        predictor = left;
      } else if (filter === 2) {
        predictor = up;
      } else if (filter === 3) {
        predictor = (left + up) >> 1;
      } else if (filter === 4) {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      pixels[y * stride + x] = (value + predictor) & 0xff;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < 4; c++) {
      rgba[i * 4 + c] = channels === 4 ? pixels[i * 4 + c]! : channels === 3 ? (c === 3 ? 255 : pixels[i * 3 + c]!) : c === 3 ? 255 : pixels[i]!;
    }
  }
  return { width, height, rgba };
}

const RED = [255, 0, 0, 255] as const;
const BLUE = [0, 0, 255, 255] as const;

/** A 4×2 raw RGBA image: the left half red, the right half blue, the bottom-right pixel green. */
function sourceImage(): Uint8Array {
  const rgba = new Uint8Array(4 * 2 * 4);
  for (let i = 0; i < 8; i++) {
    rgba.set(i % 4 < 2 ? RED : BLUE, i * 4);
  }
  rgba.set([0, 255, 0, 255], 7 * 4);
  return encodeRgbaPng(4, 2, rgba);
}

/** Inserts an EXIF APP1 segment with Orientation 6 (rotate 90° clockwise) after a JPEG's SOI. */
function withExifOrientation6(jpeg: Uint8Array): Uint8Array {
  const exif = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]);
  const segment = concat([new Uint8Array([0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 0xff]), exif]);
  return concat([jpeg.subarray(0, 2), segment, jpeg.subarray(2)]);
}

const pixel = (image: { width: number; rgba: Uint8Array }, x: number, y: number): number[] => [...image.rgba.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];
const near = (a: readonly number[], b: readonly number[]): boolean => a.every((value, index) => Math.abs(value - b[index]!) <= 8);

type ImageCheck = (source: Uint8Array) => Promise<string | null>;

/** A gap message when `method` is not a Bun.Image method, else null. */
function missing(...methods: string[]): string | null {
  const absent = methods.filter((method) => typeof (Bun.Image.prototype as unknown as Record<string, unknown>)[method] !== "function");
  return absent.length === 0 ? null : `no Bun.Image.prototype.${absent.join("/")}`;
}

async function encodeTo(source: Uint8Array, method: "webp" | "jpeg" | "png" | "avif" | "heic", format: string): Promise<string | null> {
  const bytes = await new Bun.Image(source)[method]().bytes();
  const metadata = await new Bun.Image(bytes).metadata();
  return metadata.format === format ? null : `.${method}() wrote ${metadata.format}`;
}

async function pngOf(image: Bun.Image): Promise<{ width: number; height: number; rgba: Uint8Array }> {
  return decodePng(await image.png().bytes());
}

/**
 * One check per operation of Upstream src/Illuminate/Image/Image.php: null
 * when a Bun.Image method performs it, else the gap. A missing method or an
 * ERR_IMAGE_FORMAT_UNSUPPORTED rejection is a gap.
 */
export const IMAGE_OPERATIONS: Readonly<Record<string, ImageCheck>> = {
  cover: async () => {
    // Laravel's cover(2, 2) of a 4×2 image is a 2×2 centre crop of an aspect-preserving resize; Bun.Image has no crop and no `cover` fit.
    try {
      new Bun.Image(new Uint8Array()).resize(2, 2, { fit: "cover" as "fill" });
    } catch (error) {
      return `resize(w, h, { fit: "cover" }) throws ${message(error)}; ${missing("crop", "extract") ?? "crop exists"}`;
    }
    return missing("crop", "extract");
  },
  contain: async (source) => {
    const image = await pngOf(new Bun.Image(source).resize(2, 2, { fit: "inside" }));
    return image.width === 2 && image.height === 2 ? null : `resize(2, 2, { fit: "inside" }) gives ${image.width}×${image.height}, not the padded 2×2 canvas; ${missing("extend") ?? "extend exists"}`;
  },
  crop: async () => missing("crop", "extract"),
  resize: async (source) => {
    const image = await pngOf(new Bun.Image(source).resize(2, 3, { fit: "fill" }));
    return image.width === 2 && image.height === 3 ? null : `resize(2, 3) gives ${image.width}×${image.height}`;
  },
  scale: async (source) => {
    const image = await pngOf(new Bun.Image(source).resize(2, 2, { fit: "inside" }));
    return image.width === 2 && image.height === 1 ? null : `resize(2, 2, { fit: "inside" }) gives ${image.width}×${image.height}, expected 2×1`;
  },
  rotate: async (source) => {
    const right = await pngOf(new Bun.Image(source).rotate(90));
    if (right.width !== 2 || right.height !== 4) {
      return `rotate(90) gives ${right.width}×${right.height}`;
    }
    let diagonal: { width: number; height: number };
    try {
      diagonal = await pngOf(new Bun.Image(source).rotate(45));
    } catch (error) {
      return `rotate(90) works; rotate(45) (Laravel takes any float angle) throws ${message(error)}`;
    }
    // A 45° rotation of 4×2 has a bounding box of about 4.2×4.2: both sides beyond 2, and neither 4×2 nor 2×4.
    const rotated = diagonal.width > 2 && diagonal.height > 2 && !(diagonal.width === 4 && diagonal.height === 2) && !(diagonal.width === 2 && diagonal.height === 4);
    return rotated ? null : `rotate(45) gives ${diagonal.width}×${diagonal.height}, not a 45° rotation of 4×2`;
  },
  orient: async (source) => {
    const jpeg = withExifOrientation6(await new Bun.Image(source).jpeg({ quality: 100 }).bytes());
    const oriented = await pngOf(new Bun.Image(jpeg, { autoOrient: true }));
    const raw = await pngOf(new Bun.Image(jpeg, { autoOrient: false }));
    return oriented.width === 2 && oriented.height === 4 && raw.width === 4 && raw.height === 2
      ? null
      : `EXIF Orientation 6 with autoOrient gives ${oriented.width}×${oriented.height}, without ${raw.width}×${raw.height}`;
  },
  blur: async () => missing("blur"),
  grayscale: async (source) => {
    const image = await pngOf(new Bun.Image(source).modulate({ saturation: 0 }));
    const grey = image.width === 4 && image.height === 2 && [0, 1, 2, 3].every((x) => {
      const [r, g, b] = pixel(image, x, 0);
      return r === g && g === b;
    });
    return grey ? null : `modulate({ saturation: 0 }) gives ${image.width}×${image.height} with pixel ${show(pixel(image, 0, 0))}`;
  },
  sharpen: async () => missing("sharpen"),
  flipVertically: async (source) => {
    const image = await pngOf(new Bun.Image(source).flip());
    return image.width === 4 && image.height === 2 && near(pixel(image, 3, 0), [0, 255, 0, 255]) && near(pixel(image, 0, 0), RED)
      ? null
      : `flip() moves the bottom-right pixel to ${show(pixel(image, 3, 0))} at the top-right`;
  },
  flipHorizontally: async (source) => {
    const image = await pngOf(new Bun.Image(source).flop());
    return image.width === 4 && image.height === 2 && near(pixel(image, 0, 1), [0, 255, 0, 255]) && near(pixel(image, 0, 0), BLUE)
      ? null
      : `flop() gives ${show(pixel(image, 0, 1))} at the bottom-left`;
  },
  toWebp: async (source) => encodeTo(source, "webp", "webp"),
  toJpeg: async (source) => encodeTo(source, "jpeg", "jpeg"),
  toPng: async (source) => encodeTo(source, "png", "png"),
  toGif: async () => missing("gif"),
  toAvif: async (source) => encodeTo(source, "avif", "avif"),
  toHeic: async (source) => encodeTo(source, "heic", "heic"),
  toJxl: async () => missing("jxl"),
  toBmp: async () => missing("bmp"),
  dimensions: async (source) => {
    const metadata = await new Bun.Image(source).metadata();
    return metadata.width === 4 && metadata.height === 2 ? null : `metadata() gives ${metadata.width}×${metadata.height}`;
  },
  dominantColor: async () => missing("dominantColor"),
};

async function probeImage(): Promise<{ supported: boolean; evidence: string }> {
  const previous = Bun.Image.backend;
  // The portable backend: byte-identical to Linux, so the result does not depend on the host's OS codecs.
  Bun.Image.backend = "bun";
  const gaps: string[] = [];
  const supported: string[] = [];
  try {
    const source = sourceImage();
    for (const [operation, check] of Object.entries(IMAGE_OPERATIONS)) {
      let gap: string | null;
      try {
        gap = await check(source);
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        gap = `${typeof code === "string" ? `${code}: ` : ""}${message(error)}`;
      }
      if (gap === null) {
        supported.push(operation);
      } else {
        gaps.push(`${operation}: ${gap}`);
      }
    }
  } finally {
    Bun.Image.backend = previous;
  }
  const head = `Bun.Image.backend "bun"; supported (${supported.length}): ${supported.join(", ")}`;
  return gaps.length === 0 ? { supported: true, evidence: head } : { supported: false, evidence: `gaps (${gaps.length}): ${gaps.join("; ")}; ${head}` };
}

// ---------------------------------------------------------------------------
// AsyncLocalStorage probes: the framework's shape, `als.run(frame, ...)` inside a `Bun.serve` fetch

interface Frame {
  readonly name: string;
}

type ResponseBody = ConstructorParameters<typeof Response>[0];
type StreamSource = ConstructorParameters<typeof ReadableStream>[0];

/** What a scenario observed: the store seen at the probe point. */
type Seen = (store: Frame | undefined) => void;
/** Builds the response inside the frame; `wrap` applies AD-5's bind/snapshot workaround. */
type Scenario = (als: AsyncLocalStorage<Frame>, seen: Seen, wrap: boolean) => Response | Promise<Response>;

/** Serves one request whose fetch runs `scenario` in a fresh frame; resolves to whether the store seen was that frame. */
async function serveOnce(scenario: Scenario, wrap: boolean): Promise<{ same: boolean; seen: string }> {
  const als = new AsyncLocalStorage<Frame>();
  const frame: Frame = { name: "frame" };
  const observed: { store: Frame | undefined | "nothing" } = { store: "nothing" };
  let done: () => void = () => undefined;
  const settled = new Promise<void>((resolve) => {
    done = resolve;
  });
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () =>
      als.run(frame, () =>
        scenario(
          als,
          (store) => {
            observed.store = store;
            done();
          },
          wrap,
        ),
      ),
  });
  try {
    const response = await fetch(server.url);
    await response.text();
    await Promise.race([settled, Bun.sleep(2000)]);
  } finally {
    void server.stop(true);
  }
  const seen = observed.store;
  return { same: seen === frame, seen: seen === "nothing" ? "nothing (the probe point never ran)" : seen === undefined ? "undefined" : seen === frame ? "the frame" : "another store" };
}

/** Runs a scenario plain and, when the store is lost, with AD-5's bind/snapshot workaround, reporting whether it restored the frame. */
async function alsProbe(point: string, workaround: string, scenario: Scenario): Promise<ProbeOutcome> {
  const plain = await serveOnce(scenario, false);
  if (plain.same) {
    return { supported: true, evidence: `the store ${point} is the frame` };
  }
  const wrapped = await serveOnce(scenario, true);
  return { supported: false, evidence: `the store ${point} is ${plain.seen}, not the frame; ${workaround} restores the frame: ${wrapped.same ? "yes" : `no (${wrapped.seen})`}`, workaround: wrapped.same };
}

const ALS_AWAIT: Scenario = async (als, seen, wrap) => {
  const snapshot = AsyncLocalStorage.snapshot();
  const after = (fn: () => void): void => (wrap ? snapshot(fn) : fn());
  await Bun.sleep(1);
  after(() => seen(als.getStore()));
  return new Response("ok");
};

const ALS_TIMERS: Scenario = (als, seen, wrap) => {
  const callback = (): void => seen(als.getStore());
  setTimeout(wrap ? AsyncLocalStorage.bind(callback) : callback, 5);
  return new Response("ok");
};

const ALS_STREAM_BODY: Scenario = (als, seen, wrap) => {
  const pull = async (controller: ReadableStreamDefaultController<string>): Promise<void> => {
    await Bun.sleep(1);
    seen(als.getStore());
    controller.enqueue("ok");
    controller.close();
  };
  return new Response(new ReadableStream<string>({ pull: wrap ? AsyncLocalStorage.bind(pull) : pull }));
};

const ALS_ASYNC_GENERATOR: Scenario = (als, seen, wrap) => {
  const generator = (async function* (): AsyncGenerator<string> {
    await Bun.sleep(1);
    seen(als.getStore());
    yield "ok";
  })();
  if (!wrap) {
    return new Response(generator as unknown as ResponseBody);
  }
  // The body runs inside next(), return() and throw(), so each runs under a snapshot taken in the frame.
  const snapshot = AsyncLocalStorage.snapshot();
  const wrapped: AsyncIterable<string> = {
    [Symbol.asyncIterator]: () => ({
      next: () => snapshot(() => generator.next()),
      return: (value?: unknown) => snapshot(() => generator.return(value)),
      throw: (error?: unknown) => snapshot(() => generator.throw(error)),
    }),
  };
  return new Response(wrapped as unknown as ResponseBody);
};

const ALS_DIRECT_STREAM: Scenario = (als, seen, wrap) => {
  const pull = (controller: { write: (chunk: string) => void; close: () => void }): void => {
    seen(als.getStore());
    controller.write("ok");
    controller.close();
  };
  const source = { type: "direct", pull: wrap ? AsyncLocalStorage.bind(pull) : pull };
  return new Response(new ReadableStream(source as unknown as StreamSource));
};

/** Two concurrent requests whose awaits interleave each see their own frame after every await. */
async function probeConcurrentRequests(): Promise<ProbeOutcome> {
  const als = new AsyncLocalStorage<Frame>();
  const order: string[] = [];
  let started = 0;
  let bothStarted: () => void = () => undefined;
  const barrier = new Promise<void>((resolve) => {
    bothStarted = resolve;
  });
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request) => {
      const path = new URL(request.url).pathname;
      const frame: Frame = { name: path };
      return als.run(frame, async () => {
        const seen: boolean[] = [];
        if (++started === 2) {
          bothStarted();
        }
        await Promise.race([barrier, Bun.sleep(1000)]);
        for (let i = 0; i < 3; i++) {
          await Bun.sleep(path === "/a" ? 2 : 3);
          order.push(`${path.slice(1)}${i}`);
          seen.push(als.getStore() === frame);
        }
        return new Response(JSON.stringify(seen));
      });
    },
  });
  try {
    const [a, b] = await Promise.all([fetch(new URL("/a", server.url)), fetch(new URL("/b", server.url))]);
    const concurrent = `/a ${await a.text()}, /b ${await b.text()}`;
    // The awaits overlap when each request's first resume comes before the other's last.
    const interleaved = order.indexOf("a0") !== -1 && order.indexOf("b0") !== -1 && order.indexOf("a0") < order.indexOf("b2") && order.indexOf("b0") < order.indexOf("a2");
    return {
      supported: interleaved && concurrent === "/a [true,true,true], /b [true,true,true]",
      evidence: `two concurrent requests see their own frame after each await: ${concurrent}; resume order ${order.join(" ")} (interleaved: ${interleaved ? "yes" : "no"})`,
    };
  } finally {
    void server.stop(true);
  }
}

const SNAPSHOT = Symbol("xaravel.probe.snapshot");
const ERROR_WORKAROUND = "an AsyncLocalStorage.snapshot() taken in the frame and carried on the error";

/** The `error` callback sees the frame of the request that threw. */
async function probeServeCallbacks(): Promise<ProbeOutcome> {
  const run = async (wrap: boolean): Promise<{ error: string; ok: boolean }> => {
    const als = new AsyncLocalStorage<Frame>();
    const frame: Frame = { name: "/error" };
    let errorSeen: string = "nothing (the error callback never ran)";
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () =>
        als.run(frame, async () => {
          await Bun.sleep(1);
          const error = new Error("probe");
          if (wrap) {
            // AD-5's workaround: a snapshot taken in the frame travels with the error.
            Object.defineProperty(error, SNAPSHOT, { value: AsyncLocalStorage.snapshot() });
          }
          throw error;
        }),
      error: (error) => {
        const snapshot = (error as unknown as Record<symbol, (<R>(fn: () => R) => R) | undefined>)[SNAPSHOT];
        const store = snapshot === undefined ? als.getStore() : snapshot(() => als.getStore());
        errorSeen = store === frame ? "the frame" : store === undefined ? "undefined" : "another store";
        return new Response("error", { status: 500 });
      },
    });
    try {
      const failed = await fetch(new URL("/error", server.url));
      await failed.text();
      return { error: errorSeen, ok: errorSeen === "the frame" && failed.status === 500 };
    } finally {
      void server.stop(true);
    }
  };
  const plain = await run(false);
  const head = `the error callback sees ${plain.error}`;
  if (plain.ok) {
    return { supported: true, evidence: head };
  }
  const wrapped = await run(true);
  return { supported: false, evidence: `${head}; ${ERROR_WORKAROUND} restores the frame: ${wrapped.ok ? "yes" : `no (${wrapped.error})`}`, workaround: wrapped.ok };
}

// ---------------------------------------------------------------------------
// The registry

const BUN_TEST = "bun test";
const SQL = "Bun.sql";
const REDIS = "Bun.redis";
const S3 = "Bun.S3Client";
const IMAGE = "Bun.Image";
const ALS = "AsyncLocalStorage";

/** The groups, in report order: one per OQ-11 bullet. */
export const GROUPS = [BUN_TEST, SQL, REDIS, S3, IMAGE, ALS] as const;

const backendFree = (id: string, group: string, checks: string, run: () => Promise<ProbeOutcome>, workaround: string | null = null): Probe => ({ id, group, checks, backend: null, workaround, run: () => run() });
const backend = (id: string, group: string, checks: string, variable: string, run: (value: string) => Promise<ProbeOutcome>): Probe => ({ id, group, checks, backend: variable, workaround: null, run });
/** An AsyncLocalStorage scenario probe whose workaround is `workaround`. */
const alsScenario = (id: string, checks: string, point: string, workaround: string, scenario: Scenario): Probe => backendFree(id, ALS, checks, () => alsProbe(point, workaround, scenario), workaround);

/** Every probe, in report order. */
export const PROBES: readonly Probe[] = [
  backendFree("bun-test.failing", BUN_TEST, "A failing `test.failing` test passes and a passing one fails.", probeFailing),
  backendFree("bun-test.skipIf", BUN_TEST, "`test.skipIf(true)` skips without running; `skipIf(false)` runs.", probeSkipIf),
  backendFree("bun-test.assertion-counts", BUN_TEST, "The junit `assertions` attribute equals each test's `expect` count; `expect.assertions(n)` fails a test with fewer.", probeAssertionCounts),
  backendFree("bun-test.setSystemTime", BUN_TEST, "`Date.now()` and `new Date()` return the set instant; `setSystemTime()` restores real time.", probeSetSystemTime),
  backendFree("bun-test.preload-afterEach", BUN_TEST, "An `afterEach` in a `--preload` file runs once after every test, in each of two files.", probePreloadAfterEach),
  backend("bun-sql.pgsql.raw-bindings", SQL, "Postgres `sql.unsafe(query, params)`: an int, a quoted string and null round-trip; `bigint: true` reads 9007199254740993 as a bigint.", PROBE_ENV.pgsql, (url) => probeRawBindings("pgsql", url)),
  backend("bun-sql.pgsql.reserve", SQL, "Postgres `reserve()`: one `pg_backend_pid()` and its `SET` state across two queries; a second reservation differs; the pool serves after `release()`.", PROBE_ENV.pgsql, (url) => probeReserve("pgsql", url)),
  backend("bun-sql.mysql.raw-bindings", SQL, "MySQL `sql.unsafe(query, params)`: an int, a quoted string and null round-trip; `bigint: true` reads 9007199254740993 as a bigint.", PROBE_ENV.mysql, (url) => probeRawBindings("mysql", url)),
  backend("bun-sql.mysql.reserve", SQL, "MySQL `reserve()`: one `CONNECTION_ID()` and its `SET` state across two queries; a second reservation differs; the pool serves after `release()`.", PROBE_ENV.mysql, (url) => probeReserve("mysql", url)),
  backend("bun-redis.commands", REDIS, "`set`, `get`, `incr`, `expire`, `ttl`, `hmset`, `hgetall`, `del`, and `send()` for `LPUSH` and `LRANGE`.", PROBE_ENV.redis, probeRedisCommands),
  backend("bun-redis.transactions", REDIS, "`MULTI`, two commands and `EXEC` on one client return both results; `WATCH` on a key a second client changes makes `EXEC` return null.", PROBE_ENV.redis, probeRedisTransactions),
  backend("bun-redis.pubsub", REDIS, "A `subscribe` listener receives a message published from a `duplicate()`; `unsubscribe` stops delivery.", PROBE_ENV.redis, probeRedisPubsub),
  backend("bun-s3.client", S3, "`write`, `file().text()`, `exists`, `size`, `list`, `delete`, a streamed read, and a `presign()` URL the service serves.", PROBE_ENV.s3, probeS3),
  backendFree("bun-image.laravel-api", IMAGE, "Each operation of Upstream `Image.php` (cover … dominantColor) on a raw RGBA image, by output dimensions or format.", probeImage),
  alsScenario("als.await", "Inside `als.run(frame, …)` in a `Bun.serve` fetch, the store after `await Bun.sleep(1)`.", "after `await Bun.sleep(1)`", "AsyncLocalStorage.snapshot()", ALS_AWAIT),
  alsScenario("als.timers", "The store in a `setTimeout` scheduled in the frame, firing after the handler returned.", "in the setTimeout callback", "AsyncLocalStorage.bind on the callback", ALS_TIMERS),
  alsScenario("als.stream-body", "The store in a `ReadableStream` body's `pull`, after an `await`.", "in the ReadableStream pull after an await", "AsyncLocalStorage.bind on pull", ALS_STREAM_BODY),
  alsScenario("als.async-generator", "The store in an async generator response body, after an `await`.", "in the async generator body after an await", "an AsyncLocalStorage.snapshot() taken in the frame around next(), return() and throw()", ALS_ASYNC_GENERATOR),
  alsScenario("als.direct-stream", 'The store in a `type: "direct"` body\'s `pull`.', 'in the type: "direct" pull', "AsyncLocalStorage.bind on pull", ALS_DIRECT_STREAM),
  backendFree("als.concurrent-requests", ALS, "Two concurrent requests whose awaits interleave each see their own frame after every `await`.", probeConcurrentRequests),
  backendFree("als.serve-callbacks", ALS, "The `error` callback sees the frame of the request that threw.", probeServeCallbacks, ERROR_WORKAROUND),
];

/** Runs one probe: not-run without its backend variable, unsupported when it throws or times out; the workaround outcome is null unless the probe tried it. */
export async function runProbe(probe: Probe, env: Env): Promise<LiveResult> {
  let value = "";
  if (probe.backend !== null) {
    const configured = env[probe.backend];
    if (configured === undefined || configured === "") {
      return { status: "not-run", evidence: `${probe.backend} unset`, workaround: null };
    }
    value = configured;
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${PROBE_TIMEOUT_MS} ms`)), PROBE_TIMEOUT_MS);
    });
    const result = await Promise.race([probe.run(value), timeout]);
    return { status: result.supported ? "supported" : "unsupported", evidence: result.evidence, workaround: result.workaround ?? null };
  } catch (error) {
    return { status: "unsupported", evidence: `the probe threw ${message(error)}`, workaround: null };
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

/** Runs every probe in `registry` (default PROBES), one at a time, with the backend variables read from `env`. */
export async function runProbes(env: Env, registry: readonly Probe[] = PROBES): Promise<Map<string, LiveResult>> {
  const results = new Map<string, LiveResult>();
  for (const probe of registry) {
    results.set(probe.id, await runProbe(probe, env));
  }
  return results;
}

// ---------------------------------------------------------------------------
// The record, the report and the check

/** Parses results.json's text; throws naming the problem. */
export function parseRecord(text: string): ProbeRecord {
  const data = JSON.parse(text) as unknown;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("must be a JSON object");
  }
  const { bun, probes } = data as Record<string, unknown>;
  if (typeof bun !== "string") {
    throw new Error("bun must be a string");
  }
  if (typeof probes !== "object" || probes === null || Array.isArray(probes)) {
    throw new Error("probes must be an object");
  }
  const entries: Record<string, RecordEntry> = {};
  for (const [id, entry] of Object.entries(probes)) {
    const { status, escalation } = (entry ?? {}) as Record<string, unknown>;
    if (status !== "supported" && status !== "unsupported") {
      throw new Error(`${id}: status must be supported or unsupported, got ${JSON.stringify(status)}`);
    }
    if (escalation !== null && (typeof escalation !== "string" || !ESCALATION_ID.test(escalation))) {
      throw new Error(`${id}: escalation must be null or ESC-8.3-<n>, got ${JSON.stringify(escalation)}`);
    }
    entries[id] = { status, escalation };
  }
  return { bun, probes: entries };
}

/** results.json's text for `record`: ids sorted, two-space indent, LF-terminated. */
export function serializeRecord(record: ProbeRecord): string {
  const probes: Record<string, RecordEntry> = {};
  for (const id of Object.keys(record.probes).sort(compare)) {
    const entry = record.probes[id]!;
    probes[id] = { status: entry.status, escalation: entry.escalation };
  }
  return `${JSON.stringify({ bun: record.bun, probes }, null, 2)}\n`;
}

/** REPORT.md, wholly generated from the registry and the record. */
export function renderReport(registry: readonly Probe[], record: ProbeRecord): string {
  const counts = { supported: 0, unsupported: 0, unrecorded: 0 };
  const rows: string[] = [];
  for (const probe of registry) {
    const entry = record.probes[probe.id];
    const result = entry === undefined ? "not recorded" : entry.status;
    if (entry === undefined) {
      counts.unrecorded++;
    } else {
      counts[entry.status]++;
    }
    const escalation = entry?.escalation ?? null;
    const escalationCell = escalation === null ? "—" : `[${escalation}](../escalations/${escalation}.md)`;
    const decisionCell = escalation === null ? "—" : `[decisions/${escalation}.md](../../decisions/${escalation}.md)`;
    rows.push(`| ${probe.group} | \`${probe.id}\` | ${probe.checks} | ${result} | ${escalationCell} | ${decisionCell} |`);
  }
  return [
    "# Bun primitive probes (OQ-11)",
    "",
    "<!-- Generated by bun run probes:generate from conformance/probes/probes.ts and results.json; do not edit. -->",
    "",
    `Results on Bun ${record.bun}: ${counts.supported} supported, ${counts.unsupported} unsupported, ${counts.unrecorded} not recorded, of ${registry.length} probes (Story 8.3, PRD OQ-11). \`bun run probes:check\` re-runs the probes and fails on any difference; docs/ops/probes.md explains how to run and re-record them. Each unsupported probe names its Escalation and its decision; \`probes:check\` fails until that decision rules on the Escalation.`,
    "",
    "| Group | Probe | What it checks | Result | Escalation | Decision |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

/** Reads and parses the root's record; throws naming the problem. */
export function readRecord(root: string): ProbeRecord {
  const path = join(root, RESULTS_FILE);
  if (!existsSync(path)) {
    throw new Error(`${RESULTS_FILE}: missing`);
  }
  try {
    return parseRecord(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${RESULTS_FILE}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** The problems with an unsupported probe's Escalation; empty when it is a valid Story 8.3 Escalation that `decisions/<ESC>.md` decides. */
function escalationProblems(root: string, id: string, escalation: string | null): string[] {
  if (escalation === null) {
    return [`${id}: unsupported with no Escalation`];
  }
  const file = `${ESCALATIONS_DIR}/${escalation}.md`;
  if (!existsSync(join(root, file))) {
    return [`${id}: unsupported with no Escalation (${file} does not exist)`];
  }
  const parsed = parseEscalation(file, readFileSync(join(root, file), "utf8"));
  if (parsed.escalation === null) {
    return parsed.violations.map((violation) => `${id}: ${escalation}: ${violation}`);
  }
  const problems: string[] = [];
  if (!parsed.escalation.testIds.includes(ESCALATION_TEST_ID)) {
    problems.push(`${id}: ${escalation} test_ids do not include ${ESCALATION_TEST_ID}`);
  }
  if (!parsed.escalation.proposed.includes("deferred:") && !/workaround/i.test(parsed.escalation.proposed)) {
    problems.push(`${id}: ${escalation} proposed names neither a deferred: item nor a workaround`);
  }
  const decision = `${DECISIONS_DIR}/${escalation}.md`;
  if (!existsSync(join(root, decision))) {
    problems.push(`${id}: ${escalation} has no decision (${decision} does not exist)`);
  } else if (decisionStatus(escalation, readFileSync(join(root, file), "utf8"), readFileSync(join(root, decision), "utf8")) === "open") {
    problems.push(`${id}: ${escalation} has no decision (${decision} does not decide it)`);
  }
  return problems;
}

/** The root's `.bun-version` pin, or null when the file is missing. */
function bunPin(root: string): string | null {
  const path = join(root, BUN_VERSION_FILE);
  return existsSync(path) ? readFileSync(path, "utf8").trim() : null;
}

/** `running Bun <v>, .bun-version <pin>` when the Bun running the probes (default `Bun.version`) is not the pinned one, else null. */
export function runningBunViolation(root: string, running: string = Bun.version): string | null {
  const pin = bunPin(root);
  return running === pin ? null : `running Bun ${running}, ${BUN_VERSION_FILE} ${pin ?? "(missing)"}`;
}

/** Compares live results with the root's record, Escalations and REPORT.md. Runs no probe and writes nothing. `runningBun` (default `Bun.version`) is the Bun that produced `live`. */
export function checkProbes(root: string, live: ReadonlyMap<string, LiveResult>, options: { requireBackends: boolean; runningBun?: string }, registry: readonly Probe[] = PROBES): CheckReport {
  const violations: string[] = [];
  const running = runningBunViolation(root, options.runningBun);
  if (running !== null) {
    violations.push(running);
  }
  const report: CheckReport = { violations, supported: 0, unsupported: 0, notRun: 0, total: registry.length };
  for (const result of live.values()) {
    if (result.status === "supported") {
      report.supported++;
    } else if (result.status === "unsupported") {
      report.unsupported++;
    } else {
      report.notRun++;
    }
  }
  let record: ProbeRecord;
  try {
    record = readRecord(root);
  } catch (error) {
    violations.push(error instanceof Error ? error.message : String(error));
    return report;
  }

  const bunVersion = bunPin(root);
  if (record.bun !== bunVersion) {
    violations.push(`${RESULTS_FILE}: bun ${record.bun} differs from ${BUN_VERSION_FILE} ${bunVersion ?? "(missing)"}`);
  }

  const registered = new Set(registry.map((probe) => probe.id));
  for (const id of Object.keys(record.probes).sort(compare)) {
    if (!registered.has(id)) {
      violations.push(`${id}: recorded but not in the registry`);
    }
  }
  for (const probe of registry) {
    const result: LiveResult = live.get(probe.id) ?? { status: "not-run", evidence: "no live result", workaround: null };
    const entry = record.probes[probe.id];
    if (result.status === "not-run" && options.requireBackends) {
      violations.push(`${probe.id}: not run (${result.evidence})`);
    }
    if (entry === undefined) {
      violations.push(`${probe.id}: missing from the record (live ${result.status}: ${result.evidence})`);
      continue;
    }
    if (result.status !== "not-run" && result.status !== entry.status) {
      violations.push(`${probe.id}: live ${result.status}, recorded ${entry.status}: ${result.evidence}`);
    }
    if (probe.workaround !== null && result.status === "unsupported" && result.workaround !== true) {
      violations.push(`${probe.id}: unsupported and its workaround (${probe.workaround}) does not hold: ${result.evidence}`);
    }
    if (entry.status === "unsupported") {
      violations.push(...escalationProblems(root, probe.id, entry.escalation));
    } else if (entry.escalation !== null) {
      violations.push(`${probe.id}: supported but names Escalation ${entry.escalation}`);
    }
  }

  const reportPath = join(root, REPORT_FILE);
  const expected = renderReport(registry, record).split("\n");
  const actual = existsSync(reportPath) ? readFileSync(reportPath, "utf8").split("\n") : [];
  for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
    if (expected[i] !== actual[i]) {
      violations.push(`${REPORT_FILE}: drift at line ${i + 1}; run bun run probes:generate`);
      break;
    }
  }
  return report;
}

/** The record `record` writes: each live result, keeping a still-unsupported probe's Escalation. Throws when a probe is not-run. */
export function recordFrom(live: ReadonlyMap<string, LiveResult>, previous: ProbeRecord | null, bun: string): ProbeRecord {
  const notRun = [...live].filter(([, result]) => result.status === "not-run").map(([id, result]) => `${id} (${result.evidence})`);
  if (notRun.length > 0) {
    throw new Error(`refusing to record: not run: ${notRun.join(", ")}`);
  }
  const probes: Record<string, RecordEntry> = {};
  for (const [id, result] of live) {
    const status = result.status as "supported" | "unsupported";
    probes[id] = { status, escalation: status === "unsupported" ? (previous?.probes[id]?.escalation ?? null) : null };
  }
  return { bun, probes };
}

// ---------------------------------------------------------------------------
// The CLI

const USAGE = "Usage: bun conformance/probes/probes.ts run [--json] | check [--require-backends] | record | generate [--root <dir>]";
type Command = "run" | "check" | "record" | "generate";

function parseArgs(argv: readonly string[]): { command: Command; root: string; json: boolean; requireBackends: boolean } {
  const command = argv[0];
  if (command !== "run" && command !== "check" && command !== "record" && command !== "generate") {
    throw new UsageError(command === undefined ? "Missing subcommand: run, check, record or generate" : `Unknown subcommand: ${command}`);
  }
  let root = TOOL_ROOT;
  let json = false;
  let requireBackends = false;
  const rest = argv.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === "--json" && command === "run") {
      json = true;
    } else if (arg === "--require-backends" && command === "check") {
      requireBackends = true;
    } else if (arg === "--root") {
      const value = rest[++i];
      if (value === undefined || value === "" || value.startsWith("--")) {
        throw new UsageError(`${arg} needs a value`);
      }
      root = resolve(value);
    } else {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
  }
  return { command, root, json, requireBackends };
}

/** One `<id>: <status>: <evidence>` line per live result. */
function liveLines(live: ReadonlyMap<string, LiveResult>): string {
  return [...live].map(([id, result]) => `${id}: ${result.status}: ${result.evidence}\n`).join("");
}

export async function main(argv: readonly string[]): Promise<number> {
  const subcommand = argv[0] ?? "check";
  try {
    const { command, root, json, requireBackends } = parseArgs(argv);
    if (command === "generate") {
      const record = readRecord(root);
      const path = join(root, REPORT_FILE);
      const text = renderReport(PROBES, record);
      const changed = !existsSync(path) || readFileSync(path, "utf8") !== text;
      if (changed) {
        writeFileSync(path, text);
      }
      process.stdout.write(`${REPORT_FILE}: ${changed ? "regenerated" : "up to date"} (${PROBES.length} probes).\n`);
      return 0;
    }
    const live = await runProbes(process.env);
    if (command === "run") {
      if (json) {
        process.stdout.write(`${JSON.stringify(Object.fromEntries(live), null, 2)}\n`);
      } else {
        process.stdout.write(liveLines(live));
      }
      const running = runningBunViolation(root);
      if (running !== null) {
        process.stderr.write(`${running}\n`);
        return 1;
      }
      return 0;
    }
    if (command === "record") {
      const running = runningBunViolation(root);
      if (running !== null) {
        throw new Error(`refusing to record: ${running}`);
      }
      const path = join(root, RESULTS_FILE);
      const previous = existsSync(path) ? readRecord(root) : null;
      const bun = readFileSync(join(root, BUN_VERSION_FILE), "utf8").trim();
      writeFileSync(path, serializeRecord(recordFrom(live, previous, bun)));
      process.stdout.write(`${RESULTS_FILE}: recorded ${live.size} probes on Bun ${bun}; run bun run probes:generate.\n`);
      return 0;
    }
    const report = checkProbes(root, live, { requireBackends });
    if (report.violations.length > 0) {
      process.stderr.write(report.violations.map((violation) => `${violation}\n`).join(""));
      return 1;
    }
    process.stdout.write(liveLines(live));
    process.stdout.write(`PROBES OK: ${report.supported} supported, ${report.unsupported} unsupported, ${report.notRun} not run (of ${report.total}).\n`);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`PROBES ${subcommand} failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
