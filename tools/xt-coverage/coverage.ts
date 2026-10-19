// The Xaravel Test coverage check (Story 5.9; FR-115, AD-15).
//
//   bun tools/xt-coverage/coverage.ts <component> [--root <dir>]
//       (`bun run xt:coverage <component>`) runs the Xaravel Tests under the
//       harness (`runHarness` with `xaravel: { only: true }`) and lists every
//       consequence of `conformance/xaravel-consequences/<component>.jsonl`
//       that no passing Xaravel Test declares
//
// A Xaravel Test declares consequence `X` when its consequence string holds
// `X` as a whole token (tools/xt-coverage/consequences.ts's
// `declaredConsequences`; a bare `FR-3` declares nothing). A consequence is
// covered when at least one Xaravel Test that passed in the run declares it,
// in any Component's directory: the Conformance System spans `conformance/`,
// `packages/assert` and `packages/mockery`. A failing, late or skipped test
// covers nothing.
//
// Output (stdout): one `UNCOVERED <id>: <text>` line per uncovered
// consequence, in file order, then
//   XT-COVERAGE <component> consequences=<n> covered=<c> uncovered=<u>
// The harness's own lines go to stderr, and so does one
//   xt:coverage: warning: <xt id> declares <id>, which is not in <file>
// per citation of an ID the file does not hold (the exit code is unchanged).
// An unknown Component prints
//   xt:coverage: conformance/xaravel-consequences/<c>.jsonl does not exist
//
// Exit codes: 0 when nothing is uncovered, 1 when something is (or the file
// is missing, or the harness could not run), 2 on a usage error.
import { resolve } from "node:path";
import { runHarness, type HarnessOptions, type HarnessResult } from "../../conformance/harness/harness";
import type { XaravelTestResult } from "../../conformance/harness/xaravel";
import { consequenceFile, declaredConsequences, readConsequences, type Consequence } from "./consequences";

export interface CoverageResult {
  /** The consequence IDs a passing test declares, in file order. */
  readonly covered: string[];
  /** The consequences no passing test declares, in file order. */
  readonly uncovered: Consequence[];
  /** Each citation of an ID the file does not hold, by any selected test: the test's id and the cited id. */
  readonly unknown: { readonly test: string; readonly id: string }[];
}

/** Which of `consequences` the passing results in `results` declare (see the header). Pure. */
export function coverage(consequences: readonly Consequence[], results: readonly Pick<XaravelTestResult, "id" | "consequence" | "outcome">[]): CoverageResult {
  const known = new Set(consequences.map((consequence) => consequence.id));
  const declared = new Set<string>();
  const unknown: { test: string; id: string }[] = [];
  for (const result of results) {
    if (result.consequence === null) {
      continue;
    }
    for (const id of declaredConsequences(result.consequence)) {
      if (!known.has(id)) {
        unknown.push({ test: result.id, id });
      } else if (result.outcome === "pass") {
        declared.add(id);
      }
    }
  }
  const covered: string[] = [];
  const uncovered: Consequence[] = [];
  for (const consequence of consequences) {
    if (declared.has(consequence.id)) {
      covered.push(consequence.id);
    } else {
      uncovered.push(consequence);
    }
  }
  return { covered, uncovered, unknown };
}

export interface CoverageCliResult {
  readonly code: 0 | 1 | 2;
  readonly out: string[];
  readonly err: string[];
}

type Harness = (root: string, options: HarnessOptions) => Promise<HarnessResult>;

const USAGE = "Usage: bun tools/xt-coverage/coverage.ts <component> [--root <dir>]";

/** The CLI, with the harness injectable (tests). */
export async function runCoverage(argv: readonly string[], harness: Harness = runHarness): Promise<CoverageCliResult> {
  let root = resolve(import.meta.dir, "..", "..");
  let component: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--root") {
      const value = argv[++i];
      if (value === undefined || value === "" || value.startsWith("--")) {
        return { code: 2, out: [], err: ["--root needs a value", USAGE] };
      }
      root = resolve(value);
    } else if (arg.startsWith("--") || component !== null) {
      return { code: 2, out: [], err: [`Unknown argument: ${arg}`, USAGE] };
    } else {
      component = arg;
    }
  }
  if (component === null || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(component)) {
    return { code: 2, out: [], err: [component === null ? "a Component is required" : `not a Component name: ${JSON.stringify(component)}`, USAGE] };
  }
  let consequences: Consequence[];
  try {
    consequences = readConsequences(root, component);
  } catch (error) {
    return { code: 1, out: [], err: [`xt:coverage: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const run = await harness(root, { xaravel: { only: true } });
  const err = [...run.err, ...run.out.map((line) => `harness: ${line}`)];
  if (run.xaravel === null) {
    return { code: 1, out: [], err: [...err, "xt:coverage: the harness ran no Xaravel Tests"] };
  }
  const result = coverage(consequences, run.xaravel.results);
  err.push(...result.unknown.map((entry) => `xt:coverage: warning: ${entry.test} declares ${entry.id}, which is not in ${consequenceFile(component!)}`));
  const out = [
    ...result.uncovered.map((consequence) => `UNCOVERED ${consequence.id}: ${consequence.text}`),
    `XT-COVERAGE ${component} consequences=${consequences.length} covered=${result.covered.length} uncovered=${result.uncovered.length}`,
  ];
  return { code: result.uncovered.length === 0 ? 0 : 1, out, err };
}

if (import.meta.main) {
  const result = await runCoverage(process.argv.slice(2));
  if (result.err.length > 0) {
    process.stderr.write(result.err.map((line) => `${line}\n`).join(""));
  }
  process.stdout.write(result.out.map((line) => `${line}\n`).join(""));
  process.exit(result.code);
}
