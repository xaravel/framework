// The runner-listing cross-check of the Test Inventory (Story 2.7, FR-1).
//
//   bun tools/inventory/cross-check.ts [--suite <framework|ai|mcp|boost|all>] [--root <dir>] [--image <ref> | --local <dir> [--php <bin>]]
//       runs each suite's own `--list-tests` (`vendor/bin/phpunit` for the
//       framework, `vendor/bin/pest` for ai, mcp and boost) and compares that
//       set of Test IDs with the committed Inventory's, listing the missing
//       and extra IDs. The suite and mode rules are `generate`'s: image mode
//       (the Oracle image, or `--image <ref>`, through tools/oracle's
//       `runInImage`, with no network) defaults to `all`; `--local <dir>`
//       takes one suite's locked install (default `framework`), which must be
//       a copy of the snapshot, and runs the local PHP (or `--php <bin>`).
//
// The framework's PHPUnit ID is its Inventory ID. A Pest runner lists only
// PHPUnit-level `P\…::__pest_evaluable_…` names, so each is mapped to its
// Inventory ID through the lister's raw `id` and `pestTestId`, as
// tools/baseline does. A runner ID the lister does not list is extra.
//
// Exit codes: 0 every suite matches, 1 any missing or extra ID or any failure
// (fail closed), 2 usage error. Every suite is checked before the summary.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { UPSTREAM_DIR, upstreamPath } from "../upstream/upstream";
import { IMAGE_UPSTREAM_DIR, runInImage } from "../oracle/oracle";
import {
  checkLocalCopy,
  compareUnits,
  LISTER,
  listSuite,
  oracleImage,
  parseOptions,
  pestTestId,
  readSuiteInventory,
  SUITES,
  UsageError,
  type GenerateOptions,
  type PestRawTest,
  type Suite,
} from "./inventory";

export type Runner = "phpunit" | "pest";

export type CrossCheckOptions = Omit<GenerateOptions, "check">;

export interface SuiteComparison {
  suite: Suite;
  runner: Runner;
  /** The number of runner entries. */
  runnerCount: number;
  /** The number of Inventory entries. */
  inventoryCount: number;
  /** Inventory IDs no runner entry maps to, sorted. */
  missing: string[];
  /** Runner entries whose Inventory ID is not in the Inventory (or that have none), sorted. */
  extra: string[];
}

export interface CrossCheckResult {
  suites: SuiteComparison[];
  /** Suites that could not be compared, with the reason. */
  errors: { suite: Suite; message: string }[];
  missing: number;
  extra: number;
}

/** The shell form image mode runs: `cd` into the suite and exec its runner. */
export const IMAGE_LIST_SCRIPT = 'cd "$0" && exec php -d memory_limit=-1 "vendor/bin/$1" --list-tests --colors=never';

const PHPUNIT_HEADER = /^PHPUnit \S+ by Sebastian Bergmann and contributors\.$/;
const AVAILABLE_HEADER = /^ *(?:INFO {2})?Available tests?:$/;
const ENTRY = /^([A-Za-z_\x80-￿\\][A-Za-z0-9_\x80-￿\\]*)::([A-Za-z_\x80-￿][A-Za-z0-9_\x80-￿]*)(?:#(-?[0-9]+)|"(.*)")?$/;

export function runnerFor(suite: Suite): Runner {
  return suite === "framework" ? "phpunit" : "pest";
}

/**
 * Parses a `--list-tests` text listing to its PHPUnit IDs, in listing order. Throws on any line that is not a
 * header, blank or ` - <entry>`, on an entry of another shape, and on a repeated ID.
 */
export function parseRunnerListing(text: string, runner: Runner): string[] {
  const entries: string[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "" || PHPUNIT_HEADER.test(line) || AVAILABLE_HEADER.test(line)) {
      continue;
    }
    if (!line.startsWith(" - ")) {
      throw new Error(`unexpected ${runner} output: ${line}`);
    }
    entries.push(line);
  }
  // Pest's INFO renderer ends the last entry with a `.`; a method name cannot contain one, and a dataset ends with `"`.
  if (runner === "pest" && entries.length > 0 && entries.at(-1)!.endsWith(".")) {
    entries[entries.length - 1] = entries.at(-1)!.slice(0, -1);
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const line of entries) {
    const match = ENTRY.exec(line.slice(3));
    if (match === null) {
      throw new Error(`unparseable ${runner} entry: ${line}`);
    }
    const [, cls, method, index, name] = match;
    const id = `${cls!}::${method!}${index !== undefined ? `#${index}` : name !== undefined ? `#${name}` : ""}`;
    if (seen.has(id)) {
      throw new Error(`duplicate ${runner} entry: ${id}`);
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Compares a suite's runner IDs with its Inventory IDs. `map` takes a runner ID to its Inventory ID (Pest);
 * without it the runner ID is the Inventory ID (PHPUnit). An unmapped runner ID is extra under its runner ID.
 */
export function compareListing(suite: Suite, runnerIds: readonly string[], inventoryIds: readonly string[], map?: ReadonlyMap<string, string>): SuiteComparison {
  const inventory = new Set(inventoryIds);
  const covered = new Set<string>();
  const extra: string[] = [];
  for (const runnerId of runnerIds) {
    const id = map === undefined ? runnerId : map.get(runnerId);
    if (id === undefined) {
      extra.push(runnerId);
    } else if (!inventory.has(id) || covered.has(id)) {
      extra.push(id);
    } else {
      covered.add(id);
    }
  }
  const missing = [...inventory].filter((id) => !covered.has(id));
  return {
    suite,
    runner: runnerFor(suite),
    runnerCount: runnerIds.length,
    inventoryCount: inventory.size,
    missing: missing.sort(compareUnits),
    extra: extra.sort(compareUnits),
  };
}

/** Runs the suite's own `--list-tests` and returns its stdout. */
function listTests(root: string, suite: Suite, options: CrossCheckOptions): string {
  const runner = runnerFor(suite);
  if (options.local !== undefined) {
    const proc = Bun.spawnSync([options.php ?? "php", "-d", "memory_limit=-1", `vendor/bin/${runner}`, "--list-tests", "--colors=never"], {
      cwd: resolve(options.local),
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    if (proc.exitCode !== 0) {
      throw new Error(`${runner} --list-tests failed (exit ${proc.exitCode ?? "signal"}): ${proc.stderr.toString().trim()}`);
    }
    return proc.stdout.toString();
  }
  const run = options.runner ?? runInImage;
  try {
    return run(options.image ?? oracleImage(root), [], ["sh", "-c", IMAGE_LIST_SCRIPT, `${IMAGE_UPSTREAM_DIR}/${suite}`, runner]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = / failed \(exit ([^)]+)\): ([\s\S]*)$/.exec(message);
    throw new Error(failed === null ? `${runner} --list-tests failed: ${message}` : `${runner} --list-tests failed (exit ${failed[1]!}): ${failed[2]!}`);
  }
}

function checkSuite(root: string, suite: Suite, snapshot: string, options: CrossCheckOptions): SuiteComparison {
  if (options.local !== undefined) {
    const local = resolve(options.local);
    if (!existsSync(local)) {
      throw new Error(`--local ${local} does not exist`);
    }
    checkLocalCopy(snapshot, local, suite);
  }
  const runnerIds = parseRunnerListing(listTests(root, suite, options), runnerFor(suite));
  const inventoryIds = readSuiteInventory(root, suite).map((entry) => entry.id);
  if (suite === "framework") {
    return compareListing(suite, runnerIds, inventoryIds);
  }
  const raws = listSuite(root, suite, snapshot, resolve(root, LISTER), options) as PestRawTest[];
  const map = new Map<string, string>();
  for (const raw of raws) {
    if (map.has(raw.id)) {
      throw new Error(`duplicate lister id: ${raw.id}`);
    }
    map.set(raw.id, pestTestId(suite, raw));
  }
  return compareListing(suite, runnerIds, inventoryIds, map);
}

/**
 * Cross-checks every selected suite (default `all` in image mode, `framework` with `local`); a suite that fails
 * is recorded and the rest still run.
 */
export function crossCheck(root: string, options: CrossCheckOptions = {}): CrossCheckResult {
  const selected = options.suite ?? (options.local === undefined ? "all" : "framework");
  if (selected !== "all" && !SUITES.includes(selected)) {
    throw new Error(`unknown suite ${JSON.stringify(selected)}; expected one of ${[...SUITES, "all"].join(", ")}`);
  }
  const suites: readonly Suite[] = selected === "all" ? SUITES : [selected];
  if (options.local !== undefined && suites.length > 1) {
    throw new Error("--local takes one suite's install, not --suite all");
  }
  const result: CrossCheckResult = { suites: [], errors: [], missing: 0, extra: 0 };
  for (const suite of suites) {
    try {
      const snapshot = upstreamPath(root, suite, ".");
      if (!existsSync(join(snapshot, "tests"))) {
        throw new Error(`${UPSTREAM_DIR}/${suite}/tests is missing; run bun run upstream:sync`);
      }
      const comparison = checkSuite(root, suite, snapshot, options);
      result.suites.push(comparison);
      result.missing += comparison.missing.length;
      result.extra += comparison.extra.length;
    } catch (error) {
      result.errors.push({ suite, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// CLI

const USAGE = ["Usage:", "  bun tools/inventory/cross-check.ts [--suite <framework|ai|mcp|boost|all>] [--root <dir>] [--image <ref> | --local <dir> [--php <bin>]]"].join("\n");

export function main(argv: readonly string[]): number {
  let parsed: ReturnType<typeof parseOptions>;
  try {
    parsed = parseOptions(argv, false);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    throw error;
  }
  const { root, ...options } = parsed;
  try {
    const result = crossCheck(root, options);
    const out: string[] = [];
    const err: string[] = [];
    for (const comparison of result.suites) {
      if (comparison.missing.length === 0 && comparison.extra.length === 0) {
        out.push(`${comparison.suite}: ${comparison.runnerCount} runner tests match ${comparison.inventoryCount} Inventory entries`);
      } else {
        err.push(`${comparison.suite}: ${comparison.missing.length} missing, ${comparison.extra.length} extra (${comparison.runnerCount} runner tests, ${comparison.inventoryCount} Inventory entries)`);
        err.push(...comparison.missing.map((id) => `missing from ${comparison.runner}'s listing: ${id}`));
        err.push(...comparison.extra.map((id) => `not in the Inventory: ${id}`));
      }
    }
    err.push(...result.errors.map(({ suite, message }) => `${suite}: ${message}`));
    process.stdout.write(out.map((line) => `${line}\n`).join(""));
    if (result.errors.length > 0 || result.missing > 0 || result.extra > 0) {
      err.push(`Inventory cross-check failed: ${result.missing} missing, ${result.extra} extra`);
      process.stderr.write(err.map((line) => `${line}\n`).join(""));
      return 1;
    }
    return 0;
  } catch (error) {
    process.stderr.write(`Inventory cross-check failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
