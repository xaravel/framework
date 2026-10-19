// The conformance harness runner (Stories 5.3, 5.4 and 5.5; FR-3, FR-9,
// FR-113, AD-15, AD-17).
//
//   bun --no-env-file conformance/harness/harness.ts [--root <dir>] [--fast]
//       [--seed <s>] [--component <c>]… [--id <glob>]… [--story <story-id>]
//       (`bun run harness`) runs the Ported Tests once per Variant and
//       compares the results with the Expectations File
//
// Selection (Story 5.4, ./select.ts). With no filter and no `--fast`, every
// Expectations line is checked. Otherwise the universe is the Expectations
// Test IDs, each in the Component that is the first path segment of its shard:
//   --component <c>  IDs of Component `c`;
//   --id <glob>      IDs the glob matches whole (`*` any run, `?` one
//                    character, the rest literal);
//   --story <s>      the `test_ids` of `stories/<s>.md` (`parseManifest`); a
//                    missing or invalid manifest, or one with no `test_ids`,
//                    fails a precondition; a value not of the form
//                    `<epic>.<story>` is a usage error. The listed IDs with no
//                    Expectations line go to stderr as one diagnostic with
//                    their count and at most the first 10.
// A repeated filter takes the union of its values; different filters
// intersect. An empty selection fails a precondition:
//   no Test ID matches <the filters>
// `--fast` (implied by `--seed <s>`; without one the seed is 8 random hex
// characters) samples the first min(100, n) selected IDs ranked by the hex
// SHA-256 of `<seed>\n<id>` (ties by `compareUnits`), prints first
//   FAST seed=<s> sample=<k>/<n>
// and appends ` mode=fast seed=<s>` to the SUMMARY line. `isFullRun(summary)`
// is false for such a line: a fast run never satisfies the Story done check
// (Story 5.9). Filters alone don't make a run a sample.
//
// On a selection, only the Variants with selected lines are listed and probed,
// each checks only its selected lines, and each run gets only the Ported Test
// files under `packages/<c>/tests/ported/` of its selected Components, plus
// `-t ^(?:<escaped ids>)$` unless every Expectations line of those Components
// on that Variant is selected or the pattern exceeds 65,536 characters. A run
// given `-t` that exits non-zero with `matched 0 tests` on stderr is empty:
// every selected line is `missing` (bun 1.4.3 may still write a junit file of
// skipped testcases then). The UNKNOWN check still uses the full Expectations.
//
// Preconditions, checked before anything runs (each failure exits 1):
//   - `<root>/bunfig.toml` exists, and no other `bunfig.toml` exists under the
//     root (the scan skips `node_modules`, `.git`, `.cache` and
//     `conformance/upstream`); the message names each one (AD-15);
//   - the root is the top level of a git worktree, whose key is derived from
//     its path and creation id, and `.cache/harness.lock` is free, or stale
//     and taken over (./isolation.ts; AD-17). The lock is taken right after
//     the bunfig checks and released when the harness ends; the CLI also
//     stops its Redis and releases the lock on SIGINT (exit 130) or SIGTERM
//     (exit 143);
//   - `conformance/variants`, the Expectations shards and the Inventory read
//     cleanly (`readVariants`, `readExpectations`, `readWorkingInventory`),
//     and every line's Variant is in the vocabulary.
//
// The Variants run are those that appear in the Expectations lines, in
// `conformance/variants` order. Each backend is prepared once, the first time
// a Variant needs it (./isolation.ts): `sqlite` gets a fresh `.cache/sqlite/`
// (only created on a fast run); `pgsql` is probed, then the worktree's
// `xaravel_test_<key>[_<name>]` databases are dropped and `xaravel_test_<key>`
// created (on a fast run only created when missing; a failure is NOT-RUN with
// `Postgres database reset failed: <message>`); `redis` is, with `CI=true`,
// probed at `REDIS_HOST`/`REDIS_PORT`, and locally a `redis-server` the
// harness starts on `.cache/redis.sock` and stops when it ends; any other
// backend is probed (./backends.ts). Each Variant whose backend is reachable
// gets one
//
//   <bun> --no-env-file test --preload <this directory>/preload.ts \
//     --reporter=junit --reporter-outfile=<tmp> <every packages/*/tests/ported/**/*.test.ts>
//
// with cwd the root (so the root `bunfig.toml` applies) and the parent's env
// plus `XARAVEL_VARIANT=<variant>`, `XARAVEL_HARNESS_OUT=<tmp jsonl>`, to
// which the preload appends the reports and late assertions, and
// `XARAVEL_API_SURFACE=<root>/conformance/api-surface`, which the preload's
// API signature lookup reads (ESC-4.8-1 item 1), and the isolation env
// `XARAVEL_WORKTREE_KEY`, `XARAVEL_CACHE_DIR`, `XARAVEL_SQLITE_DIR`,
// `XARAVEL_PG_DATABASE` and, on a Variant whose Redis the harness started,
// `XARAVEL_REDIS_SOCKET`. With no Ported Test file nothing is spawned and
// every result is `missing`. A run that leaves no junit file fails the harness
// (exit 1), quoting its stderr. Temp files live in the OS temp directory; the
// harness writes under the root only in `.cache/`, and outside it only the
// worktree's creation id file in its git dir.
//
// A Variant whose backend is unreachable is not spawned and prints
//   NOT-RUN [<variant>] <n> line(s): <why>
// which is not a difference, except that with `CI=true` an unreachable alpha
// Variant (`ALPHA_VARIANTS`) counts as one difference (FR-9) and its line
// ends `; CI runs every alpha variant (FR-9)`.
//
// Report lines go to stdout: the NOT-RUN lines, then, per run Variant in
// order, its ERROR line (below) and one line per differing Test ID × Variant
// (./compare.ts), sorted by id (`compareUnits`), then
//   SUMMARY variants=<v> run=<r> not-run=<nr> checked=<c> differ=<d>
// where `checked` counts the Expectations lines on run Variants. Diagnostics go
// to stderr, among them one `harness: <id> [<variant>]: <type>: <first message
// line>` per FAIL with a junit failure and one `harness: <id> [<variant>]:
// below the floor: <kind> <n><<u> …` per FLOOR.
//
// A run whose `bun test` exits non-zero although no junit testcase failed (a
// Ported Test file that throws on import, an unhandled error between tests)
// prints
//   ERROR [<variant>] bun test exited <n> with no failing testcase
// before that Variant's difference lines; it counts as one difference, and the
// tail of the run's stderr goes to the diagnostics. The child env drops
// `BUN_OPTIONS` and `NODE_OPTIONS`, which could add a preload or flags.
//
// Assertion-floor waiver (ESC-5.3-2): a below-floor pass is waived when the
// line's `adapted` is `DIV-<n>.<clause>`, `decisions/DIV-<n>.md` exists, and its
// YAML frontmatter `fewer_assertions` list contains `<clause>`.
//
// Exit codes: 0 when no line differs, 1 on a difference or a failed
// precondition, 2 on a usage error.
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { UsageError, readVariants } from "../../tools/expectations/expectations";
import { ALPHA_VARIANTS, compareUnits } from "../../tools/inventory/inventory";
import { parseManifest } from "../../tools/ownership/ownership";
import { readExpectations, readWorkingInventory } from "../../tools/pin-bump/pin-bump";
import { backendFor, probe, type ProbeResult } from "./backends";
import { compare, type Difference, type HarnessLine, type HarnessReport, type Result, type VariantRun } from "./compare";
import { parseJunit } from "./junit";
import { IsolationError, acquireLock, creationId, isolationEnv, postgresAdmin, preparePostgres, prepareSqlite, startRedis, worktreeKey, worktreeOf, type Lock, type PgAdmin, type RedisServer } from "./isolation";
import { FAST_SAMPLE, SEED, namePattern, sampleIds, selectIds } from "./select";

/** The preload every run gets: this directory's, whatever the root. */
export const PRELOAD = join(import.meta.dir, "preload.ts");
export const PORTED_GLOB = "packages/*/tests/ported/**/*.test.ts";
const SKIPPED_DIRS: ReadonlySet<string> = new Set(["node_modules", ".git", ".cache"]);
const SKIPPED_PATHS: ReadonlySet<string> = new Set(["conformance/upstream"]);
/** The longest `-t` pattern passed; past it the run gets every test of its files. */
export const MAX_PATTERN = 65_536;
const STORY_ID = /^[1-9]\d*\.[1-9]\d*$/;

type Env = Readonly<Record<string, string | undefined>>;

export interface HarnessOptions {
  /** The environment the probes read and the runs inherit; default `process.env`. */
  readonly env?: Env;
  /** Extra `bun test` arguments, before the files (internal: tests use `--concurrent`). */
  readonly bunArgs?: readonly string[];
  /** Sample the selection (`--fast`). */
  readonly fast?: boolean;
  /** The sample's seed (`--seed`, implies `fast`); default 8 random hex characters. */
  readonly seed?: string | null;
  /** `--component` values. */
  readonly components?: readonly string[];
  /** `--id` globs. */
  readonly ids?: readonly string[];
  /** `--story` Story ID. */
  readonly story?: string | null;
  /** The Postgres admin factory (internal: tests pass an in-memory admin); default `postgresAdmin`. */
  readonly postgres?: (env: Env) => PgAdmin;
  /** Receives, while the run lasts, the cleanup that stops its Redis and releases its lock, then null (internal: the CLI's signal handlers). */
  readonly onCleanup?: (cleanup: (() => Promise<void>) | null) => void;
}

/** The worktree the harness ran in and its key (Story 5.5). */
export interface HarnessWorktree {
  readonly path: string;
  readonly key: string;
}

/** A fast run's sample: its seed, its size and the selection it was drawn from. */
export interface HarnessSample {
  readonly seed: string;
  readonly size: number;
  readonly of: number;
}

export interface HarnessResult {
  readonly code: 0 | 1;
  /** Report lines (stdout). */
  readonly out: string[];
  /** Diagnostics (stderr). */
  readonly err: string[];
  readonly results: Result[];
  /**
   * Every difference the run counted, with its kind (Story 5.6): the compared
   * pairs, plus each `ERROR` line and each CI `NOT-RUN` of an alpha Variant as
   * an `unexpected-failure` with id `-` and that line as its text.
   */
  readonly differences: Difference[];
  /** The sample in fast mode, null otherwise. */
  readonly sample: HarnessSample | null;
  /** The worktree and its key once known, null before that. */
  readonly worktree: HarnessWorktree | null;
}

/** Whether `summaryLine` is the SUMMARY line of a full (not fast) run; Story 5.9's done check must use it. */
export function isFullRun(summaryLine: string): boolean {
  return summaryLine.startsWith("SUMMARY ") && !summaryLine.includes(" mode=fast");
}

class PreconditionError extends Error {}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every `bunfig.toml` under `root` other than the root's own, repo-relative and sorted. */
export function strayBunfigs(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const rel = relative(root, path).split("\\").join("/");
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name) && !SKIPPED_PATHS.has(rel)) {
          walk(path);
        }
      } else if (entry.name === "bunfig.toml" && dir !== root) {
        found.push(rel);
      }
    }
  };
  walk(root);
  return found.sort(compareUnits);
}

/** The repo-relative Ported Test files under `root`, sorted. */
export function portedTestFiles(root: string): string[] {
  const files = [...new Bun.Glob(PORTED_GLOB).scanSync({ cwd: root, onlyFiles: true, followSymlinks: false })];
  return files.map((file) => file.split("\\").join("/")).sort(compareUnits);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** The YAML frontmatter mapping of `text`, or null. */
function frontmatterOf(text: string): Record<string, unknown> | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "---") {
    return null;
  }
  const end = lines.indexOf("---", 1);
  if (end === -1) {
    return null;
  }
  try {
    const data: unknown = Bun.YAML.parse(lines.slice(1, end).join("\n"));
    return isRecord(data) ? data : null;
  } catch {
    return null;
  }
}

/** The floor waiver (ESC-5.3-2): whether `adapted` names a DIV clause listed in that record's `fewer_assertions`. */
export function waiverFor(root: string): (line: HarnessLine) => boolean {
  const clauses = new Map<string, Set<string> | null>();
  return (line: HarnessLine): boolean => {
    const match = line.adapted === null ? null : /^DIV-([1-9][0-9]*)\.([^\s.][^\s]*)$/.exec(line.adapted);
    if (match === null) {
      return false;
    }
    const n = match[1]!;
    if (!clauses.has(n)) {
      const path = join(root, "decisions", `DIV-${n}.md`);
      const fields = existsSync(path) ? frontmatterOf(readFileSync(path, "utf8")) : null;
      const list = fields?.["fewer_assertions"];
      clauses.set(n, Array.isArray(list) ? new Set(list.filter((item) => typeof item === "string" || typeof item === "number").map(String)) : null);
    }
    return clauses.get(n)?.has(match[2]!) ?? false;
  };
}

/** Reads the preload's JSONL output into the run's reports and late ids. */
function readHarnessOut(path: string): { reports: Map<string, HarnessReport>; late: Set<string>; duplicates: Set<string> } {
  const reports = new Map<string, HarnessReport>();
  const late = new Set<string>();
  const duplicates = new Set<string>();
  if (!existsSync(path)) {
    return { reports, late, duplicates };
  }
  for (const text of readFileSync(path, "utf8").split("\n")) {
    if (text === "") {
      continue;
    }
    let record: unknown;
    try {
      record = JSON.parse(text);
    } catch (error) {
      throw new PreconditionError(`the harness output has a malformed line: ${message(error)}`);
    }
    if (!isRecord(record)) {
      continue;
    }
    const report = record["report"];
    if (isRecord(report) && report["type"] === "ported" && typeof report["id"] === "string" && isRecord(report["assertions"])) {
      if (reports.has(report["id"])) {
        duplicates.add(report["id"]);
      }
      reports.set(report["id"], report as unknown as HarnessReport);
    }
    const lateRecord = record["late"];
    if (isRecord(lateRecord) && typeof lateRecord["id"] === "string") {
      late.add(lateRecord["id"]);
    }
  }
  return { reports, late, duplicates };
}

/** The last `n` non-empty lines of `text`. */
function tail(text: string, n: number): string[] {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line !== "")
    .slice(-n);
}

/** Spawns one `bun test` run for `variant`; `error` is the ERROR line when bun exited non-zero with no failing testcase. */
async function runVariant(root: string, variant: string, files: readonly string[], pattern: string | null, env: Env, isolated: Readonly<Record<string, string>>, bunArgs: readonly string[], err: string[]): Promise<VariantRun & { error: string | null }> {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-harness-"));
  try {
    const junitPath = join(dir, "junit.xml");
    const outPath = join(dir, "harness.jsonl");
    const childEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) {
        childEnv[key] = value;
      }
    }
    // Neither may add a preload or flags around the root bunfig.toml.
    delete childEnv["BUN_OPTIONS"];
    delete childEnv["NODE_OPTIONS"];
    // Only a Redis the harness started may be named; never an inherited one.
    delete childEnv["XARAVEL_REDIS_SOCKET"];
    Object.assign(childEnv, isolated);
    childEnv["XARAVEL_VARIANT"] = variant;
    childEnv["XARAVEL_HARNESS_OUT"] = outPath;
    childEnv["XARAVEL_API_SURFACE"] = join(root, "conformance", "api-surface");
    const args = [
      process.execPath,
      "--no-env-file",
      "test",
      "--preload",
      PRELOAD,
      "--reporter=junit",
      `--reporter-outfile=${junitPath}`,
      ...bunArgs,
      ...(pattern === null ? [] : ["-t", pattern]),
      ...files.map((file) => join(root, file)),
    ];
    const child = Bun.spawn(args, { cwd: root, env: childEnv, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const [, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    if (pattern !== null && exitCode !== 0 && stderr.includes("matched 0 tests")) {
      err.push(`harness: [${variant}] bun test matched none of the selected tests over ${files.length} file(s)`);
      return emptyRun();
    }
    if (!existsSync(junitPath)) {
      throw new PreconditionError(`[${variant}] bun test wrote no junit report (exit ${String(exitCode)}): ${stderr.trim()}`);
    }
    err.push(`harness: [${variant}] bun test exited ${String(exitCode)} over ${files.length} file(s)`);
    const junit = parseJunit(readFileSync(junitPath, "utf8"));
    let error: string | null = null;
    if (exitCode !== 0 && ![...junit.values()].some((testcase) => testcase.outcome === "failed")) {
      error = `ERROR [${variant}] bun test exited ${String(exitCode)} with no failing testcase`;
      err.push(...tail(stderr, 20).map((line) => `harness: [${variant}] ${line}`));
    }
    return { junit, ...readHarnessOut(outPath), error };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function emptyRun(): VariantRun & { error: string | null } {
  return { junit: new Map(), reports: new Map(), late: new Set<string>(), duplicates: new Set<string>(), error: null };
}

/** The filters as given on the command line, for the empty-selection message. */
function describeFilters(options: HarnessOptions): string {
  const parts = [...(options.components ?? []).map((c) => `--component ${c}`), ...(options.ids ?? []).map((g) => `--id ${g}`)];
  if (options.story !== undefined && options.story !== null) {
    parts.push(`--story ${options.story}`);
  }
  return parts.length === 0 ? "the Expectations File" : parts.join(" ");
}

/** The `test_ids` of `stories/<story>.md`; diagnoses those with no Expectations line. */
function storyIds(root: string, story: string, universe: ReadonlyMap<string, string>, err: string[]): string[] {
  const file = `stories/${story}.md`;
  const path = join(root, file);
  if (!STORY_ID.test(story) || !existsSync(path)) {
    throw new PreconditionError(`--story ${story}: ${file} does not exist`);
  }
  const parsed = parseManifest(file, readFileSync(path, "utf8"));
  if (parsed.manifest === null) {
    throw new PreconditionError(parsed.violations.join("; "));
  }
  if (parsed.manifest.testIds.length === 0) {
    throw new PreconditionError(`${file} lists no test_ids`);
  }
  const unknown = parsed.manifest.testIds.filter((id) => !universe.has(id));
  if (unknown.length > 0) {
    const shown = unknown.slice(0, 10).join(", ");
    err.push(`harness: ${file} lists ${unknown.length} Test ID(s) with no Expectations line: ${shown}${unknown.length > 10 ? ", …" : ""}`);
  }
  return parsed.manifest.testIds;
}

/** Runs the harness over `root` (see the header). */
export async function runHarness(rootArg: string, options: HarnessOptions = {}): Promise<HarnessResult> {
  const root = resolve(rootArg);
  const env = options.env ?? process.env;
  const out: string[] = [];
  const err: string[] = [];
  const results: Result[] = [];
  /** Every counted difference, in report order (`HarnessResult.differences`). */
  const counted: Difference[] = [];
  let sample: HarnessSample | null = null;
  let worktree: HarnessWorktree | null = null;
  let lock: Lock | null = null;
  /** The Redis server this run started, stopped in `finally`. */
  const services: { redis: RedisServer | null } = { redis: null };
  /** Stops the Redis this run started and releases its lock; safe to call twice. */
  const cleanup = async (): Promise<void> => {
    const server = services.redis;
    services.redis = null;
    try {
      if (server !== null) {
        await server.stop();
      }
    } finally {
      lock?.release();
      lock = null;
    }
  };
  options.onCleanup?.(cleanup);
  try {
    const seedOption = options.seed ?? null;
    if (seedOption !== null && !SEED.test(seedOption)) {
      throw new PreconditionError(`the seed ${JSON.stringify(seedOption)} does not match ${String(SEED)}`);
    }
    if (!existsSync(join(root, "bunfig.toml"))) {
      throw new PreconditionError("the root bunfig.toml does not exist (AD-15)");
    }
    const stray = strayBunfigs(root);
    if (stray.length > 0) {
      throw new PreconditionError(`package-level bunfig.toml found; only the root bunfig.toml may exist (AD-15): ${stray.join(", ")}`);
    }
    const tree = worktreeOf(root, env);
    const key = worktreeKey(tree.path, creationId(tree.gitDir));
    worktree = { path: tree.path, key };
    lock = acquireLock(root, process.argv.join(" "));
    const isolated = isolationEnv(root, key);
    const vocabulary = readVariants(root);
    if (vocabulary.violations.length > 0) {
      throw new PreconditionError(vocabulary.violations.join("; "));
    }
    let shards;
    let inventoryEntries;
    try {
      shards = readExpectations(root);
      inventoryEntries = readWorkingInventory(root);
    } catch (error) {
      throw new PreconditionError(message(error));
    }
    const inventory = new Map(inventoryEntries.map((entry) => [entry.id, entry.assertions] as const));
    const byVariant = new Map<string, HarnessLine[]>();
    const knownIds = new Set<string>();
    /** Each Test ID's Component: the first path segment of its shard under conformance/expectations/. */
    const universe = new Map<string, string>();
    const vocabularySet = new Set(vocabulary.variants);
    for (const shard of shards) {
      const component = shard.path.split("/")[2] ?? "";
      shard.lines.forEach((raw, index) => {
        const variant = raw["variant"];
        const status = raw["status"];
        if (typeof variant !== "string" || !vocabularySet.has(variant)) {
          throw new PreconditionError(`${shard.path}:${index + 1}: Variant ${JSON.stringify(variant)} is not in conformance/variants`);
        }
        const line: HarnessLine = { id: raw["id"] as string, variant, status: typeof status === "string" ? status : String(status), reason: stringOrNull(raw["reason"]), adapted: stringOrNull(raw["adapted"]) };
        knownIds.add(line.id);
        if (!universe.has(line.id)) {
          universe.set(line.id, component);
        }
        const list = byVariant.get(variant) ?? [];
        list.push(line);
        byVariant.set(variant, list);
      });
    }
    const components = options.components ?? [];
    const globs = options.ids ?? [];
    const story = options.story ?? null;
    const fast = options.fast === true || seedOption !== null;
    let selected: Set<string> | null = null;
    if (fast || components.length > 0 || globs.length > 0 || story !== null) {
      const chosen = selectIds(universe, { components, ids: globs, story: story === null ? null : storyIds(root, story, universe, err) });
      if (chosen.length === 0) {
        throw new PreconditionError(`no Test ID matches ${describeFilters(options)}`);
      }
      if (fast) {
        const seed = seedOption ?? randomBytes(4).toString("hex");
        const picked = sampleIds(chosen, seed, FAST_SAMPLE);
        sample = { seed, size: picked.length, of: chosen.length };
        out.push(`FAST seed=${seed} sample=${picked.length}/${chosen.length}`);
        selected = new Set(picked);
      } else {
        selected = new Set(chosen);
      }
    }
    const linesOf = (variant: string): HarnessLine[] => {
      const all = byVariant.get(variant) ?? [];
      return selected === null ? all : all.filter((line) => selected.has(line.id));
    };
    const variants = vocabulary.variants.filter((variant) => linesOf(variant).length > 0);
    const allFiles = portedTestFiles(root);
    const ci = env["CI"] === "true";
    const waived = waiverFor(root);
    const differences: Difference[] = [];
    const errors: string[] = [];
    const reportLines: string[] = [];
    let run = 0;
    let notRun = 0;
    let checked = 0;
    let ciDifferences = 0;
    // Backend preparation: once per backend, the first time a run Variant needs it.
    const prepared = new Map<string, Promise<ProbeResult>>();
    const prepare = async (backend: string): Promise<ProbeResult> => {
      if (backend === "sqlite") {
        prepareSqlite(root, fast);
        return { reachable: true };
      }
      if (backend === "pgsql") {
        return preparePostgres(env, key, fast, options.postgres ?? postgresAdmin);
      }
      if (backend === "redis") {
        const started = await startRedis(root, env);
        if (!started.reachable) {
          return started;
        }
        services.redis = started.server;
        return { reachable: true };
      }
      return probe(backend, env);
    };
    for (const variant of variants) {
      const lines = linesOf(variant);
      const backend = backendFor(variant);
      const pending = prepared.get(backend) ?? prepare(backend);
      prepared.set(backend, pending);
      const status = await pending;
      if (!status.reachable) {
        notRun++;
        const counts = ci && ALPHA_VARIANTS.includes(variant);
        if (counts) {
          ciDifferences++;
        }
        const notRunLine = `NOT-RUN [${variant}] ${lines.length} line(s): ${status.why}${counts ? "; CI runs every alpha variant (FR-9)" : ""}`;
        out.push(notRunLine);
        if (counts) {
          counted.push({ id: "-", variant, kind: "unexpected-failure", text: notRunLine, detail: null });
        }
        continue;
      }
      run++;
      checked += lines.length;
      let files = allFiles;
      let pattern: string | null = null;
      if (selected !== null) {
        const selectedComponents = new Set(lines.map((line) => universe.get(line.id) ?? ""));
        files = allFiles.filter((file) => selectedComponents.has(file.split("/")[1] ?? ""));
        const ofComponents = byVariant.get(variant)!.filter((line) => selectedComponents.has(universe.get(line.id) ?? "")).length;
        const candidate = namePattern(lines.map((line) => line.id));
        if (ofComponents !== lines.length && candidate.length <= MAX_PATTERN) {
          pattern = candidate;
        }
      }
      const variantRun = files.length === 0 ? emptyRun() : await runVariant(root, variant, files, pattern, env, backend === "redis" && services.redis !== null ? { ...isolated, XARAVEL_REDIS_SOCKET: services.redis.socket } : isolated, options.bunArgs ?? [], err);
      const compared = compare({ variant, lines, knownIds, run: variantRun, inventory, waived });
      results.push(...compared.results);
      if (variantRun.error !== null) {
        errors.push(variantRun.error);
        reportLines.push(variantRun.error);
        counted.push({ id: "-", variant, kind: "unexpected-failure", text: variantRun.error, detail: null });
      }
      const sorted = compared.differences.sort((a, b) => compareUnits(a.id, b.id));
      differences.push(...sorted);
      counted.push(...sorted);
      reportLines.push(...sorted.map((difference) => difference.text));
    }
    // One diagnostic line per difference with a reason (see the header).
    for (const difference of differences) {
      if (difference.detail !== null) {
        err.push(`harness: ${difference.id} [${difference.variant}]: ${difference.detail}`);
      }
    }
    out.push(...reportLines);
    const differ = differences.length + errors.length + ciDifferences;
    const mode = sample === null ? "" : ` mode=fast seed=${sample.seed}`;
    out.push(`SUMMARY variants=${variants.length} run=${run} not-run=${notRun} checked=${checked} differ=${differ}${mode}`);
    return { code: differ === 0 ? 0 : 1, out, err, results, differences: counted, sample, worktree };
  } catch (error) {
    if (error instanceof PreconditionError || error instanceof IsolationError) {
      err.push(`harness: ${error.message}`);
      return { code: 1, out, err, results, differences: counted, sample, worktree };
    }
    err.push(`harness failed: ${message(error)}`);
    return { code: 1, out, err, results, differences: counted, sample, worktree };
  } finally {
    try {
      await cleanup();
    } finally {
      options.onCleanup?.(null);
    }
  }
}

const USAGE = "Usage: bun --no-env-file conformance/harness/harness.ts [--root <dir>] [--fast] [--seed <s>] [--component <c>]... [--id <glob>]... [--story <story-id>]";

/** The CLI's root and options; throws `UsageError` (exit 2). */
export function parseArgs(argv: readonly string[]): { root: string; options: HarnessOptions } {
  let root = resolve(import.meta.dir, "..", "..");
  let fast = false;
  let seed: string | null = null;
  let story: string | null = null;
  const components: string[] = [];
  const ids: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--fast") {
      fast = true;
      continue;
    }
    if (!["--root", "--seed", "--component", "--id", "--story"].includes(arg)) {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    const value = argv[++i];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    if (arg === "--root") {
      root = resolve(value);
    } else if (arg === "--seed") {
      if (seed !== null) {
        throw new UsageError("--seed may be given once");
      }
      if (!SEED.test(value)) {
        throw new UsageError(`--seed must match ${String(SEED)}, got ${JSON.stringify(value)}`);
      }
      seed = value;
    } else if (arg === "--story") {
      if (story !== null) {
        throw new UsageError("--story may be given once");
      }
      if (!STORY_ID.test(value)) {
        throw new UsageError(`--story must be a Story ID of the form <epic>.<story>, got ${JSON.stringify(value)}`);
      }
      story = value;
    } else if (arg === "--component") {
      components.push(value);
    } else {
      ids.push(value);
    }
  }
  return { root, options: { fast: fast || seed !== null, seed, components, ids, story } };
}

export async function main(argv: readonly string[]): Promise<number> {
  let root: string;
  let options: HarnessOptions;
  try {
    ({ root, options } = parseArgs(argv));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    throw error;
  }
  // Ctrl-C or SIGTERM: stop the Redis the run started and release the lock, then exit 130 or 143.
  let cleanup: (() => Promise<void>) | null = null;
  const handler = (code: number) => (): void => {
    const pending = cleanup;
    void (async (): Promise<void> => {
      try {
        await pending?.();
      } finally {
        process.exit(code);
      }
    })();
  };
  const onInt = handler(130);
  const onTerm = handler(143);
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  let result: HarnessResult;
  try {
    result = await runHarness(root, {
      ...options,
      onCleanup: (next) => {
        cleanup = next;
      },
    });
  } finally {
    process.off("SIGINT", onInt);
    process.off("SIGTERM", onTerm);
  }
  if (result.err.length > 0) {
    process.stderr.write(result.err.map((line) => `${line}\n`).join(""));
  }
  process.stdout.write(result.out.map((line) => `${line}\n`).join(""));
  return result.code;
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
