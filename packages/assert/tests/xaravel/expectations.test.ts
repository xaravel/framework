// Xaravel Tests for Story 4.4 (the exception, output, file and JSON
// assertions, `createMock` and the coverage report; FR-116, AD-15). One test
// per AC, in order. Like 4.1-4.3's tests these are plain bun:test:
// `xaravelTest` is not used to test the grader itself.
//
// Every expected pass, failure message and exported string of XT-assert-11
// and XT-assert-12 comes from a signed Oracle fixture of a request in
// conformance/oracle-requests/4.4.jsonl (PHPUnit 13.4.3's own
// ExceptionExpectation, OutputBuffer and Assert). Each request's setup and
// exprs are rebuilt from expectation-cells.ts and must equal the committed
// line. A missing, unsigned or errored fixture fails the test; it is never
// skipped. The TestCase cells run as declared tests in a child `bun test`
// (fixtures/expectations.fixture.ts).
import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ASSERTIONS_4_4 } from "../../src/Framework/Assert";
import { Assert, AssertionFailedError, Exception, ExpectationFailedException, TestCase } from "../../src/index";
import { type DirectCell, EXCEPTION_CELLS, EXPECTATION_CELLS, FILE_CELLS, FILES, JSON_CELLS, JSON_MATRIX_EXPRS, JSON_V, JSON_W, type LifecycleCell, OUTPUT_MARKER, type Pair, REQUESTS, type RequestSpec, THAT_CELLS } from "./expectation-cells";
import { decode, type Output, readRequests, readSignedFixture } from "./oracle-values";

const root = resolve(import.meta.dir, "..", "..", "..", "..");
const REQUEST_FILE = "conformance/oracle-requests/4.4.jsonl";
const FIXTURES = "conformance/fixtures/assert";
const PUBLIC_KEY = "conformance/oracle/oracle.pub";
const FIXTURE = "./packages/assert/tests/xaravel/fixtures/expectations.fixture.ts";
const MOCK_FIXTURE = "./packages/assert/tests/xaravel/fixtures/mock.fixture.ts";
const CASE_ID = "Tests\\Unit\\ExpectationsTest";
const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const CHILD_TIMEOUT = 60_000;
const SPAWN_TIMEOUT = 50_000;

const tempDirs: string[] = [];
beforeAll(() => {
  // The files the files request's setup writes, with the same contents, under this process's temp directory.
  for (const [, path, contents] of FILES) {
    writeFileSync(path, contents);
  }
});
afterAll(() => {
  for (const [, path] of FILES) {
    rmSync(path, { force: true });
  }
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Cells

type Cell = null | readonly [name: string, message: string, failure: readonly [string, string, string, string] | null, code: unknown];

function shortName(error: object): string {
  const constructor = (Object.getPrototypeOf(error) as { constructor?: unknown } | null)?.constructor;
  const fqcn: unknown = typeof constructor === "function" ? (constructor as unknown as Record<symbol, unknown>)[CLASS_FQCN] : undefined;
  if (typeof fqcn === "string") {
    return fqcn.split("\\").pop()!;
  }
  return typeof constructor === "function" ? constructor.name : typeof error;
}

/** The TS outcome of a direct cell. */
function tsCell(run: () => void): Cell {
  try {
    run();
    return null;
  } catch (error) {
    if (!(error instanceof Error)) {
      return ["(not an Error)", String(error), null, 0];
    }
    const getMessage = (error as { getMessage?: () => string }).getMessage;
    const message = typeof getMessage === "function" ? getMessage.call(error) : error.message;
    const failure = error instanceof ExpectationFailedException ? error.getComparisonFailure() : null;
    const getCode = (error as { getCode?: () => unknown }).getCode;
    const code = typeof getCode === "function" ? getCode.call(error) : 0;
    return [shortName(error), message, failure === null ? null : [failure.getExpectedAsString(), failure.getActualAsString(), failure.getDiff(), failure.toString()], code];
  }
}

const TRACE = '" at\n';

/**
 * Whether the port's cell is the Oracle's. A wrong-class message ends with a stack trace, PHP's or JS's (ESC-4.4-2
 * item 3): it is compared up to and including `" at\n"`. PHP's engine TypeError names PHP call sites: only its class
 * is compared, and the port's must be an argument error.
 */
function sameCell(oracle: Cell, got: Cell): boolean {
  if (oracle === null || got === null) {
    return oracle === got;
  }
  // The exception code is a value of the cell, compared exactly.
  if (oracle[3] !== got[3]) {
    return false;
  }
  if (oracle[0] === "TypeError") {
    return got[0] === "TypeError" && got[1].includes("Argument #");
  }
  if (oracle[0] !== got[0] || JSON.stringify(oracle[2]) !== JSON.stringify(got[2])) {
    return false;
  }
  const at = oracle[1].indexOf(TRACE);
  if (at !== -1) {
    const prefix = oracle[1].slice(0, at + TRACE.length);
    return got[1].startsWith(prefix) && got[1].endsWith("\n.");
  }
  return oracle[1] === got[1];
}

function show(cell: Cell): string {
  return cell === null ? "passes" : `throws ${cell[0]} (code ${String(cell[3])}): ${JSON.stringify(cell[1])}${cell[2] === null ? "" : ` (comparison failure ${JSON.stringify(cell[2])})`}`;
}

function oracleCell(value: unknown, where: string): Cell {
  if (value === null) {
    return null;
  }
  if (!Array.isArray(value) || value.length !== 4 || typeof value[0] !== "string" || typeof value[1] !== "string") {
    throw new Error(`${where}: not a cell: ${JSON.stringify(value)}`);
  }
  const failure: unknown = value[2];
  if (failure !== null && (!Array.isArray(failure) || failure.length !== 4)) {
    throw new Error(`${where}: not a comparison failure: ${JSON.stringify(failure)}`);
  }
  return [value[0], value[1], failure as [string, string, string, string] | null, value[3]];
}

// ---------------------------------------------------------------------------
// The Oracle

/** The output of each of `id`'s requests, by name; a problem per request whose fixture is missing, unsigned or errored. */
function oracleOutputs(id: RequestSpec["id"]): { outputs: Map<string, Output>; problems: string[] } {
  const requests = readRequests(join(root, REQUEST_FILE));
  const publicKey = readFileSync(join(root, PUBLIC_KEY), "utf8");
  const specs = REQUESTS.filter((spec) => spec.id === id);
  // The request file holds exactly the table's requests for this id, no more.
  expect(requests.filter((request) => request.id === id)).toHaveLength(specs.length);
  const outputs = new Map<string, Output>();
  const problems: string[] = [];
  for (const spec of specs) {
    const request = requests.find((line) => line.id === id && JSON.stringify(line.setup) === JSON.stringify(spec.setup) && JSON.stringify(line.exprs) === JSON.stringify(spec.exprs));
    if (request === undefined) {
      problems.push(`${REQUEST_FILE}: no ${id} request matches the table's "${spec.name}" request`);
      continue;
    }
    const path = `${FIXTURES}/${request.sha256}.json`;
    try {
      const output = readSignedFixture(join(root, path), request.sha256, publicKey);
      if (output.error !== null) {
        throw new Error(`${path}: the Oracle reported an error: ${JSON.stringify(output.error)}`);
      }
      if (output.results.length !== spec.exprs.length) {
        throw new Error(`${path}: expected ${spec.exprs.length} results, got ${output.results.length}`);
      }
      outputs.set(spec.name, output);
    } catch (error) {
      problems.push(error instanceof Error ? error.message.replace(`${root}/`, "") : String(error));
    }
  }
  return { outputs, problems };
}

function resultValue(output: Output, index: number, where: string): unknown {
  const result = output.results[index];
  if (result === undefined || !("value" in result)) {
    throw new Error(`${where}: result ${index} is not a value: ${JSON.stringify(result ?? null)}`);
  }
  return decode(result.value);
}

/** Every direct cell whose TS outcome differs from the Oracle's result at `offset + index`. */
function directMismatches(name: string, output: Output, cells: readonly DirectCell[], offset = 0): string[] {
  const mismatches: string[] = [];
  cells.forEach((cell, index) => {
    const where = `${name}: ${cell.label}`;
    const oracle = oracleCell(resultValue(output, offset + index, where), where);
    const got = tsCell(cell.ts);
    if (!sameCell(oracle, got)) {
      mismatches.push(`${where}:\n    Oracle ${show(oracle)}\n    got    ${show(got)}`);
    }
  });
  return mismatches;
}

// ---------------------------------------------------------------------------
// The child run of the declared TestCase tests

interface ChildTest {
  readonly report: Record<string, unknown>;
  readonly outcome: Cell;
}

interface FixtureRun {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  /** junit name -> failure message, or null when it passed. */
  readonly results: Map<string, string | null>;
  readonly tests: Map<string, ChildTest>;
  readonly probes: Record<string, unknown>;
}

function unescapeXml(text: string): string {
  return text.replace(/&(#\d+|quot|amp|lt|gt|apos);/g, (_, entity: string) => {
    const named: Record<string, string> = { quot: '"', amp: "&", lt: "<", gt: ">", apos: "'" };
    return named[entity] ?? String.fromCodePoint(Number(entity.slice(1)));
  });
}

let cachedRun: FixtureRun | null = null;
function runFixture(): FixtureRun {
  if (cachedRun !== null) {
    return cachedRun;
  }
  const dir = mkdtempSync(join(tmpdir(), "xt-assert-11-"));
  tempDirs.push(dir);
  const junit = join(dir, "junit.xml");
  const outFile = join(dir, "tests.jsonl");
  const probeFile = join(dir, "probes.json");
  const child = Bun.spawnSync([process.execPath, "test", FIXTURE, "--reporter=junit", `--reporter-outfile=${junit}`], {
    cwd: root,
    env: { ...process.env, XT_EXPECT_OUT_FILE: outFile, XT_EXPECT_PROBE_FILE: probeFile },
    stdout: "pipe",
    stderr: "pipe",
    timeout: SPAWN_TIMEOUT,
  });
  const stdout = child.stdout.toString();
  const stderr = child.stderr.toString();
  if (!existsSync(junit) || !existsSync(outFile) || !existsSync(probeFile)) {
    throw new Error(`the fixture run wrote no junit report, test file or probe file (exit ${child.exitCode}); its output:\n${stdout}${stderr}`);
  }
  const results = new Map<string, string | null>();
  for (const match of readFileSync(junit, "utf8").matchAll(/<testcase name="([^"]*)"[^>]*?(\/>|>\s*<failure([^>]*)>)/g)) {
    const failure = match[3];
    results.set(unescapeXml(match[1] ?? ""), failure === undefined ? null : unescapeXml(/message="([^"]*)"/.exec(failure)?.[1] ?? ""));
  }
  const tests = new Map<string, ChildTest>();
  for (const line of readFileSync(outFile, "utf8").split("\n").filter((text) => text !== "")) {
    const parsed = JSON.parse(line) as { report: Record<string, unknown>; outcome: Cell };
    tests.set(String(parsed.report["id"]), parsed);
  }
  const probes = JSON.parse(readFileSync(probeFile, "utf8")) as Record<string, unknown>;
  cachedRun = { exitCode: child.exitCode, stdout, stderr, results, tests, probes };
  return cachedRun;
}

/** Every lifecycle cell whose declared test's outcome (and bun result) differs from the Oracle's cell. */
function lifecycleMismatches(name: string, output: Output, cells: readonly LifecycleCell[], run: FixtureRun): string[] {
  const mismatches: string[] = [];
  cells.forEach((cell, index) => {
    const id = `${CASE_ID}::${cell.label}`;
    const where = `${name}: ${cell.label}`;
    const oracle = oracleCell(resultValue(output, index, where), where);
    const child = run.tests.get(id);
    if (child === undefined) {
      mismatches.push(`${where}: the child reported no test ${id}`);
      return;
    }
    if (!sameCell(oracle, child.outcome)) {
      mismatches.push(`${where}:\n    Oracle ${show(oracle)}\n    got    ${show(child.outcome)}`);
    }
    // bun's own result: a pass exactly when PHPUnit's test would not fail (a skip passes in bun).
    const passes = oracle === null || oracle[0] === "SkippedWithMessageException";
    if (run.results.has(id) && (run.results.get(id) === null) !== passes) {
      mismatches.push(`${where}: bun ${run.results.get(id) === null ? "passed" : "failed"} it, the Oracle's cell ${show(oracle)}`);
    }
    if (!run.results.has(id)) {
      mismatches.push(`${where}: no junit result for ${id}`);
    }
  });
  return mismatches;
}

const report = (run: FixtureRun, label: string): Record<string, unknown> | undefined => run.tests.get(`${CASE_ID}::${label}`)?.report;

// ---------------------------------------------------------------------------

test("XT-assert-11: expectException(X) ends the test at the throw and passes for X or a subclass; nothing thrown, another class or a propagating assertion failure fails with PHPUnit 13.4.3's messages", () => {
  const run = runFixture();
  // No statement after the throw runs.
  expect(run.probes).toMatchObject({ beforeThrow: true });
  expect(run.probes["afterThrow"]).toBeUndefined();
  expect(run.results.get(`${CASE_ID}::testNoStatementAfterThrow`)).toBeNull();
  expect(report(run, "testNoStatementAfterThrow")?.["assertions"]).toEqual({ assertThat: 1 });

  const { outputs, problems } = oracleOutputs("XT-assert-11");
  expect(problems).toEqual([]);
  const output = outputs.get("expectException")!;
  expect(lifecycleMismatches("expectException", output, EXCEPTION_CELLS, run)).toEqual([]);
  // Each passing test's report counts assertThat once (ExceptionExpectation::verify).
  const passing = EXCEPTION_CELLS.filter((cell, index) => resultValue(output, index, cell.label) === null).map((cell) => cell.label);
  expect(passing.length).toBeGreaterThan(0);
  for (const label of passing) {
    expect({ label, assertions: report(run, label)?.["assertions"] }).toEqual({ label, assertions: label === "testFailingAssertionExpected" ? { assertThat: 1, assertTrue: 1 } : { assertThat: 1 } });
  }
}, CHILD_TIMEOUT);

test("XT-assert-12: the other expectations, the output buffer, fail, markTestSkipped, assertThat and the file, directory and JSON assertions match the Oracle's outcomes, messages and comparison failures (getDiff, toString)", () => {
  // The Story's 16 PHPUnit names, on Assert (and its prototype) or on TestCase.
  expect(ASSERTIONS_4_4).toHaveLength(16);
  for (const name of ASSERTIONS_4_4) {
    expect({ name, type: typeof (TestCase.prototype as unknown as Record<string, unknown>)[name] }).toEqual({ name, type: "function" });
  }

  const run = runFixture();
  // Fixture-free first: skips, the no-assertion expectation, risky tests, unexpected output and counting.
  expect(report(run, "testMarkTestSkipped")).toMatchObject({ skipped: "not here", assertions: {} });
  expect(report(run, "testSkippedInSetUp")).toEqual({ type: "ported", id: `${CASE_ID}::testSkippedInSetUp`, consequence: null, assertions: {}, skipped: "skipped in setUp" });
  expect(run.results.get(`${CASE_ID}::testSkippedInSetUp`)).toBeNull();
  expect(run.probes["bodyAfterSkippedSetUp"]).toBeUndefined();
  for (const [id, child] of run.tests) {
    const keys = Object.keys(child.report);
    expect({ id, keys }).toEqual({ id, keys: "skipped" in child.report ? ["type", "id", "consequence", "assertions", "skipped"] : ["type", "id", "consequence", "assertions"] });
  }
  expect(report(run, "testNotToPerformAssertions")?.["assertions"]).toEqual({ expectNotToPerformAssertions: 1 });
  expect(run.results.get(`${CASE_ID}::testNotToPerformAssertions`)).toBeNull();
  expect(run.results.get(`${CASE_ID}::testRisky`)).toBeNull();
  expect(run.stderr).toContain(`${CASE_ID}::testRisky: risky: This test is not expected to perform assertions but performed 2 assertions\n`);
  expect(run.stdout + run.stderr).toContain("xt-unexpected-output\n");
  expect(report(run, "testOutputMatches")?.["assertions"]).toEqual({ assertSame: 1 });
  // Output an expectation captured never reaches the real stdout. (stderr holds bun's failure reports, whose
  // Expected/Actual blocks quote the compared output, so it is not checked for the marker.)
  expect(run.stdout).not.toContain(OUTPUT_MARKER);

  // DIV-10: expectExceptionMessageMatches takes a RegExp; a PCRE pattern string is a TypeError.
  expect(() => new TestCase().expectExceptionMessageMatches("/^a.c$/" as unknown as RegExp)).toThrow(TypeError);

  // PHPUnit's Exception protocol: a string code joins the message and the code becomes 0; previous is kept;
  // AssertionFailedError::toString() is getMessage().
  const previous = new Error("before");
  const exception = new Exception("m", "E1", previous);
  expect({ message: exception.getMessage(), code: exception.getCode(), previous: exception.getPrevious() }).toEqual({ message: "m (exception code: E1)", code: 0, previous });
  expect(exception.getPrevious()).toBe(previous);
  const intCode = new Exception("m", 5);
  expect({ message: intCode.getMessage(), code: intCode.getCode(), previous: intCode.getPrevious() }).toEqual({ message: "m", code: 5, previous: null });
  expect(new AssertionFailedError("x").toString()).toBe("x");
  expect(new AssertionFailedError("x")).toBeInstanceOf(Exception);
  expect(report(run, "testCounting")?.["assertions"]).toEqual({
    assertDirectoryDoesNotExist: 1,
    assertDirectoryExists: 1,
    assertFileDoesNotExist: 1,
    assertFileExists: 1,
    assertJson: 1,
    assertJsonStringEqualsJsonString: 1,
    assertStringEqualsFile: 1,
    assertThat: 1,
    fail: 1,
  });
  expect(run.results.get(`${CASE_ID}::testCounting`)).toBeNull();

  // Then every cell, against the signed fixtures.
  const { outputs, problems } = oracleOutputs("XT-assert-12");
  expect(problems).toEqual([]);
  const mismatches: string[] = [];
  mismatches.push(...lifecycleMismatches("expectations", outputs.get("expectations")!, EXPECTATION_CELLS, run));
  mismatches.push(...directMismatches("assertThat", outputs.get("assertThat")!, THAT_CELLS));
  mismatches.push(...directMismatches("files", outputs.get("files")!, FILE_CELLS));

  // JSON: the operand lists are their TS twins, then the assertJson list, the assertJsonStringEqualsJsonString
  // matrix and the single cells.
  const json = outputs.get("json")!;
  const pairing = (pairs: readonly Pair[], index: number): void => {
    const decoded = resultValue(json, index, "json operands");
    expect(decoded).toEqual(pairs.map(([, ts]) => ts));
  };
  pairing(JSON_V, 0);
  pairing(JSON_W, 1);
  const operands = [...JSON_V, ...JSON_W];
  const unary = resultValue(json, 2, "assertJson") as unknown[];
  expect(unary).toHaveLength(operands.length);
  operands.forEach(([php, ts], index) => {
    const oracle = oracleCell(unary[index], `assertJson(${php})`);
    const got = tsCell(() => Assert.assertJson(ts as string));
    if (!sameCell(oracle, got)) {
      mismatches.push(`json: assertJson(${php}):\n    Oracle ${show(oracle)}\n    got    ${show(got)}`);
    }
  });
  const matrix = resultValue(json, 3, "assertJsonStringEqualsJsonString") as unknown[][];
  expect(matrix).toHaveLength(JSON_V.length);
  let pairs = 0;
  JSON_V.forEach(([phpA, a], i) => {
    JSON_V.forEach(([phpB, b], j) => {
      pairs++;
      const oracle = oracleCell(matrix[i]![j], `assertJsonStringEqualsJsonString(${phpA}, ${phpB})`);
      const got = tsCell(() => Assert.assertJsonStringEqualsJsonString(a as string, b as string));
      if (!sameCell(oracle, got)) {
        mismatches.push(`json: assertJsonStringEqualsJsonString(${phpA}, ${phpB}):\n    Oracle ${show(oracle)}\n    got    ${show(got)}`);
      }
    });
  });
  expect(pairs).toBe(JSON_V.length ** 2);
  mismatches.push(...directMismatches("json", json, JSON_CELLS, JSON_MATRIX_EXPRS.length));
  expect(mismatches).toEqual([]);
}, CHILD_TIMEOUT);

// ---------------------------------------------------------------------------

interface MockRun {
  readonly exitCode: number;
  readonly output: string;
  readonly tests: Map<string, { report: Record<string, unknown>; error: { name: string; message: string } | null }>;
}

function runMockFixture(withMockery: boolean): MockRun {
  const dir = mkdtempSync(join(tmpdir(), "xt-assert-13-"));
  tempDirs.push(dir);
  const outFile = join(dir, "tests.jsonl");
  const env: Record<string, string | undefined> = { ...process.env, XT_MOCK_OUT_FILE: outFile };
  delete env["XT_MOCK_MOCKERY"];
  if (withMockery) {
    env["XT_MOCK_MOCKERY"] = "1";
  }
  const child = Bun.spawnSync([process.execPath, "test", MOCK_FIXTURE], { cwd: root, env, stdout: "pipe", stderr: "pipe", timeout: SPAWN_TIMEOUT });
  const output = child.stdout.toString() + child.stderr.toString();
  if (!existsSync(outFile)) {
    throw new Error(`the mock fixture run wrote no test file (exit ${child.exitCode}); its output:\n${output}`);
  }
  const tests: MockRun["tests"] = new Map();
  for (const line of readFileSync(outFile, "utf8").split("\n").filter((text) => text !== "")) {
    const parsed = JSON.parse(line) as { report: Record<string, unknown>; error: { name: string; message: string } | null };
    tests.set(String(parsed.report["id"]).replace("Tests\\Unit\\CreateMockTest::", ""), parsed);
  }
  return { exitCode: child.exitCode, output, tests };
}

test("XT-assert-13: this.createMock(X) returns Mockery's mock of X when @xaravel/mockery is loaded (an unmet expectation fails the test with Mockery's message), and throws an error naming @xaravel/mockery when it is not", () => {
  const loaded = runMockFixture(true);
  // A met expectation: shouldReceive works, the mock is an X, and Mockery counts its expectation.
  expect(loaded.tests.get("testMetExpectation")).toEqual({
    report: { type: "ported", id: "Tests\\Unit\\CreateMockTest::testMetExpectation", consequence: null, assertions: { assertInstanceOf: 1, assertSame: 1, mockeryExpectation: 1 } },
    error: null,
  });
  // An unmet one fails the test with Mockery's own InvalidCountException message for the same expectation.
  const unmet = loaded.tests.get("testUnmetExpectation")?.error;
  const reference = loaded.tests.get("testUnmetExpectationThroughMockery")?.error;
  expect(reference?.name).toBe("InvalidCountException");
  expect(reference?.message).toContain("should be called\n exactly 1 times but called 0 times.");
  const anonymous = (text: string | undefined): string | undefined => text?.replace(/Mockery_\d+_/g, "Mockery_<n>_");
  expect({ name: unmet?.name, message: anonymous(unmet?.message) }).toEqual({ name: reference!.name, message: anonymous(reference!.message) });
  expect(loaded.output).toMatch(/1 pass\b/);
  expect(loaded.output).toMatch(/2 fail\b/);

  // Without Mockery loaded, createMock throws an error that names the package.
  const unloaded = runMockFixture(false);
  for (const label of ["testMetExpectation", "testUnmetExpectation"]) {
    const error = unloaded.tests.get(label)?.error;
    expect(error?.name).toBe("Error");
    expect(error?.message).toContain("@xaravel/mockery");
  }
  expect(unloaded.tests.has("testUnmetExpectationThroughMockery")).toBe(false);
}, CHILD_TIMEOUT);

// ---------------------------------------------------------------------------

function runCoverage(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const child = Bun.spawnSync([process.execPath, "run", "--silent", "assert:coverage", ...args], { cwd: root, stdout: "pipe", stderr: "pipe", timeout: SPAWN_TIMEOUT });
  return { exitCode: child.exitCode, stdout: child.stdout.toString(), stderr: child.stderr.toString() };
}

const PENDING = [
  "pending testing: assertAuthenticated (Illuminate\\Foundation\\Testing\\Concerns\\InteractsWithAuthentication)",
  "pending testing: assertDatabaseCount (Illuminate\\Foundation\\Testing\\Concerns\\InteractsWithDatabase)",
  "pending testing: assertDatabaseHas (Illuminate\\Foundation\\Testing\\Concerns\\InteractsWithDatabase)",
  "pending testing: assertDatabaseMissing (Illuminate\\Foundation\\Testing\\Concerns\\InteractsWithDatabase)",
  "pending testing: assertGuest (Illuminate\\Foundation\\Testing\\Concerns\\InteractsWithAuthentication)",
  "pending testing: assertModelMissing (Illuminate\\Foundation\\Testing\\Concerns\\InteractsWithDatabase)",
  "pending testing: assertThrows (Illuminate\\Foundation\\Testing\\Concerns\\InteractsWithExceptionHandling)",
  "pending testbench: assertFileContains (Orchestra\\Testbench\\Concerns\\InteractsWithPublishedFiles)",
  "pending testbench: assertFileDoesNotContains (Orchestra\\Testbench\\Concerns\\InteractsWithPublishedFiles)",
  "pending testbench: assertFileNotContains (Orchestra\\Testbench\\Concerns\\InteractsWithPublishedFiles)",
  "pending testbench: assertFilenameDoesNotExists (Orchestra\\Testbench\\Concerns\\InteractsWithPublishedFiles)",
  "pending testbench: assertFilenameExists (Orchestra\\Testbench\\Concerns\\InteractsWithPublishedFiles)",
  "pending testbench: assertFilenameNotExists (Orchestra\\Testbench\\Concerns\\InteractsWithPublishedFiles)",
  "pending testbench: assertMigrationFileContains (Orchestra\\Testbench\\Concerns\\InteractsWithPublishedFiles)",
  "pending testbench: assertMigrationFileExists (Orchestra\\Testbench\\Concerns\\InteractsWithPublishedFiles)",
];

test("XT-assert-14: bun run assert:coverage lists no missing assert name and the 15 non-PHPUnit names as pending testing or testbench, and fails naming each name a scan adds or an owner file lacks", () => {
  const scanText = readFileSync(join(root, "conformance/scans/phpunit-assertions.jsonl"), "utf8");
  const scanNames = scanText
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => (JSON.parse(line) as { name: string }).name);

  // The repository: exit 0, the 15 pending lines, nothing missing.
  const repo = runCoverage([]);
  expect({ exitCode: repo.exitCode, stderr: repo.stderr }).toEqual({ exitCode: 0, stderr: "" });
  const lines = repo.stdout.split("\n").filter((line) => line !== "");
  expect(lines).toEqual([...PENDING, `Assertion coverage: ${scanNames.length} scan names; ${scanNames.length - 15} implemented, 15 pending, 0 missing.`]);

  // A temp root whose packages/assert is the real one: a scan name the grader lacks, and an owner file that
  // declares only one of its names, each fail the report, named.
  const dir = mkdtempSync(join(tmpdir(), "xt-assert-14-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, "conformance/scans"), { recursive: true });
  writeFileSync(join(dir, "conformance/scans/phpunit-assertions.jsonl"), `${scanText}{"name":"assertXaravelNeverDeclared","calls":1,"executions":0}\n`);
  mkdirSync(join(dir, "packages"), { recursive: true });
  symlinkSync(join(root, "packages/assert"), join(dir, "packages/assert"));
  const ownerFile = join(dir, "packages/testbench/src/Concerns/InteractsWithPublishedFiles.ts");
  mkdirSync(dirname(ownerFile), { recursive: true });
  writeFileSync(ownerFile, "export class InteractsWithPublishedFiles {\n  assertFileContains(contents: string[], file: string): void {}\n}\n");
  const temp = runCoverage(["--root", dir]);
  expect(temp.exitCode).toBe(1);
  const tempLines = temp.stdout.split("\n").filter((line) => line !== "");
  expect(tempLines).toContain("missing assert: assertXaravelNeverDeclared");
  for (const name of ["assertFileDoesNotContains", "assertFileNotContains", "assertFilenameDoesNotExists", "assertFilenameExists", "assertFilenameNotExists", "assertMigrationFileContains", "assertMigrationFileExists"]) {
    expect(tempLines).toContain(`missing testbench: ${name} (Orchestra\\Testbench\\Concerns\\InteractsWithPublishedFiles, packages/testbench/src/Concerns/InteractsWithPublishedFiles.ts)`);
  }
  expect(tempLines.some((line) => line.includes("assertFileContains (") && line.startsWith("missing"))).toBe(false);
  // The testing names stay pending: their files are absent.
  expect(tempLines.filter((line) => line.startsWith("pending testing: "))).toHaveLength(7);
  expect(tempLines.at(-1)).toBe(`Assertion coverage: ${scanNames.length + 1} scan names; ${scanNames.length - 14} implemented, 7 pending, 8 missing.`);

  // A usage error exits 2.
  expect(runCoverage(["--nope"]).exitCode).toBe(2);
}, CHILD_TIMEOUT);
