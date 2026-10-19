// Xaravel Tests for Story 4.3 (the core PHPUnit assertions; FR-116, AD-15).
// One test per AC, in order. Like 4.1's and 4.2's tests these are plain
// bun:test: `xaravelTest` is not used to test the grader itself.
//
// Every expected pass, failure message and exception comes from a signed Oracle
// fixture of a request in conformance/oracle-requests/4.3.jsonl (PHPUnit 13.4.3
// itself, with Laravel's Illuminate\Testing\Assert). Each request's setup and
// exprs are rebuilt from operands.ts and must equal the committed line, so the
// TS twins are the operands the Oracle saw. A missing, unsigned or errored
// fixture fails the test; it is never skipped.
import { afterAll, expect } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ASSERTIONS } from "../../src/Framework/Assert";
import { Assert, ExpectationFailedException, xaravelTest } from "../../src/index";
import { requestMismatches } from "./assertion-cells";
import { REGEX_PATTERNS, REGEX_V, REQUESTS, type RequestSpec, requestExprs } from "./operands";
import { readRequests, readSignedFixture } from "./oracle-values";

const root = resolve(import.meta.dir, "..", "..", "..", "..");
const REQUEST_FILE = "conformance/oracle-requests/4.3.jsonl";
const FIXTURES = "conformance/fixtures/assert";
const PUBLIC_KEY = "conformance/oracle/oracle.pub";
const FIXTURE = "./packages/assert/tests/xaravel/fixtures/assertions.fixture.ts";
const CHILD_TIMEOUT = 60_000;
const SPAWN_TIMEOUT = 50_000;

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Runs every request of `id` against its signed fixture; returns the problems, the cell count and the kinds that ran. */
function runRequests(id: RequestSpec["id"]): { problems: string[]; cells: number; ran: Set<string> } {
  const requests = readRequests(join(root, REQUEST_FILE));
  const publicKey = readFileSync(join(root, PUBLIC_KEY), "utf8");
  const specs = REQUESTS.filter((spec) => spec.id === id);
  const problems: string[] = [];
  const ran = new Set<string>();
  let cells = 0;
  // The request file holds exactly the table's requests for this id, no more.
  expect(requests.filter((request) => request.id === id)).toHaveLength(specs.length);
  for (const spec of specs) {
    const exprs = requestExprs(spec);
    const request = requests.find((line) => line.id === id && JSON.stringify(line.setup) === JSON.stringify(spec.setup) && JSON.stringify(line.exprs) === JSON.stringify(exprs));
    if (request === undefined) {
      problems.push(`${REQUEST_FILE}: no ${id} request matches the table's ${spec.matrices.map((matrix) => matrix.assertion).join(", ")}`);
      continue;
    }
    const path = `${FIXTURES}/${request.sha256}.json`;
    try {
      const output = readSignedFixture(join(root, path), request.sha256, publicKey);
      const result = requestMismatches(path, spec, output);
      cells += result.cells;
      problems.push(...result.mismatches);
      for (const name of result.ran) {
        ran.add(name);
      }
    } catch (error) {
      problems.push(error instanceof Error ? error.message.replace(`${root}/`, "") : String(error));
    }
  }
  return { problems, cells, ran };
}

function jsonLines(text: string): Record<string, unknown>[] {
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

xaravelTest("XT-assert-8", "each core assertion passes, fails with PHPUnit's message and compared values, or throws, exactly as the signed PHPUnit 13.4.3 Oracle does over its operand matrix, and counts its own kind", () => {
  // The Story's enumerated assertions, each on Assert and on its prototype. The spec's list names 51 of the 82
  // scan names (it says "50"; the other 31 are Story 4.4's).
  expect(ASSERTIONS).toHaveLength(51);
  for (const name of ASSERTIONS) {
    expect(typeof (Assert.prototype as unknown as Record<string, unknown>)[name]).toBe("function");
  }

  // Counting first, without fixtures: a declared test reports each kind it ran, once per call, passing or failing.
  const dir = mkdtempSync(join(tmpdir(), "xt-assert-8-"));
  tempDirs.push(dir);
  const reportFile = join(dir, "reports.jsonl");
  const probeFile = join(dir, "probe.json");
  const child = Bun.spawnSync([process.execPath, "test", FIXTURE], {
    cwd: root,
    env: { ...process.env, XT_ASSERT_REPORT_FILE: reportFile, XT_ASSERT_PROBE_FILE: probeFile },
    stdout: "pipe",
    stderr: "pipe",
    timeout: SPAWN_TIMEOUT,
  });
  const output = child.stdout.toString() + child.stderr.toString();
  if (!existsSync(reportFile) || !existsSync(probeFile)) {
    throw new Error(`the fixture run wrote no report or probe (exit ${child.exitCode}); its output:\n${output}`);
  }
  const counted = JSON.parse(readFileSync(probeFile, "utf8")) as Record<string, number>;
  expect(Object.keys(counted).sort()).toEqual([...ASSERTIONS].sort());
  const reports = jsonLines(readFileSync(reportFile, "utf8"));
  // Laravel's assertArraySubset records the PHPUnit assertThat it calls, as the Inventory's recorder sees it
  // (decisions/ESC-4.3-1.md item 8, Story 4.7).
  const kinds = Object.keys(counted).map((name) => (name === "assertArraySubset" ? "assertThat" : name));
  expect(reports).toEqual([
    { type: "ported", id: "Tests\\Unit\\AssertionsTest::testEveryAssertion", consequence: null, assertions: Object.fromEntries(kinds.sort().map((name) => [name, 1])) },
    // The nested assertNotEquals is not counted; the failing second call still counts (the kind is recorded first).
    { type: "ported", id: "Tests\\Unit\\AssertionsTest::testNotSameBooleans", consequence: null, assertions: { assertNotSame: 2 } },
    // An argument error counts.
    { type: "ported", id: "Tests\\Unit\\AssertionsTest::testArgumentError", consequence: null, assertions: { assertStringStartsWith: 1 } },
    { type: "ported", id: "Tests\\Unit\\AssertionsTest::testFailingAssertion", consequence: null, assertions: { assertTrue: 2 } },
  ]);
  // The failing assertion fails its test with PHPUnit's message.
  expect(child.exitCode).not.toBe(0);
  expect(output).toContain("ctx\nFailed asserting that false is true.");
  expect(output).toMatch(/2 pass\b/);
  expect(output).toMatch(/2 fail\b/);

  // AD-9 forbids `undefined`; a message names it, never disguising it as null.
  let undefinedFailure: unknown = null;
  try {
    Assert.assertNull(undefined);
  } catch (error) {
    undefinedFailure = error;
  }
  expect(undefinedFailure).toBeInstanceOf(ExpectationFailedException);
  expect((undefinedFailure as ExpectationFailedException).getMessage()).toBe("Failed asserting that undefined is null.");

  // Then the matrices, against the signed fixtures.
  const { problems, cells, ran } = runRequests("XT-assert-8");
  expect(problems).toEqual([]);
  expect(cells).toBeGreaterThan(0);
  expect([...ran].sort()).toEqual([...ASSERTIONS].sort());
}, CHILD_TIMEOUT);

xaravelTest("XT-assert-9", "assertSame fails and assertEquals passes on an array and the same entries in another key order (list, plain object and branded forms), with the Oracle's messages", () => {
  const { problems, cells, ran } = runRequests("XT-assert-9");
  expect(problems).toEqual([]);
  expect(cells).toBeGreaterThan(0);
  expect([...ran].sort()).toEqual(["assertEquals", "assertSame"]);
});

xaravelTest("XT-assert-10", "assertMatchesRegularExpression and assertDoesNotMatchRegularExpression take Upstream patterns as RegExp and match the Oracle; a string pattern is a TypeError (DIV-10)", () => {
  const { problems, cells, ran } = runRequests("XT-assert-10");
  expect(problems).toEqual([]);
  expect(cells).toBe(2 * REGEX_PATTERNS.length * REGEX_V.length);
  expect([...ran].sort()).toEqual(["assertDoesNotMatchRegularExpression", "assertMatchesRegularExpression"]);
  // DIV-10: no PCRE string is converted at run time.
  for (const [pattern] of REGEX_PATTERNS) {
    const source = pattern.slice(1, -1);
    expect(() => Assert.assertMatchesRegularExpression(source as unknown as RegExp, "artisan inspire")).toThrow(TypeError);
    expect(() => Assert.assertDoesNotMatchRegularExpression(source as unknown as RegExp, "artisan inspire")).toThrow(TypeError);
  }
});
