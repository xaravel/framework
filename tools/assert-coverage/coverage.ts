// The grader's assertion coverage report (Story 4.4, FR-116, ESC-4.4-1).
//
//   bun tools/assert-coverage/coverage.ts [--root <dir>]
//       (`bun run assert:coverage`) reads <root>/conformance/scans/phpunit-assertions.jsonl
//       and lists every scan name that has no implementation, grouped by owner,
//       then a summary line
//
// Each scan name has an owner, taken from the Upstream class that declares it
// (ESC-4.4-1):
//
//   assert     PHPUnit\Framework\Assert and PHPUnit\Framework\TestCase: every
//              name the table below does not list. Probed through
//              @xaravel/assert's `Assert` and `TestCase`
//              (<root>/packages/assert/src/index.ts, imported), below.
//   testing    Illuminate\Foundation\Testing\Concerns\* (Epic 57). The
//              component map gives `Illuminate\Foundation\` to `foundation`,
//              so the AD-3 file is
//              packages/foundation/src/Testing/Concerns/<Trait>.ts (ESC-4.4-2
//              item 5).
//   testbench  Orchestra\Testbench\Concerns\InteractsWithPublishedFiles (Epic
//              59): packages/testbench/src/Concerns/InteractsWithPublishedFiles.ts.
//
// An `assert` name is implemented when calling it does what it is for (Epic
// 4 retro item 5, finding R5), not merely when a function of that name exists:
//
//   - each present static `Assert[name]` and each present `TestCase.prototype`
//     method, called with no arguments inside its own counting context
//     (`runCounted`, <root>/packages/assert/src/declarations/AssertionCounter.ts,
//     imported by path), must record at least one assertion;
//   - the six PHPUnit names that record nothing (OUTCOME_PROBES) must change
//     a declared test's outcome instead. One generated `bun test` fixture, in
//     a fresh temp directory, declares a `portedTest` with
//     `case: TestCase` per name and form; each passes only if the method
//     works (an empty stub fails it by zero assertions or by the body's
//     throw). Pass or fail is read from the fixture's junit report, and each
//     test's report from the `Symbol.for('xaravel.harness.report')` hook:
//     `markTestSkipped` must end with `skipped: "probe"`, the others with no
//     `skipped` key.
//
// A name with neither form, or whose probe throws or fails, is missing.
//
// A `testing` or `testbench` name is implemented when its owner's file
// declares a member of that name. While the file is absent the name is
// listed as `pending <owner>: <name> (<FQCN>)` and does not fail the report.
//
// Lines, on stdout, one per unimplemented name, grouped by owner (assert,
// testing, testbench), names sorted:
//
//   missing assert: <name>
//   missing <owner>: <name> (<FQCN>, <file>)
//   pending <owner>: <name> (<FQCN>)
//
// Exit codes: 0 when nothing is missing (pending names are allowed), 1 when an
// `assert` name is missing or an owner's file exists without its name (or the
// scan or the grader cannot be read), 2 on a usage error.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ReportLine, readJsonl, runReport } from "../coverage-report/report";

const SCAN = "conformance/scans/phpunit-assertions.jsonl";
const GRADER = "packages/assert/src/index.ts";
const COUNTER = "packages/assert/src/declarations/AssertionCounter.ts";

type Owner = "testing" | "testbench";

interface Declared {
  readonly owner: Owner;
  readonly fqcn: string;
  readonly file: string;
}

const TESTING = "packages/foundation/src/Testing/Concerns";
const TESTBENCH = "packages/testbench/src/Concerns";

function testing(trait: string): Declared {
  return { owner: "testing", fqcn: `Illuminate\\Foundation\\Testing\\Concerns\\${trait}`, file: `${TESTING}/${trait}.ts` };
}

const PUBLISHED_FILES: Declared = { owner: "testbench", fqcn: "Orchestra\\Testbench\\Concerns\\InteractsWithPublishedFiles", file: `${TESTBENCH}/InteractsWithPublishedFiles.ts` };

/** The 15 scan names PHPUnit does not declare, with the Upstream trait that does (ESC-4.4-1). */
export const NOT_PHPUNIT: ReadonlyMap<string, Declared> = new Map<string, Declared>([
  ["assertDatabaseCount", testing("InteractsWithDatabase")],
  ["assertDatabaseHas", testing("InteractsWithDatabase")],
  ["assertDatabaseMissing", testing("InteractsWithDatabase")],
  ["assertModelMissing", testing("InteractsWithDatabase")],
  ["assertAuthenticated", testing("InteractsWithAuthentication")],
  ["assertGuest", testing("InteractsWithAuthentication")],
  ["assertThrows", testing("InteractsWithExceptionHandling")],
  ["assertFileContains", PUBLISHED_FILES],
  ["assertFileDoesNotContains", PUBLISHED_FILES],
  ["assertFileNotContains", PUBLISHED_FILES],
  ["assertFilenameDoesNotExists", PUBLISHED_FILES],
  ["assertFilenameExists", PUBLISHED_FILES],
  ["assertFilenameNotExists", PUBLISHED_FILES],
  ["assertMigrationFileContains", PUBLISHED_FILES],
  ["assertMigrationFileExists", PUBLISHED_FILES],
]);

/** The scan's names, in file order. */
export function readScanNames(root: string): string[] {
  return readJsonl(root, SCAN, (parsed, lineNumber) => {
    if (typeof parsed["name"] !== "string" || parsed["name"] === "") {
      throw new Error(`${SCAN}:${lineNumber}: no name`);
    }
    return parsed["name"];
  });
}

/** Whether the TS source declares a class member (method, accessor or property) named `name`. */
export function declaresMember(source: string, name: string): boolean {
  const modifiers = "(?:(?:public|protected|private|static|readonly|override|async|abstract|declare|get|set)\\s+)*";
  return new RegExp(`^\\s*${modifiers}\\*?${name}\\s*[?!]?\\s*[(<:=;]`, "m").test(source);
}

export interface CoverageLine extends ReportLine {
  readonly owner: "assert" | Owner;
  readonly name: string;
}

/**
 * The PHPUnit names that record no assertion, with the body of their probe test (`$` is the test case, or `Assert`
 * for a static). Each body passes with the real method and fails with an empty one.
 */
export const OUTCOME_PROBES: ReadonlyMap<string, string> = new Map([
  ["expectException", '$.expectException(RangeError); throw new RangeError("boom");'],
  ["expectExceptionMessage", '$.expectExceptionMessage("boom"); throw new Error("boom");'],
  ["expectExceptionMessageMatches", '$.expectExceptionMessageMatches(/bo+m/); throw new Error("boom");'],
  ["expectExceptionObject", '$.expectExceptionObject(new Error("boom")); throw new Error("boom");'],
  ["expectOutputString", '$.expectOutputString("probe"); process.stdout.write("probe");'],
  ["markTestSkipped", '$.markTestSkipped("probe");'],
]);

/** How long the outcome probe fixture's `bun test` child may run, in milliseconds. */
export const FIXTURE_TIMEOUT = 50_000;

/** The skip message an outcome probe's report must carry; a name not listed must carry none (null). */
const SKIP_MESSAGE: ReadonlyMap<string, string> = new Map([["markTestSkipped", "probe"]]);

type Form = "static" | "instance";

interface Grader {
  readonly assert: Record<string, unknown>;
  readonly testCase: new () => Record<string, unknown>;
  readonly runCounted: (fn: () => unknown) => Promise<{ readonly total: number }>;
}

async function loadGrader(root: string): Promise<Grader> {
  const grader = (await import(join(root, GRADER))) as { Assert?: unknown; TestCase?: unknown };
  const counter = (await import(join(root, COUNTER))) as { runCounted?: unknown };
  const testCase = grader.TestCase as { prototype?: unknown } | undefined;
  if (typeof grader.Assert !== "function" || typeof testCase !== "function" || typeof testCase.prototype !== "object" || testCase.prototype === null) {
    throw new Error(`${GRADER} exports no Assert class or TestCase class`);
  }
  if (typeof counter.runCounted !== "function") {
    throw new Error(`${COUNTER} exports no runCounted`);
  }
  return { assert: grader.Assert as unknown as Record<string, unknown>, testCase: testCase as unknown as new () => Record<string, unknown>, runCounted: counter.runCounted as Grader["runCounted"] };
}

/** The forms of `name` the grader has: a static on `Assert`, a method on `TestCase.prototype`. */
function formsOf(grader: Grader, name: string): Form[] {
  const forms: Form[] = [];
  if (typeof grader.assert[name] === "function") {
    forms.push("static");
  }
  if (typeof (grader.testCase.prototype as Record<string, unknown>)[name] === "function") {
    forms.push("instance");
  }
  return forms;
}

/** Whether `name`, called with no arguments in each form, records at least one assertion each time. */
async function recordsAssertion(grader: Grader, name: string, forms: readonly Form[]): Promise<boolean> {
  for (const form of forms) {
    const target = form === "static" ? grader.assert : new grader.testCase();
    const run = await grader.runCounted(() => (target[name] as () => unknown).call(target));
    if (run.total < 1) {
      return false;
    }
  }
  return true;
}

/** The outcome names (with their forms) whose fixture tests all passed with the expected report. */
function probeOutcomes(root: string, probes: ReadonlyMap<string, readonly Form[]>): Set<string> {
  const working = new Set<string>();
  if (probes.size === 0) {
    return working;
  }
  const dir = mkdtempSync(join(tmpdir(), "assert-coverage-"));
  try {
    const reports = join(dir, "reports.jsonl");
    const junit = join(dir, "junit.xml");
    const label = (name: string, form: Form): string => `assert-coverage::${name}::${form}`;
    const tests = [...probes].flatMap(([name, forms]) =>
      forms.map(
        (form) =>
          `portedTest(${JSON.stringify(label(name, form))}, { case: TestCase }, function (this: any) {\n  const $: any = ${form === "static" ? "Assert" : "this"};\n  ${OUTCOME_PROBES.get(name)}\n});\n`,
      ),
    );
    writeFileSync(join(dir, "bunfig.toml"), "env = false\n");
    writeFileSync(
      join(dir, "probe.test.ts"),
      [
        `import { appendFileSync } from "node:fs";\n`,
        `import { Assert, portedTest, TestCase } from ${JSON.stringify(join(root, GRADER))};\n`,
        `(globalThis as any)[Symbol.for("xaravel.harness.report")] = (report: unknown): void => {\n  appendFileSync(${JSON.stringify(reports)}, JSON.stringify(report) + "\\n");\n};\n`,
        ...tests,
      ].join(""),
    );
    const child = Bun.spawnSync([process.execPath, "test", "./probe.test.ts", "--reporter=junit", `--reporter-outfile=${junit}`], { cwd: dir, stdout: "pipe", stderr: "pipe", timeout: FIXTURE_TIMEOUT });
    if (!existsSync(junit)) {
      throw new Error(`the outcome probe fixture wrote no junit report (exit ${String(child.exitCode)}): ${child.stderr.toString().trim()}`);
    }
    const passed = passedTests(readFileSync(junit, "utf8"));
    const reported = new Map<string, { skipped?: unknown }>();
    if (existsSync(reports)) {
      for (const line of readFileSync(reports, "utf8").split("\n")) {
        if (line !== "") {
          const report = JSON.parse(line) as { id: string; skipped?: unknown };
          reported.set(report.id, report);
        }
      }
    }
    for (const [name, forms] of probes) {
      const ok = forms.every((form) => {
        const report = reported.get(label(name, form));
        return passed.has(label(name, form)) && report !== undefined && (report.skipped ?? null) === (SKIP_MESSAGE.get(name) ?? null);
      });
      if (ok) {
        working.add(name);
      }
    }
    return working;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The names of the junit `<testcase>`s that have no failure, error or skip. */
function passedTests(xml: string): Set<string> {
  const passed = new Set<string>();
  const unescape = (text: string): string =>
    text.replace(/&(quot|apos|lt|gt|amp|#\d+|#x[0-9a-f]+);/gi, (entity: string, code: string) => {
      const named: Record<string, string> = { quot: '"', apos: "'", lt: "<", gt: ">", amp: "&" };
      if (code.startsWith("#x") || code.startsWith("#X")) {
        return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
      }
      if (code.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
      }
      return named[code.toLowerCase()] ?? entity;
    });
  for (const match of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const name = /\bname="([^"]*)"/.exec(match[1]!)?.[1];
    const body = match[3] ?? "";
    if (name !== undefined && !/<(failure|error|skipped)\b/.test(body)) {
      passed.add(unescape(name));
    }
  }
  return passed;
}

/** Every unimplemented scan name, grouped by owner (assert, testing, testbench), names sorted. */
export async function coverage(root: string): Promise<{ names: number; lines: CoverageLine[] }> {
  const names = readScanNames(root);
  const grader = await loadGrader(root);
  const lines: CoverageLine[] = [];
  const missingAssert = (name: string): void => {
    lines.push({ owner: "assert", status: "missing", name, text: `missing assert: ${name}` });
  };
  const outcomes = new Map<string, Form[]>();
  for (const name of names) {
    const declared = NOT_PHPUNIT.get(name);
    if (declared === undefined) {
      const forms = formsOf(grader, name);
      if (forms.length === 0) {
        missingAssert(name);
      } else if (OUTCOME_PROBES.has(name)) {
        outcomes.set(name, forms);
      } else if (!(await recordsAssertion(grader, name, forms))) {
        missingAssert(name);
      }
      continue;
    }
    const file = join(root, declared.file);
    if (!existsSync(file)) {
      lines.push({ owner: declared.owner, status: "pending", name, text: `pending ${declared.owner}: ${name} (${declared.fqcn})` });
    } else if (!declaresMember(readFileSync(file, "utf8"), name)) {
      lines.push({ owner: declared.owner, status: "missing", name, text: `missing ${declared.owner}: ${name} (${declared.fqcn}, ${declared.file})` });
    }
  }
  const working = probeOutcomes(root, outcomes);
  for (const name of outcomes.keys()) {
    if (!working.has(name)) {
      missingAssert(name);
    }
  }
  const order = ["assert", "testing", "testbench"];
  lines.sort((a, b) => order.indexOf(a.owner) - order.indexOf(b.owner) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { names: names.length, lines };
}

if (import.meta.main) {
  process.exit(
    await runReport(
      { tool: "assert:coverage", usage: "bun tools/assert-coverage/coverage.ts [--root <dir>]", label: "Assertion coverage", coverage },
      process.argv.slice(2),
    ),
  );
}
