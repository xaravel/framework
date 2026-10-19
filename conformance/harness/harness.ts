// The conformance harness runner (Story 5.3; FR-3, FR-9, FR-113, AD-15).
//
//   bun --no-env-file conformance/harness/harness.ts [--root <dir>]
//       (`bun run harness`) runs every Ported Test once per Variant and
//       compares the results with the Expectations File
//
// Preconditions, checked before anything runs (each failure exits 1):
//   - `<root>/bunfig.toml` exists, and no other `bunfig.toml` exists under the
//     root (the scan skips `node_modules`, `.git`, `.cache` and
//     `conformance/upstream`); the message names each one (AD-15);
//   - `conformance/variants`, the Expectations shards and the Inventory read
//     cleanly (`readVariants`, `readExpectations`, `readWorkingInventory`),
//     and every line's Variant is in the vocabulary.
//
// The Variants run are those that appear in the Expectations lines, in
// `conformance/variants` order. Each Variant whose backend is reachable
// (./backends.ts) gets one
//
//   <bun> --no-env-file test --preload <this directory>/preload.ts \
//     --reporter=junit --reporter-outfile=<tmp> <every packages/*/tests/ported/**/*.test.ts>
//
// with cwd the root (so the root `bunfig.toml` applies) and the parent's env
// plus `XARAVEL_VARIANT=<variant>` and `XARAVEL_HARNESS_OUT=<tmp jsonl>`, to
// which the preload appends the reports and late assertions. With no Ported
// Test file nothing is spawned and every result is `missing`. A run that
// leaves no junit file fails the harness (exit 1), quoting its stderr. Temp
// files live in the OS temp directory; nothing is written under the root.
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
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { UsageError, readVariants } from "../../tools/expectations/expectations";
import { ALPHA_VARIANTS, compareUnits } from "../../tools/inventory/inventory";
import { readExpectations, readWorkingInventory } from "../../tools/pin-bump/pin-bump";
import { backendFor, probe, type ProbeResult } from "./backends";
import { compare, type Difference, type HarnessLine, type HarnessReport, type Result, type VariantRun } from "./compare";
import { parseJunit } from "./junit";

/** The preload every run gets: this directory's, whatever the root. */
export const PRELOAD = join(import.meta.dir, "preload.ts");
export const PORTED_GLOB = "packages/*/tests/ported/**/*.test.ts";
const SKIPPED_DIRS: ReadonlySet<string> = new Set(["node_modules", ".git", ".cache"]);
const SKIPPED_PATHS: ReadonlySet<string> = new Set(["conformance/upstream"]);

type Env = Readonly<Record<string, string | undefined>>;

export interface HarnessOptions {
  /** The environment the probes read and the runs inherit; default `process.env`. */
  readonly env?: Env;
  /** Extra `bun test` arguments, before the files (internal: tests use `--concurrent`). */
  readonly bunArgs?: readonly string[];
}

export interface HarnessResult {
  readonly code: 0 | 1;
  /** Report lines (stdout). */
  readonly out: string[];
  /** Diagnostics (stderr). */
  readonly err: string[];
  readonly results: Result[];
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
async function runVariant(root: string, variant: string, files: readonly string[], env: Env, bunArgs: readonly string[], err: string[]): Promise<VariantRun & { error: string | null }> {
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
    childEnv["XARAVEL_VARIANT"] = variant;
    childEnv["XARAVEL_HARNESS_OUT"] = outPath;
    const args = [
      process.execPath,
      "--no-env-file",
      "test",
      "--preload",
      PRELOAD,
      "--reporter=junit",
      `--reporter-outfile=${junitPath}`,
      ...bunArgs,
      ...files.map((file) => join(root, file)),
    ];
    const child = Bun.spawn(args, { cwd: root, env: childEnv, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const [, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
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

/** Runs the harness over `root` (see the header). */
export async function runHarness(root: string, options: HarnessOptions = {}): Promise<HarnessResult> {
  const env = options.env ?? process.env;
  const out: string[] = [];
  const err: string[] = [];
  const results: Result[] = [];
  try {
    if (!existsSync(join(root, "bunfig.toml"))) {
      throw new PreconditionError("the root bunfig.toml does not exist (AD-15)");
    }
    const stray = strayBunfigs(root);
    if (stray.length > 0) {
      throw new PreconditionError(`package-level bunfig.toml found; only the root bunfig.toml may exist (AD-15): ${stray.join(", ")}`);
    }
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
    const vocabularySet = new Set(vocabulary.variants);
    for (const shard of shards) {
      shard.lines.forEach((raw, index) => {
        const variant = raw["variant"];
        const status = raw["status"];
        if (typeof variant !== "string" || !vocabularySet.has(variant)) {
          throw new PreconditionError(`${shard.path}:${index + 1}: Variant ${JSON.stringify(variant)} is not in conformance/variants`);
        }
        const line: HarnessLine = { id: raw["id"] as string, variant, status: typeof status === "string" ? status : String(status), reason: stringOrNull(raw["reason"]), adapted: stringOrNull(raw["adapted"]) };
        knownIds.add(line.id);
        const list = byVariant.get(variant) ?? [];
        list.push(line);
        byVariant.set(variant, list);
      });
    }
    const variants = vocabulary.variants.filter((variant) => byVariant.has(variant));
    const files = portedTestFiles(root);
    const ci = env["CI"] === "true";
    const waived = waiverFor(root);
    const differences: Difference[] = [];
    const errors: string[] = [];
    const reportLines: string[] = [];
    let run = 0;
    let notRun = 0;
    let checked = 0;
    let ciDifferences = 0;
    const probes = new Map<string, Promise<ProbeResult>>();
    for (const variant of variants) {
      const lines = byVariant.get(variant)!;
      const backend = backendFor(variant);
      const pending = probes.get(backend) ?? probe(backend, env);
      probes.set(backend, pending);
      const status = await pending;
      if (!status.reachable) {
        notRun++;
        const counts = ci && ALPHA_VARIANTS.includes(variant);
        if (counts) {
          ciDifferences++;
        }
        out.push(`NOT-RUN [${variant}] ${lines.length} line(s): ${status.why}${counts ? "; CI runs every alpha variant (FR-9)" : ""}`);
        continue;
      }
      run++;
      checked += lines.length;
      const variantRun = files.length === 0 ? { junit: new Map(), reports: new Map(), late: new Set<string>(), duplicates: new Set<string>(), error: null } : await runVariant(root, variant, files, env, options.bunArgs ?? [], err);
      const compared = compare({ variant, lines, knownIds, run: variantRun, inventory, waived });
      results.push(...compared.results);
      if (variantRun.error !== null) {
        errors.push(variantRun.error);
        reportLines.push(variantRun.error);
      }
      const sorted = compared.differences.sort((a, b) => compareUnits(a.id, b.id));
      differences.push(...sorted);
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
    out.push(`SUMMARY variants=${variants.length} run=${run} not-run=${notRun} checked=${checked} differ=${differ}`);
    return { code: differ === 0 ? 0 : 1, out, err, results };
  } catch (error) {
    if (error instanceof PreconditionError) {
      err.push(`harness: ${error.message}`);
      return { code: 1, out, err, results };
    }
    err.push(`harness failed: ${message(error)}`);
    return { code: 1, out, err, results };
  }
}

const USAGE = "Usage: bun --no-env-file conformance/harness/harness.ts [--root <dir>]";

function parseArgs(argv: readonly string[]): string {
  let root = resolve(import.meta.dir, "..", "..");
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg !== "--root") {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    const value = argv[++i];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    root = resolve(value);
  }
  return root;
}

export async function main(argv: readonly string[]): Promise<number> {
  let root: string;
  try {
    root = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    throw error;
  }
  const result = await runHarness(root);
  if (result.err.length > 0) {
    process.stderr.write(result.err.map((line) => `${line}\n`).join(""));
  }
  process.stdout.write(result.out.map((line) => `${line}\n`).join(""));
  return result.code;
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
