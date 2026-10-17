// The Upstream baseline run: assertion kinds and Oracle outcomes (Story 2.6;
// FR-3, FR-113).
//
//   bun tools/baseline/baseline.ts run --suite <framework|ai|mcp|boost> --variant <v> --attempt <1|2> --out <dir>
//       [--root <dir>] [--image <ref> | --local <dir> [--php <bin>]]
//       runs one leg: the suite's tests tagged with alpha variant <v>, once,
//       in the Oracle image (`xaravel-oracle:<oracle tag>`, or `--image
//       <ref>`, through tools/oracle's `runInImageNetworked`: host network,
//       the variant's environment, tools/baseline mounted read-only), or with
//       `--local <dir>` against a locked install of the suite's snapshot and
//       the local PHP (or `--php <bin>`). It lists the suite with
//       tools/inventory's lister (the PHPUnit ID to Inventory ID and test file
//       mapping), runs tools/baseline/runner.php on the test files holding
//       tagged entries, and writes `<dir>/<suite>.<variant>.<attempt>.jsonl`:
//       one `{"id","outcome","assertions"}` line per tagged Inventory ID,
//       sorted by id.
//   bun tools/baseline/baseline.ts merge --in <dir> [--root <dir>]
//       reads attempts 1 and 2 of every (entry, alpha variant) from <dir>,
//       checks that they agree, and writes `assertions` and `oracle` into
//       conformance/inventory/*.jsonl. Any disagreement prints `oracle
//       non-determinism: <id> on <variant>: <attempt 1> vs <attempt 2>`, and
//       a missing result names the ID and variant; either exits 1 and writes
//       nothing.
//
// The pure parts (`variantsFor`, `planRun`, `collectResults`,
// `compareAttempts`, `mergeResults`) are exported for the tests, which need
// neither PHP nor a container runtime. docs/ops/baseline.md describes the run.
//
// Exit codes: 0 pass, 1 any failure (fail closed), 2 usage error.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  ALPHA_VARIANTS,
  alphaVariants,
  compareUnits,
  INVENTORY_DIR,
  LISTER,
  listSuite,
  oracleImage,
  OUTCOMES,
  PEST_SUITES,
  pestTestId,
  readSuiteInventory,
  renderInventory,
  sortedRecord,
  SUITES,
  type InventoryEntry,
  type Outcome,
  type PestRawTest,
  type PestSuite,
  type RawTest,
  type Suite,
} from "../inventory/inventory";
import { IMAGE_UPSTREAM_DIR, networkedRunArgs, PHP_VERSION, runInImageNetworked, type NetworkedRun } from "../oracle/oracle";
import { UPSTREAM_DIR, upstreamPath } from "../upstream/upstream";

export { ALPHA_VARIANTS, networkedRunArgs };
/** The baseline tool directory, relative to the repository root. */
export const BASELINE_DIR = "tools/baseline";
/** Where image mode mounts tools/baseline. */
const IMAGE_TOOLS = "/xaravel/baseline";
/** Where image mode mounts the run's work directory (read-write). */
const IMAGE_WORK = "/xaravel/work";

const SQLITE: Readonly<Record<string, string>> = { DB_CONNECTION: "sqlite" };
const PGSQL: Readonly<Record<string, string>> = { DB_CONNECTION: "pgsql", DB_HOST: "127.0.0.1", DB_PORT: "5432", DB_DATABASE: "laravel", DB_USERNAME: "forge", DB_PASSWORD: "password" };
const REDIS: Readonly<Record<string, string>> = { REDIS_CLIENT: "phpredis", REDIS_HOST: "127.0.0.1", REDIS_PORT: "6379", REDIS_CACHE_CONNECTION: "cache", REDIS_CACHE_LOCK_CONNECTION: "cache" };

/** Each alpha variant's extra environment (Upstream's databases, queues and redis workflows). */
export const VARIANT_ENV: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  none: {},
  pgsql: PGSQL,
  "queue-database@sqlite": { ...SQLITE, QUEUE_CONNECTION: "database" },
  "queue-redis@redis": { ...REDIS, QUEUE_CONNECTION: "redis" },
  "queue-sync@none": { QUEUE_CONNECTION: "sync" },
  redis: { ...REDIS, CACHE_STORE: "redis" },
  sqlite: SQLITE,
};
/** The variants whose run first creates Testbench's SQLite database (`vendor/bin/testbench package:create-sqlite-db`). */
export const SQLITE_VARIANTS: readonly string[] = ["queue-database@sqlite", "sqlite"];

export interface Leg {
  suite: Suite;
  variant: string;
}

/** Every leg the baseline workflow runs (twice each): the framework on every alpha variant, each Pest suite on `none`. */
export const LEGS: readonly Leg[] = [...ALPHA_VARIANTS.map((variant) => ({ suite: "framework" as Suite, variant })), ...PEST_SUITES.map((suite) => ({ suite: suite as Suite, variant: "none" }))];

/** One leg's result for one Inventory ID. */
export interface Result {
  id: string;
  outcome: Outcome;
  assertions: Record<string, number>;
}

/** The alpha variants of an entry's backends, sorted: its `oracle` keys. */
export function variantsFor(backends: readonly string[]): string[] {
  return alphaVariants(backends);
}

/** The suite an Inventory entry belongs to: its Component when that is a Pest suite, otherwise the framework. */
export function suiteOf(entry: Pick<InventoryEntry, "component">): Suite {
  return (PEST_SUITES as readonly string[]).includes(entry.component) ? (entry.component as PestSuite) : "framework";
}

/** The results file name of a leg's attempt. */
export function resultsFile(suite: Suite, variant: string, attempt: number): string {
  return `${suite}.${variant}.${attempt}.jsonl`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const KIND = /^assert[A-Za-z0-9_]*$/;
const WORST: Readonly<Record<Outcome, number>> = { pass: 0, skip: 1, fail: 2 };

function worse(a: Outcome | null, b: Outcome): Outcome {
  return a === null || WORST[b] > WORST[a] ? b : a;
}

// ---------------------------------------------------------------------------
// Planning a leg

export interface Plan {
  suite: Suite;
  variant: string;
  /** Every listed PHPUnit test ID, to its Inventory ID. */
  listed: Map<string, string>;
  /** The PHPUnit IDs of the entries tagged with the variant, to their Inventory IDs. */
  tagged: Map<string, string>;
  /** The test files holding tagged entries, sorted, or null when that is every listed file (the suite is kept whole). */
  files: string[] | null;
}

/**
 * Plans one leg from the suite's Inventory entries and its lister lines. Throws when a lister line maps to no
 * Inventory entry, or a tagged entry is not listed.
 */
export function planRun(suite: Suite, variant: string, entries: readonly InventoryEntry[], raws: readonly (RawTest | PestRawTest)[]): Plan {
  const inventory = new Set(entries.map((entry) => entry.id));
  const listed = new Map<string, string>();
  const fileOf = new Map<string, string>();
  for (const raw of raws) {
    const id = suite === "framework" ? raw.id : pestTestId(suite, raw as PestRawTest);
    if (!inventory.has(id)) {
      throw new Error(`the lister lists ${id}, which is not in the ${suite} Inventory; regenerate it (bun run inventory)`);
    }
    listed.set(raw.id, id);
    fileOf.set(id, raw.file);
  }
  const byInventory = new Map([...listed].map(([phpunit, id]) => [id, phpunit]));
  const tagged = new Map<string, string>();
  const missing: string[] = [];
  for (const entry of entries) {
    if (!entry.backends.includes(variant)) {
      continue;
    }
    const phpunit = byInventory.get(entry.id);
    if (phpunit === undefined) {
      missing.push(entry.id);
    } else {
      tagged.set(phpunit, entry.id);
    }
  }
  if (missing.length > 0) {
    throw new Error(`the lister does not list ${missing.length} ${suite} Inventory entries tagged ${variant}, first ${missing[0]}; regenerate the Inventory (bun run inventory)`);
  }
  const all = [...new Set(fileOf.values())].sort(compareUnits);
  const files = [...new Set([...tagged.values()].map((id) => fileOf.get(id)!))].sort(compareUnits);
  return { suite, variant, listed, tagged, files: files.join("\n") === all.join("\n") ? null : files };
}

// ---------------------------------------------------------------------------
// The recorder's lines

interface RecorderLine {
  test: string | null;
  class: string | null;
  outcome: Outcome | null;
  assertions: Record<string, number>;
}

function parseRecorder(text: string): RecorderLine[] {
  const lines = text.split("\n").filter((line) => line !== "");
  return lines.map((line, index) => {
    const at = `recorder line ${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new Error(`${at}: malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isRecord(value) || Object.keys(value).join(",") !== "test,class,outcome,assertions") {
      throw new Error(`${at}: expected the keys test, class, outcome, assertions`);
    }
    const { test, class: cls, outcome, assertions } = value;
    if ((test === null) === (cls === null) || (test !== null && typeof test !== "string") || (cls !== null && typeof cls !== "string")) {
      throw new Error(`${at}: exactly one of test and class must be a string`);
    }
    if (outcome !== null && !OUTCOMES.includes(outcome as Outcome)) {
      throw new Error(`${at}: bad outcome ${JSON.stringify(outcome)}`);
    }
    if (cls !== null && outcome === null) {
      throw new Error(`${at}: a class-level line needs an outcome`);
    }
    if (!isRecord(assertions) || Object.entries(assertions).some(([kind, count]) => !KIND.test(kind) || !Number.isSafeInteger(count) || (count as number) < 1)) {
      throw new Error(`${at}: assertions must map assert* kinds to positive integers`);
    }
    return { test: test as string | null, class: cls as string | null, outcome: outcome as Outcome | null, assertions: assertions as Record<string, number> };
  });
}

/**
 * The leg's results from the recorder's output: one per tagged entry, sorted by Inventory ID. A test's
 * outcome is its worst (fail > skip > pass), class-level outcomes included; its assertion counts are summed
 * over its lines (a test run in a separate process records in both processes). Throws when an outcome or an
 * assertion arrives for an unlisted test or class, or a tagged entry gets no outcome.
 */
export function collectResults(plan: Plan, recorderText: string): Result[] {
  const outcomes = new Map<string, Outcome>();
  const assertions = new Map<string, Record<string, number>>();
  for (const line of parseRecorder(recorderText)) {
    if (line.test !== null) {
      if (!plan.listed.has(line.test)) {
        throw new Error(`the run reported ${line.test}, which the lister does not list`);
      }
      if (line.outcome !== null) {
        outcomes.set(line.test, worse(outcomes.get(line.test) ?? null, line.outcome));
      }
      const counts = assertions.get(line.test) ?? {};
      for (const [kind, count] of Object.entries(line.assertions)) {
        counts[kind] = (counts[kind] ?? 0) + count;
      }
      assertions.set(line.test, counts);
      continue;
    }
    const scope = line.class!;
    const matches = [...plan.listed.keys()].filter((id) => (scope.includes("::") ? id === scope || id.startsWith(`${scope}#`) : id.startsWith(`${scope}::`)));
    if (matches.length === 0) {
      throw new Error(`the run reported ${line.outcome!} for ${scope}, which holds no listed test`);
    }
    for (const id of matches) {
      outcomes.set(id, worse(outcomes.get(id) ?? null, line.outcome!));
    }
  }
  const results: Result[] = [];
  const missing: string[] = [];
  for (const [phpunit, id] of plan.tagged) {
    const outcome = outcomes.get(phpunit);
    if (outcome === undefined) {
      missing.push(id);
      continue;
    }
    results.push({ id, outcome, assertions: sortedRecord(assertions.get(phpunit) ?? {}) });
  }
  if (missing.length > 0) {
    missing.sort(compareUnits);
    const shown = missing.slice(0, 20).map((id) => `  ${id}`);
    throw new Error(`${missing.length} tagged ${plan.suite} tests got no outcome on ${plan.variant}:\n${shown.join("\n")}${missing.length > 20 ? `\n  … and ${missing.length - 20} more` : ""}`);
  }
  return results.sort((a, b) => compareUnits(a.id, b.id));
}

/** The results file text: one `{"id","outcome","assertions"}` line per result, sorted by id. */
export function renderResults(results: readonly Result[]): string {
  return [...results]
    .sort((a, b) => compareUnits(a.id, b.id))
    .map((result) => `${JSON.stringify({ id: result.id, outcome: result.outcome, assertions: sortedRecord(result.assertions) })}\n`)
    .join("");
}

/** Parses a results file; throws `<file>:<line>: …` on anything malformed or unsorted. */
export function parseResults(text: string, file: string): Map<string, Result> {
  const results = new Map<string, Result>();
  let previous: string | null = null;
  text
    .split("\n")
    .filter((line) => line !== "")
    .forEach((line, index) => {
      const at = `${file}:${index + 1}`;
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch (error) {
        throw new Error(`${at}: malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!isRecord(value) || Object.keys(value).join(",") !== "id,outcome,assertions") {
        throw new Error(`${at}: expected the keys id, outcome, assertions`);
      }
      const { id, outcome, assertions } = value;
      if (typeof id !== "string" || id === "") {
        throw new Error(`${at}: bad id`);
      }
      if (!OUTCOMES.includes(outcome as Outcome)) {
        throw new Error(`${at}: bad outcome ${JSON.stringify(outcome)}`);
      }
      if (!isRecord(assertions) || Object.entries(assertions).some(([kind, count]) => !KIND.test(kind) || !Number.isSafeInteger(count) || (count as number) < 1)) {
        throw new Error(`${at}: assertions must map assert* kinds to positive integers`);
      }
      if (previous !== null && compareUnits(previous, id) >= 0) {
        throw new Error(`${at}: ${id} is not sorted after ${previous}`);
      }
      previous = id;
      results.set(id, { id, outcome: outcome as Outcome, assertions: sortedRecord(assertions as Record<string, number>) });
    });
  return results;
}

// ---------------------------------------------------------------------------
// Merging

const renderAttempt = (result: Result): string => JSON.stringify({ outcome: result.outcome, assertions: sortedRecord(result.assertions) });

/** Null when two attempts agree on outcome and assertions; otherwise the `oracle non-determinism: …` line. */
export function compareAttempts(id: string, variant: string, first: Result, second: Result): string | null {
  const a = renderAttempt(first);
  const b = renderAttempt(second);
  return a === b ? null : `oracle non-determinism: ${id} on ${variant}: ${a} vs ${b}`;
}

/** Looks up a leg attempt's results; null when its file is missing. */
export type ResultsLookup = (suite: Suite, variant: string, attempt: 1 | 2) => ReadonlyMap<string, Result> | null;

export interface MergeOutcome {
  /** The entries with `assertions` and `oracle` set; meaningful only when `problems` is empty. */
  entries: InventoryEntry[];
  /** Non-determinism and missing-result lines. */
  problems: string[];
}

/**
 * Sets each entry's `oracle` (alpha variant to attempt 1's outcome) and `assertions` (each kind's maximum over
 * those variants; null without one) from the two attempts. Reports every disagreement, every missing result
 * and every result that matches no tagged entry.
 */
export function mergeResults(entries: readonly InventoryEntry[], lookup: ResultsLookup): MergeOutcome {
  const problems: string[] = [];
  const used = new Map<string, Set<string>>();
  const missingFiles = new Map<string, { first: string; count: number }>();
  const merged = entries.map((entry): InventoryEntry => {
    const variants = variantsFor(entry.backends);
    if (variants.length === 0) {
      return { ...entry, assertions: null, oracle: {} };
    }
    const suite = suiteOf(entry);
    const oracle: Record<string, Outcome> = {};
    const assertions: Record<string, number> = {};
    for (const variant of variants) {
      const attempts: Result[] = [];
      for (const attempt of [1, 2] as const) {
        const file = resultsFile(suite, variant, attempt);
        const results = lookup(suite, variant, attempt);
        if (results === null) {
          const missing = missingFiles.get(file);
          if (missing === undefined) {
            missingFiles.set(file, { first: `${entry.id} on ${variant}`, count: 1 });
          } else {
            missing.count++;
          }
          continue;
        }
        const result = results.get(entry.id);
        if (result === undefined) {
          problems.push(`missing result: ${entry.id} on ${variant} (attempt ${attempt}, ${file})`);
          continue;
        }
        const seen = used.get(file) ?? new Set<string>();
        seen.add(entry.id);
        used.set(file, seen);
        attempts.push(result);
      }
      if (attempts.length !== 2) {
        continue;
      }
      const difference = compareAttempts(entry.id, variant, attempts[0]!, attempts[1]!);
      if (difference !== null) {
        problems.push(difference);
        continue;
      }
      oracle[variant] = attempts[0]!.outcome;
      for (const [kind, count] of Object.entries(attempts[0]!.assertions)) {
        assertions[kind] = Math.max(assertions[kind] ?? 0, count);
      }
    }
    return { ...entry, assertions: sortedRecord(assertions), oracle: sortedRecord(oracle) };
  });
  for (const [file, { first, count }] of [...missingFiles].sort(([a], [b]) => compareUnits(a, b))) {
    problems.push(`missing result: ${first} (no ${file}; ${count} results missing)`);
  }
  for (const { suite, variant } of LEGS) {
    for (const attempt of [1, 2] as const) {
      const results = lookup(suite, variant, attempt);
      const seen = used.get(resultsFile(suite, variant, attempt)) ?? new Set<string>();
      for (const id of results?.keys() ?? []) {
        if (!seen.has(id)) {
          problems.push(`${resultsFile(suite, variant, attempt)}: ${id} is not an Inventory entry tagged ${variant}`);
        }
      }
    }
  }
  return { entries: merged, problems };
}

export interface MergeResult {
  written: string[];
  total: number;
}

/** Merges the results in `inDir` into the Inventory under `root`; throws with every problem, writing nothing, when the attempts disagree or a result is missing. */
export function merge(root: string, inDir: string): MergeResult {
  if (!existsSync(inDir)) {
    throw new Error(`--in ${inDir} does not exist`);
  }
  const cache = new Map<string, Map<string, Result> | null>();
  const lookup: ResultsLookup = (suite, variant, attempt) => {
    const name = resultsFile(suite, variant, attempt);
    if (!cache.has(name)) {
      const path = join(inDir, name);
      cache.set(name, existsSync(path) ? parseResults(readFileSync(path, "utf8"), name) : null);
    }
    return cache.get(name)!;
  };
  const entries = SUITES.flatMap((suite) => readSuiteInventory(root, suite));
  const { entries: merged, problems } = mergeResults(entries, lookup);
  if (problems.length > 0) {
    throw new Error(`the baseline results do not merge (${problems.length} problems):\n${problems.map((line) => `  ${line}`).join("\n")}`);
  }
  const dir = join(root, INVENTORY_DIR);
  const written: string[] = [];
  for (const [component, text] of renderInventory(merged)) {
    const file = join(dir, `${component}.jsonl`);
    if (!existsSync(file) || readFileSync(file, "utf8") !== text) {
      writeFileSync(file, text);
    }
    written.push(`${INVENTORY_DIR}/${component}.jsonl`);
  }
  return { written, total: merged.length };
}

// ---------------------------------------------------------------------------
// Running a leg

export interface RunOptions {
  suite: Suite;
  variant: string;
  attempt: 1 | 2;
  out: string;
  /** The image to run in; default `xaravel-oracle:<oracle tag>`. */
  image?: string;
  /** A locked install of the suite's snapshot to run against instead. */
  local?: string;
  /** The PHP binary for `local`; default `php`. */
  php?: string;
}

function spawn(command: readonly string[], cwd: string, env: Record<string, string>, what: string): string {
  const proc = Bun.spawnSync([...command], { cwd, env, stdout: "pipe", stderr: "inherit", stdin: "ignore" });
  if (proc.exitCode !== 0) {
    throw new Error(`${what} failed (exit ${proc.exitCode ?? "signal"}); its stderr is above`);
  }
  return proc.stdout.toString();
}

/** Runs one leg and writes its results file; returns its path and the result count. */
export function run(root: string, options: RunOptions): { file: string; results: Result[] } {
  const { suite, variant, attempt } = options;
  if (!SUITES.includes(suite)) {
    throw new Error(`unknown suite ${JSON.stringify(suite)}`);
  }
  if (!LEGS.some((leg) => leg.suite === suite && leg.variant === variant)) {
    throw new Error(`${suite} has no baseline leg on ${variant}`);
  }
  const snapshot = upstreamPath(root, suite, ".");
  if (!existsSync(join(snapshot, "tests"))) {
    throw new Error(`${UPSTREAM_DIR}/${suite}/tests is missing; run bun run upstream:sync`);
  }
  const lister = resolve(root, LISTER);
  const runner = resolve(root, BASELINE_DIR, "runner.php");
  for (const [path, label] of [
    [lister, LISTER],
    [runner, `${BASELINE_DIR}/runner.php`],
    [resolve(root, BASELINE_DIR, "recorder.php"), `${BASELINE_DIR}/recorder.php`],
  ] as const) {
    if (!existsSync(path)) {
      throw new Error(`${label} is missing`);
    }
  }
  const entries = readSuiteInventory(root, suite);
  const raws = listSuite(root, suite, snapshot, lister, options.local === undefined ? { image: options.image ?? oracleImage(root) } : { local: options.local, ...(options.php === undefined ? {} : { php: options.php }) });
  const plan = planRun(suite, variant, entries, raws);
  const kind = suite === "framework" ? "phpunit" : "pest";
  const work = mkdtempSync(join(tmpdir(), "xaravel-baseline-"));
  let stdout: string;
  try {
    if (plan.files !== null) {
      writeFileSync(join(work, "files"), plan.files.map((file) => `${file}\n`).join(""));
    }
    const sqlite = SQLITE_VARIANTS.includes(variant);
    if (options.local !== undefined) {
      const local = resolve(options.local);
      const php = options.php ?? "php";
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          env[key] = value;
        }
      }
      Object.assign(env, VARIANT_ENV[variant]);
      if (sqlite) {
        spawn([php, "vendor/bin/testbench", "package:create-sqlite-db"], local, env, "testbench package:create-sqlite-db");
      }
      stdout = spawn([php, runner, local, PHP_VERSION, kind, plan.files === null ? "-" : join(work, "files")], local, env, "the baseline runner");
    } else {
      const image = options.image ?? oracleImage(root);
      const dir = `${IMAGE_UPSTREAM_DIR}/${suite}`;
      const args = [dir, PHP_VERSION, kind, plan.files === null ? "-" : `${IMAGE_WORK}/files`];
      const command = sqlite
        ? ["sh", "-c", 'set -e; cd "$1"; php vendor/bin/testbench package:create-sqlite-db >&2; exec php /xaravel/baseline/runner.php "$@"', "sh", ...args]
        : ["php", `${IMAGE_TOOLS}/runner.php`, ...args];
      const networked: NetworkedRun = { env: VARIANT_ENV[variant]!, mounts: [{ host: resolve(root, BASELINE_DIR), container: IMAGE_TOOLS }], output: { host: work, container: IMAGE_WORK } };
      stdout = runInImageNetworked(image, networked, command);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const results = collectResults(plan, stdout);
  mkdirSync(options.out, { recursive: true });
  const file = join(options.out, resultsFile(suite, variant, attempt));
  writeFileSync(file, renderResults(results));
  return { file, results };
}

// ---------------------------------------------------------------------------
// CLI

class UsageError extends Error {}

const USAGE = [
  "Usage:",
  "  bun tools/baseline/baseline.ts run --suite <framework|ai|mcp|boost> --variant <variant> --attempt <1|2> --out <dir> [--root <dir>] [--image <ref> | --local <dir> [--php <bin>]]",
  "  bun tools/baseline/baseline.ts merge --in <dir> [--root <dir>]",
  `Variants: ${ALPHA_VARIANTS.join(", ")} (the Pest suites ai, mcp and boost run only on none).`,
].join("\n");

function parseFlags(argv: readonly string[], allowed: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!allowed.includes(arg)) {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    if (flags.has(arg)) {
      throw new UsageError(`${arg} given twice`);
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    flags.set(arg, value);
  }
  return flags;
}

function required(flags: Map<string, string>, flag: string): string {
  const value = flags.get(flag);
  if (value === undefined) {
    throw new UsageError(`${flag} is required`);
  }
  return value;
}

/** Parses `run`'s arguments; throws a usage error on an unknown suite or variant, a missing flag or a bad combination. */
export function parseRunArgs(argv: readonly string[]): { root: string } & RunOptions {
  const flags = parseFlags(argv, ["--suite", "--variant", "--attempt", "--out", "--root", "--image", "--local", "--php"]);
  const suite = required(flags, "--suite");
  if (!(SUITES as readonly string[]).includes(suite)) {
    throw new UsageError(`Unknown suite: ${suite} (expected ${SUITES.join(", ")})`);
  }
  const variant = required(flags, "--variant");
  if (!ALPHA_VARIANTS.includes(variant)) {
    throw new UsageError(`Unknown variant: ${variant} (expected ${ALPHA_VARIANTS.join(", ")})`);
  }
  if (!LEGS.some((leg) => leg.suite === suite && leg.variant === variant)) {
    throw new UsageError(`${suite} runs only on none`);
  }
  const attempt = required(flags, "--attempt");
  if (attempt !== "1" && attempt !== "2") {
    throw new UsageError(`--attempt must be 1 or 2, not ${attempt}`);
  }
  const out = resolve(required(flags, "--out"));
  const image = flags.get("--image");
  const local = flags.get("--local");
  const php = flags.get("--php");
  if (image !== undefined && local !== undefined) {
    throw new UsageError("--image and --local are exclusive");
  }
  if (php !== undefined && local === undefined) {
    throw new UsageError("--php needs --local");
  }
  return {
    root: resolve(flags.get("--root") ?? resolve(import.meta.dir, "..", "..")),
    suite: suite as Suite,
    variant,
    attempt: Number(attempt) as 1 | 2,
    out,
    ...(image === undefined ? {} : { image }),
    ...(local === undefined ? {} : { local }),
    ...(php === undefined ? {} : { php }),
  };
}

export function main(argv: readonly string[]): number {
  const [command, ...rest] = argv;
  try {
    if (command === "run") {
      const { root, ...options } = parseRunArgs(rest);
      const { file, results } = run(root, options);
      const counts = { pass: 0, skip: 0, fail: 0 };
      for (const result of results) {
        counts[result.outcome]++;
      }
      process.stdout.write(`${options.suite} on ${options.variant}, attempt ${options.attempt}: ${results.length} tests (${counts.pass} pass, ${counts.skip} skip, ${counts.fail} fail); wrote ${file}\n`);
      return 0;
    }
    if (command === "merge") {
      const flags = parseFlags(rest, ["--in", "--root"]);
      const inDir = resolve(required(flags, "--in"));
      const root = resolve(flags.get("--root") ?? resolve(import.meta.dir, "..", ".."));
      const result = merge(root, inDir);
      process.stdout.write(`Baseline merged: ${result.total} entries in ${result.written.length} files.\n`);
      return 0;
    }
    throw new UsageError(command === undefined ? "Missing command" : `Unknown command: ${command}`);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`Baseline ${command} failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
