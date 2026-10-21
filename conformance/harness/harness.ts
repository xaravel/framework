// The conformance harness runner (Stories 5.3, 5.4, 5.5 and 5.9; FR-3, FR-9,
// FR-113, FR-115, AD-15, AD-17).
//
//   bun --no-env-file conformance/harness/harness.ts [--root <dir>] [--fast]
//       [--seed <s>] [--component <c>]… [--id <glob>]… [--story <story-id>]
//       (`bun run harness`) runs the Ported Tests once per Variant and
//       compares the results with the Expectations File; a full run (no
//       filter, no `--fast`) then also runs the Xaravel Tests (below)
//   bun --no-env-file conformance/harness/harness.ts [--root <dir>] --xaravel
//       [--id <glob>]…
//       runs only the Xaravel Tests; `--id` globs then select XT ids, and
//       `--component`, `--story`, `--fast` and `--seed` are usage errors
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
// each checks only its selected lines, and each run gets only those of its
// Ported Test files (below) under `packages/<c>/tests/ported/` of its selected
// Components, plus `-t ^(?:<escaped ids>)$` unless every Expectations line of
// those Components on that Variant is selected or the pattern exceeds 65,536
// characters. A run
// given `-t` that exits non-zero with `matched 0 tests` on stderr is empty:
// every selected line is `missing` (bun 1.4.3 may still write a junit file of
// skipped testcases then). The UNKNOWN check still uses every Expectations
// line of the Variant, selected or not.
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
// `conformance/variants` order. The `sqlite` backend is prepared before every
// Variant run whose backend it is (`sqlite`, `queue-database@sqlite`), so each
// starts from a fresh `.cache/sqlite/` (only created on a fast run, never
// removed; ESC-5.3-4). Every other backend is prepared once, the first time a
// Variant needs it (./isolation.ts): `pgsql` is probed, then the worktree's
// `xaravel_test_<key>[_<name>]` databases are dropped and `xaravel_test_<key>`
// created (on a fast run only created when missing; a failure is NOT-RUN with
// `Postgres database reset failed: <message>`); `redis` is, with `CI=true`,
// probed at `REDIS_HOST`/`REDIS_PORT`, and locally a `redis-server` the
// harness starts on `.cache/redis.sock` and stops when it ends; any other
// backend is probed (./backends.ts). Each Variant whose backend is reachable
// gets one
//
//   <bun> --no-env-file test --preload <this directory>/preload.ts \
//     --reporter=junit --reporter-outfile=<tmp> <the Variant's Ported Test files>
//
// The Variant's Ported Test files (ESC-5.3-4) are the
// `packages/*/tests/ported/**/*.test.ts` files that mirror an Expectations
// shard with a line on the Variant, plus every file that mirrors no shard with
// a line (so a misplaced file still runs, and its tests still report). A file
// `packages/<c>/tests/ported/<P>.test.ts` mirrors the shard
// `conformance/expectations/<c>/<S>.jsonl` when `P` is `S` or starts with
// `S/` (a slice; AD-15 Location). Each run prints one diagnostic per file it
// gets that mirrors no shard with a line:
//   harness: <file> mirrors no Expectations shard; it runs on every Variant
//
// The run has cwd the root (so the root `bunfig.toml` applies) and the
// parent's env plus `XARAVEL_VARIANT=<variant>`, `XARAVEL_HARNESS_OUT=<tmp
// jsonl>`, to which the preload appends the reports and late assertions,
// `XARAVEL_API_SURFACE=<root>/conformance/api-surface`, which the preload's
// API signature lookup reads (ESC-4.8-1 item 1),
// `XARAVEL_INVENTORY=<root>/conformance/inventory`, from which the preload's
// membership hook lets `portedTest` declare only the rows whose Inventory
// `backends` list the Variant (./membership.ts), and the isolation env
// `XARAVEL_WORKTREE_KEY`, `XARAVEL_CACHE_DIR`, `XARAVEL_SQLITE_DIR`,
// `XARAVEL_PG_DATABASE` and, on a Variant whose Redis the harness started,
// `XARAVEL_REDIS_SOCKET`. With no Ported Test file for the Variant nothing is
// spawned and every result is `missing`. A run that exits 0 without a junit
// file ran no test (bun 1.4.3 writes none when every row its files hold is a
// non-member): it prints the diagnostic
//   harness: [<variant>] bun test ran no test over <n> file(s)
// and every result is `missing`. Any other run that leaves no junit file fails
// the harness (exit 1), quoting its stderr. Temp files live in the OS temp directory; the
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
// The Xaravel run (Story 5.9, ./xaravel.ts). After every Variant run, the
// harness stops the Redis it started and releases its lock (Xaravel Tests use
// no backend, and some start harness runs of their own, on the real root
// too), then spawns one more `bun test` as above, with `XARAVEL_VARIANT=none`
// and without `XARAVEL_INVENTORY`,
// over every `conformance/tests/xaravel/**/*.test.ts`,
// `packages/*/tests/xaravel/**/*.test.ts` and `conformance/probes/**/*.test.ts`
// (Story 8.3) (with `-t` when `--id` globs are
// given), and reads the preload's `type: "xaravel"` reports. Its report lines
// (`<id> [xaravel] FAIL|MISSING|LATE`, `- [xaravel] UNDECLARED <name>`, and
// `ERROR [xaravel] bun test exited <n> with no failing testcase`) follow the
// Variant lines, each one difference, and
//   XARAVEL tests=<n> passed=<p> failed=<f> skipped=<s>
// comes right before SUMMARY, whose format does not change. `runHarness` runs
// no Xaravel Tests unless `options.xaravel` asks for them, so the Ratchet and
// other callers are unaffected. With `--xaravel` no Variant runs and no
// Expectations data is read: SUMMARY reads `variants=0 run=0 not-run=0
// checked=0 differ=<d>`. A root with no Xaravel Test file spawns nothing for
// the Xaravel run and prints only its MISSING lines.
//
// Assertion-floor waiver (ESC-5.3-2): a below-floor pass is waived when the
// line's `adapted` is `DIV-<n>.<clause>`, `decisions/DIV-<n>.md` exists, and its
// YAML frontmatter `fewer_assertions` list holds `<clause>` as an item Boost's
// `fewerAssertions` accepts: a quoted string naming an existing clause
// DIV-<n>.<clause>, as `bun run divergence:check` requires. An unquoted number,
// or an item naming no clause, waives nothing.
//
// Exit codes: 0 when no line differs, 1 on a difference or a failed
// precondition, 2 on a usage error.
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { parseFrontmatter } from "../../tools/boost-framework/src/data";
import { fewerAssertions } from "../../tools/boost-framework/src/tools";
import { UsageError, readVariants } from "../../tools/expectations/expectations";
import { ALPHA_VARIANTS, compareUnits } from "../../tools/inventory/inventory";
import { coveringIds, parseManifest } from "../../tools/ownership/ownership";
import { readExpectations, readWorkingInventory } from "../../tools/pin-bump/pin-bump";
import { backendFor, probe, type ProbeResult } from "./backends";
import { compare, type Difference, type HarnessLine, type HarnessReport, type Result, type VariantRun } from "./compare";
import { parseJunit } from "./junit";
import { IsolationError, acquireLock, creationId, isolationEnv, postgresAdmin, preparePostgres, prepareSqlite, startRedis, worktreeKey, worktreeOf, type Lock, type PgAdmin, type RedisServer } from "./isolation";
import { FAST_SAMPLE, SEED, namePattern, sampleIds, selectIds } from "./select";
import { judgeXaravel, xaravelNamePattern, xaravelTestFiles, type XaravelOptions, type XaravelReport, type XaravelResult } from "./xaravel";

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
  /** Also (or, with `only`, just) run the Xaravel Tests (Story 5.9); absent or null runs none. */
  readonly xaravel?: XaravelOptions | null;
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
  /** The Xaravel run's result when one ran, else null (Story 5.9). */
  readonly xaravel: XaravelResult | null;
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

/**
 * The floor waiver (ESC-5.3-2): whether `adapted` names a DIV clause that Boost's `fewerAssertions` accepts in that
 * record's `fewer_assertions`, the items `bun run divergence:check` accepts.
 */
export function waiverFor(root: string): (line: HarnessLine) => boolean {
  const clauses = new Map<string, Set<string>>();
  return (line: HarnessLine): boolean => {
    const match = line.adapted === null ? null : /^DIV-([1-9][0-9]*)\.([^\s.][^\s]*)$/.exec(line.adapted);
    if (match === null) {
      return false;
    }
    const n = match[1]!;
    if (!clauses.has(n)) {
      const path = join(root, "decisions", `DIV-${n}.md`);
      const parsed = existsSync(path) ? parseFrontmatter(readFileSync(path, "utf8")) : null;
      clauses.set(n, parsed === null || typeof parsed === "string" ? new Set() : fewerAssertions(n, parsed.fields, parsed.body).clauses);
    }
    return clauses.get(n)!.has(match[2]!);
  };
}

const EXPECTATIONS_PREFIX = "conformance/expectations/";
const PORTED_FILE = /^packages\/([^/]+)\/tests\/ported\/(.+)\.test\.ts$/;

/** A shard's path under conformance/expectations/ without `.jsonl`: `<c>/<S>`. */
export function shardSubPath(shardPath: string): string {
  const path = shardPath.startsWith(EXPECTATIONS_PREFIX) ? shardPath.slice(EXPECTATIONS_PREFIX.length) : shardPath;
  return path.endsWith(".jsonl") ? path.slice(0, -".jsonl".length) : path;
}

/**
 * The shard sub-paths a Ported Test file `packages/<c>/tests/ported/<P>.test.ts` could mirror: `<c>/<P>` and, for a
 * slice, `<c>/<S>` for every proper prefix `S` of `P` ending before a `/` (AD-15 Location).
 */
export function mirroredShards(file: string): string[] {
  const match = PORTED_FILE.exec(file);
  if (match === null) {
    return [];
  }
  const component = match[1]!;
  const path = match[2]!;
  const candidates = [`${component}/${path}`];
  for (let at = path.indexOf("/"); at !== -1; at = path.indexOf("/", at + 1)) {
    candidates.push(`${component}/${path.slice(0, at)}`);
  }
  return candidates;
}

/** Reads the preload's JSONL output into the run's Ported Test reports, Xaravel Test reports and late ids. */
function readHarnessOut(path: string): { reports: Map<string, HarnessReport>; late: Set<string>; duplicates: Set<string>; xaravel: XaravelReport[] } {
  const reports = new Map<string, HarnessReport>();
  const late = new Set<string>();
  const duplicates = new Set<string>();
  const xaravel: XaravelReport[] = [];
  if (!existsSync(path)) {
    return { reports, late, duplicates, xaravel };
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
    if (isRecord(report) && report["type"] === "xaravel" && typeof report["id"] === "string" && typeof report["consequence"] === "string" && isRecord(report["assertions"])) {
      xaravel.push(report as unknown as XaravelReport);
    }
    const lateRecord = record["late"];
    if (isRecord(lateRecord) && typeof lateRecord["id"] === "string") {
      late.add(lateRecord["id"]);
    }
  }
  return { reports, late, duplicates, xaravel };
}

/** The last `n` non-empty lines of `text`. */
function tail(text: string, n: number): string[] {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line !== "")
    .slice(-n);
}

type SpawnedRun = VariantRun & { xaravel: XaravelReport[]; error: string | null };

/**
 * Spawns one `bun test` run for `variant`, labelled `label` in the report and diagnostics (the Variant, or `xaravel`
 * for the Xaravel run); `error` is the ERROR line when bun exited non-zero with no failing testcase.
 */
async function runVariant(root: string, variant: string, files: readonly string[], pattern: string | null, env: Env, isolated: Readonly<Record<string, string>>, bunArgs: readonly string[], err: string[], label: string = variant): Promise<SpawnedRun> {
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
    // Only a Ported Test Variant run gets the membership Inventory, through `isolated` (the caller's `portedEnv`).
    delete childEnv["XARAVEL_INVENTORY"];
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
      err.push(`harness: [${label}] bun test matched none of the selected tests over ${files.length} file(s)`);
      return emptyRun();
    }
    if (!existsSync(junitPath) && exitCode === 0) {
      err.push(`harness: [${label}] bun test ran no test over ${files.length} file(s)`);
      return emptyRun();
    }
    if (!existsSync(junitPath)) {
      throw new PreconditionError(`[${label}] bun test wrote no junit report (exit ${String(exitCode)}): ${stderr.trim()}`);
    }
    err.push(`harness: [${label}] bun test exited ${String(exitCode)} over ${files.length} file(s)`);
    const junit = parseJunit(readFileSync(junitPath, "utf8"));
    let error: string | null = null;
    if (exitCode !== 0 && ![...junit.values()].some((testcase) => testcase.outcome === "failed")) {
      error = `ERROR [${label}] bun test exited ${String(exitCode)} with no failing testcase`;
      err.push(...tail(stderr, 20).map((line) => `harness: [${label}] ${line}`));
    }
    return { junit, ...readHarnessOut(outPath), error };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function emptyRun(): SpawnedRun {
  return { junit: new Map(), reports: new Map(), late: new Set<string>(), duplicates: new Set<string>(), xaravel: [], error: null };
}

/** The filters as given on the command line, for the empty-selection message. */
function describeFilters(options: HarnessOptions): string {
  const parts = [...(options.components ?? []).map((c) => `--component ${c}`), ...(options.ids ?? []).map((g) => `--id ${g}`)];
  if (options.story !== undefined && options.story !== null) {
    parts.push(`--story ${options.story}`);
  }
  return parts.length === 0 ? "the Expectations File" : parts.join(" ");
}

/** The `test_ids` of `stories/<story>.md`; diagnoses those with no Expectations line, for themselves or a row `X#<key>`. */
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
  // A listed `X` has a line when `X` or one of its rows `X#<key>` does (ownership's `covers`).
  const listed = new Set(parsed.manifest.testIds);
  const known = new Set<string>();
  for (const id of universe.keys()) {
    for (const covering of coveringIds(listed, id)) {
      known.add(covering);
    }
  }
  const unknown = parsed.manifest.testIds.filter((id) => !known.has(id));
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
    const xaravelOptions = options.xaravel ?? null;
    const xaravelOnly = xaravelOptions?.only === true;
    const differences: Difference[] = [];
    const errors: string[] = [];
    const reportLines: string[] = [];
    let variants: string[] = [];
    let run = 0;
    let notRun = 0;
    let checked = 0;
    let ciDifferences = 0;
    if (!xaravelOnly) {
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
      /** Each Variant's Test IDs: every one with an Expectations line on it (the UNKNOWN check). */
      const knownIds = new Map<string, Set<string>>();
      /** Each Variant's shards with a line on it, as `<c>/<S>` (the path under conformance/expectations/, without `.jsonl`). */
      const shardsOf = new Map<string, Set<string>>();
      /** Each Test ID's Component: the first path segment of its shard under conformance/expectations/. */
      const universe = new Map<string, string>();
      const vocabularySet = new Set(vocabulary.variants);
      for (const shard of shards) {
        const component = shard.path.split("/")[2] ?? "";
        const subPath = shardSubPath(shard.path);
        shard.lines.forEach((raw, index) => {
          const variant = raw["variant"];
          const status = raw["status"];
          if (typeof variant !== "string" || !vocabularySet.has(variant)) {
            throw new PreconditionError(`${shard.path}:${index + 1}: Variant ${JSON.stringify(variant)} is not in conformance/variants`);
          }
          const line: HarnessLine = { id: raw["id"] as string, variant, status: typeof status === "string" ? status : String(status), reason: stringOrNull(raw["reason"]), adapted: stringOrNull(raw["adapted"]) };
          const known = knownIds.get(variant) ?? new Set<string>();
          known.add(line.id);
          knownIds.set(variant, known);
          const variantShards = shardsOf.get(variant) ?? new Set<string>();
          variantShards.add(subPath);
          shardsOf.set(variant, variantShards);
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
      variants = vocabulary.variants.filter((variant) => linesOf(variant).length > 0);
      const mirrors = new Map(portedTestFiles(root).map((file) => [file, mirroredShards(file)] as const));
      const anyShard = new Set([...shardsOf.values()].flatMap((set) => [...set]));
      /** Whether a file mirrors no shard with a line on any Variant. */
      const unmapped = (file: string): boolean => !(mirrors.get(file) ?? []).some((candidate) => anyShard.has(candidate));
      /** The Variant's Ported Test files: those mirroring one of its shards, and those mirroring no shard with a line (see the header). */
      const filesOf = (variant: string): string[] => {
        const own = shardsOf.get(variant) ?? new Set<string>();
        return [...mirrors]
          .filter(([file, candidates]) => candidates.some((candidate) => own.has(candidate)) || unmapped(file))
          .map(([file]) => file);
      };
      const ci = env["CI"] === "true";
      const waived = waiverFor(root);
      // Backend preparation: `sqlite` before every Variant run on it, any other backend once, the first time a run Variant needs it.
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
        const pending = (backend === "sqlite" ? null : prepared.get(backend)) ?? prepare(backend);
        if (backend !== "sqlite") {
          prepared.set(backend, pending);
        }
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
        let files = filesOf(variant);
        let pattern: string | null = null;
        if (selected !== null) {
          const selectedComponents = new Set(lines.map((line) => universe.get(line.id) ?? ""));
          files = files.filter((file) => selectedComponents.has(file.split("/")[1] ?? ""));
          const ofComponents = byVariant.get(variant)!.filter((line) => selectedComponents.has(universe.get(line.id) ?? "")).length;
          const candidate = namePattern(lines.map((line) => line.id));
          if (ofComponents !== lines.length && candidate.length <= MAX_PATTERN) {
            pattern = candidate;
          }
        }
        const portedEnv: Record<string, string> = { ...isolated, XARAVEL_INVENTORY: join(root, "conformance", "inventory") };
        if (backend === "redis" && services.redis !== null) {
          portedEnv["XARAVEL_REDIS_SOCKET"] = services.redis.socket;
        }
        for (const file of files) {
          if (unmapped(file)) {
            err.push(`harness: ${file} mirrors no Expectations shard; it runs on every Variant`);
          }
        }
        const variantRun = files.length === 0 ? emptyRun() : await runVariant(root, variant, files, pattern, env, portedEnv, options.bunArgs ?? [], err);
        const compared = compare({ variant, lines, knownIds: knownIds.get(variant) ?? new Set<string>(), run: variantRun, inventory, waived });
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
    }
    let xaravel: XaravelResult | null = null;
    /** Whether the Xaravel run had files to run, and so prints its lines. */
    let xaravelRan = false;
    if (xaravelOptions !== null) {
      // The Xaravel run uses no backend, and its tests start harness runs of their own: free the Redis and the lock first.
      await cleanup();
      const globs = xaravelOptions.ids ?? [];
      const files = xaravelTestFiles(root);
      const pattern = xaravelNamePattern(globs);
      xaravelRan = files.length > 0;
      const spawned = files.length === 0 ? emptyRun() : await runVariant(root, "none", files, pattern, env, isolated, options.bunArgs ?? [], err, "xaravel");
      xaravel = judgeXaravel({ junit: spawned.junit, reports: spawned.xaravel, late: spawned.late, ids: globs, pattern, error: spawned.error });
      for (const line of xaravel.lines) {
        const id = /^(XT-\S+) \[xaravel\] /.exec(line)?.[1] ?? "-";
        counted.push({ id, variant: "xaravel", kind: "unexpected-failure", text: line, detail: null });
      }
      for (const result of xaravel.results) {
        const junit = result.consequence === null ? undefined : spawned.junit.get(`${result.id}: ${result.consequence}`);
        if (result.outcome === "fail" && junit !== undefined && junit.outcome === "failed") {
          err.push(`harness: ${result.id} [xaravel]: ${junit.type ?? "(no type)"}: ${(junit.message ?? "").split("\n")[0]}`);
        }
      }
    }
    // One diagnostic line per difference with a reason (see the header).
    for (const difference of differences) {
      if (difference.detail !== null) {
        err.push(`harness: ${difference.id} [${difference.variant}]: ${difference.detail}`);
      }
    }
    out.push(...reportLines);
    if (xaravel !== null && (xaravelRan || xaravel.lines.length > 0)) {
      out.push(...xaravel.lines, xaravel.summary);
    }
    const differ = differences.length + errors.length + ciDifferences + (xaravel?.differ ?? 0);
    const mode = sample === null ? "" : ` mode=fast seed=${sample.seed}`;
    out.push(`SUMMARY variants=${variants.length} run=${run} not-run=${notRun} checked=${checked} differ=${differ}${mode}`);
    return { code: differ === 0 ? 0 : 1, out, err, results, differences: counted, sample, worktree, xaravel };
  } catch (error) {
    if (error instanceof PreconditionError || error instanceof IsolationError) {
      err.push(`harness: ${error.message}`);
      return { code: 1, out, err, results, differences: counted, sample, worktree, xaravel: null };
    }
    err.push(`harness failed: ${message(error)}`);
    return { code: 1, out, err, results, differences: counted, sample, worktree, xaravel: null };
  } finally {
    try {
      await cleanup();
    } finally {
      options.onCleanup?.(null);
    }
  }
}

const USAGE = [
  "Usage: bun --no-env-file conformance/harness/harness.ts [--root <dir>] [--fast] [--seed <s>] [--component <c>]... [--id <glob>]... [--story <story-id>]",
  "       bun --no-env-file conformance/harness/harness.ts [--root <dir>] --xaravel [--id <glob>]...",
].join("\n");

/** The CLI's root and options; throws `UsageError` (exit 2). */
export function parseArgs(argv: readonly string[]): { root: string; options: HarnessOptions } {
  let root = resolve(import.meta.dir, "..", "..");
  let fast = false;
  let xaravel = false;
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
    if (arg === "--xaravel") {
      xaravel = true;
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
  if (xaravel) {
    if (fast || seed !== null || story !== null || components.length > 0) {
      throw new UsageError("--xaravel takes only --root and --id");
    }
    return { root, options: { xaravel: { only: true, ids } } };
  }
  const full = !fast && seed === null && story === null && components.length === 0 && ids.length === 0;
  return { root, options: { fast: fast || seed !== null, seed, components, ids, story, xaravel: full ? { only: false } : null } };
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
