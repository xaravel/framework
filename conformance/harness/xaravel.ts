// The harness's Xaravel run (Story 5.9; FR-115, AD-15). Pure apart from the
// file scan: the run itself is spawned by ./harness.ts.
//
// The Xaravel Tests are every `xaravelTest` in the files `XARAVEL_GLOBS` match.
// `bun run harness` runs them once, after every Variant run, with the same
// preload, junit report and env as a Variant run but `XARAVEL_VARIANT=none`,
// and reads the preload's `type: "xaravel"` reports.
//
// The outcome of each Xaravel Test, from its report (by id) and the junit
// testcase named by the report's label `<id>: <consequence>`:
//
//   fail     the testcase failed, or more than one report carries the id
//   late     it recorded an assertion after it ended (AD-15)
//   skip     its report has a `skipped` key (`markTestSkipped`) or the testcase
//            was skipped
//   pass     otherwise
//   missing  a selected literal id (an `--id` value with no `*` or `?`) has no
//            report
//
// A failed junit testcase with no report whose name is `<XT id>: <text>` is
// that id's `fail`: bun ends a test that times out before its body settles, so
// its report never arrives.
//
// With `--id` globs only the ids a glob matches whole are selected. Each
// selected test that failed, was missing or was late prints
//   <id> [xaravel] FAIL|MISSING|LATE
// and each junit testcase that no report labels (a plain `test()` in an Xaravel
// Test file) prints
//   - [xaravel] UNDECLARED <testcase name>
// unless a `-t` name pattern excluded it. Each line is one difference; a
// skipped Xaravel Test is not. The summary line, printed before SUMMARY, is
//   XARAVEL tests=<n> passed=<p> failed=<f> skipped=<s>
// where `failed` counts FAIL, LATE and MISSING, and `n` is their sum.
import { compareUnits } from "../../tools/inventory/inventory";
import type { JunitCase } from "./junit";
import { globSource, globToRegExp } from "./select";

/** The Xaravel Test files, relative to the root. */
export const XARAVEL_GLOBS = ["conformance/tests/xaravel/**/*.test.ts", "packages/*/tests/xaravel/**/*.test.ts"] as const;

/** The `xaravelTest` id form (packages/assert's `xaravelTest`). */
export const XT_ID = /^XT-[a-z0-9]+(-[a-z0-9]+)*-[1-9][0-9]*$/;

/** What the harness CLI's `--xaravel` (or a full run) asks for. */
export interface XaravelOptions {
  /** Run only the Xaravel Tests: no Variant run (`--xaravel`). */
  readonly only?: boolean;
  /** `--id` globs over the XT ids; empty or absent selects every Xaravel Test. */
  readonly ids?: readonly string[];
}

/** One Xaravel Test report, as the preload records it. */
export interface XaravelReport {
  readonly type: "xaravel";
  readonly id: string;
  readonly consequence: string;
  readonly assertions: Readonly<Record<string, number>>;
  readonly skipped?: unknown;
}

export type XaravelOutcome = "pass" | "fail" | "late" | "skip" | "missing";

export interface XaravelTestResult {
  readonly id: string;
  /** The declared consequence, or null for a missing test. */
  readonly consequence: string | null;
  readonly outcome: XaravelOutcome;
}

export interface XaravelResult {
  /** Every selected Xaravel Test, sorted by id. */
  readonly results: XaravelTestResult[];
  /** The report lines (see the header), in order: per-test lines by id, the UNDECLARED lines, then the ERROR line if any. */
  readonly lines: string[];
  /** The XARAVEL summary line. */
  readonly summary: string;
  /** The number of differences (every line in `lines`). */
  readonly differ: number;
}

/** The repo-relative Xaravel Test files under `root`, sorted. */
export function xaravelTestFiles(root: string): string[] {
  const files = new Set<string>();
  for (const glob of XARAVEL_GLOBS) {
    for (const file of new Bun.Glob(glob).scanSync({ cwd: root, onlyFiles: true, followSymlinks: false })) {
      files.add(file.split("\\").join("/"));
    }
  }
  return [...files].sort(compareUnits);
}

/** The `bun test -t` pattern for `globs`: a testcase name `<id>: …` whose id one of them matches; null for no globs. */
export function xaravelNamePattern(globs: readonly string[]): string | null {
  if (globs.length === 0) {
    return null;
  }
  // Each alternative's backreferences point to its own groups: number them on from the previous alternative's.
  let group = 1;
  const alternatives = globs.map((glob) => {
    const { source, groups } = globSource(glob, group);
    group += groups;
    return source;
  });
  return `^(?:${alternatives.join("|")}): `;
}

export interface JudgeInput {
  readonly junit: ReadonlyMap<string, JunitCase>;
  readonly reports: readonly XaravelReport[];
  readonly late: ReadonlySet<string>;
  /** The `--id` globs, or empty for all. */
  readonly ids: readonly string[];
  /** The `-t` pattern the run was given, or null. */
  readonly pattern: string | null;
  /** The ERROR line of the run, or null. */
  readonly error: string | null;
}

/** Judges one Xaravel run (see the header). */
export function judgeXaravel(input: JudgeInput): XaravelResult {
  const globs = input.ids.map(globToRegExp);
  const selected = (id: string): boolean => globs.length === 0 || globs.some((glob) => glob.test(id));
  const byId = new Map<string, XaravelReport[]>();
  const labels = new Set<string>();
  for (const report of input.reports) {
    labels.add(`${report.id}: ${report.consequence}`);
    const list = byId.get(report.id) ?? [];
    list.push(report);
    byId.set(report.id, list);
  }
  const results: XaravelTestResult[] = [];
  for (const [id, reports] of byId) {
    if (!selected(id)) {
      continue;
    }
    const report = reports[0]!;
    const junit = input.junit.get(`${id}: ${report.consequence}`);
    let outcome: XaravelOutcome;
    if (reports.length > 1 || junit?.outcome === "failed") {
      outcome = "fail";
    } else if (input.late.has(id)) {
      outcome = "late";
    } else if (Object.hasOwn(report, "skipped") || junit?.outcome === "skipped") {
      outcome = "skip";
    } else {
      outcome = "pass";
    }
    results.push({ id, consequence: report.consequence, outcome });
  }
  const unreported = new Set<string>();
  for (const [name, junit] of input.junit) {
    const match = /^(XT-[a-z0-9-]+): ([\s\S]*)$/.exec(name);
    if (labels.has(name) || junit.outcome !== "failed" || match === null || !XT_ID.test(match[1]!) || byId.has(match[1]!) || unreported.has(match[1]!)) {
      continue;
    }
    unreported.add(match[1]!);
    labels.add(name);
    if (selected(match[1]!)) {
      results.push({ id: match[1]!, consequence: match[2]!, outcome: "fail" });
    }
  }
  for (const glob of input.ids) {
    if (!/[*?]/.test(glob) && !byId.has(glob) && !unreported.has(glob)) {
      results.push({ id: glob, consequence: null, outcome: "missing" });
    }
  }
  results.sort((a, b) => compareUnits(a.id, b.id));
  const lines: string[] = [];
  for (const result of results) {
    if (result.outcome === "fail" || result.outcome === "late" || result.outcome === "missing") {
      lines.push(`${result.id} [xaravel] ${result.outcome.toUpperCase()}`);
    }
  }
  const pattern = input.pattern === null ? null : new RegExp(input.pattern);
  const undeclared = [...input.junit.keys()].filter((name) => !labels.has(name) && (pattern === null || pattern.test(name))).sort(compareUnits);
  lines.push(...undeclared.map((name) => `- [xaravel] UNDECLARED ${name}`));
  if (input.error !== null) {
    lines.push(input.error);
  }
  const count = (outcome: XaravelOutcome): number => results.filter((result) => result.outcome === outcome).length;
  const passed = count("pass");
  const skipped = count("skip");
  const failed = count("fail") + count("late") + count("missing");
  return { results, lines, summary: `XARAVEL tests=${passed + failed + skipped} passed=${passed} failed=${failed} skipped=${skipped}`, differ: lines.length };
}
