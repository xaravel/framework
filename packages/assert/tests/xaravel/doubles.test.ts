// Xaravel Tests for Story 4.7 (PHPUnit's test doubles, addToAssertionCount,
// stringContains and assertArraySubset's kind; FR-113, FR-116, AD-15). One
// test per AC, in order. Like 4.1-4.4's tests these are plain bun:test:
// `xaravelTest` is not used to test the grader itself.
//
// Every compared return value, thrown exception, verify outcome and kind-less
// count comes from a signed Oracle fixture of a request in
// conformance/oracle-requests/4.7.jsonl (PHPUnit 13.4.3's own test doubles).
// Each request's setup and exprs are rebuilt from double-cells.ts and must
// equal the committed line. A missing, unsigned or errored fixture fails the
// test; it is never skipped. Fixture-free checks run first. The declared
// TestCase tests run in a child `bun test` (fixtures/doubles.fixture.ts).
import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCounted } from "../../src/declarations/AssertionCounter";
import { Assert, MockBuilder, type MockObject, TestCase } from "../../src/index";
import { parameterInfo } from "../../src/Framework/MockObject/Generator/Generator";
import { type Cell, DOUBLE_CELLS, MATCHER_CELLS, REQUESTS, type RequestSpec, runCase47, runDirect47, STRING_CELLS, SUBSET_CELLS, XtDouble, XtDoubleIface, XtDoubleWithDefaults } from "./double-cells";
import { decode, type Output, readRequests, readSignedFixture } from "./oracle-values";

const root = resolve(import.meta.dir, "..", "..", "..", "..");
const REQUEST_FILE = "conformance/oracle-requests/4.7.jsonl";
const FIXTURES = "conformance/fixtures/assert";
const PUBLIC_KEY = "conformance/oracle/oracle.pub";
const FIXTURE = "./packages/assert/tests/xaravel/fixtures/doubles.fixture.ts";
const CASE_ID = "Tests\\Unit\\DoublesTest";
const CHILD_TIMEOUT = 60_000;
const SPAWN_TIMEOUT = 50_000;

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

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

/** Every cell whose TS outcome is not the Oracle's result at `offset + index`, one line each. */
function mismatches<C extends { label: string }>(name: string, output: Output, cells: readonly C[], run: (cell: C) => unknown, offset = 0): string[] {
  const found: string[] = [];
  cells.forEach((cell, index) => {
    const where = `${name}: ${cell.label}`;
    const oracle = resultValue(output, offset + index, where);
    const got = run(cell);
    if (!Bun.deepEquals(oracle, got, true)) {
      found.push(`${where}:\n    Oracle ${JSON.stringify(oracle)}\n    got    ${JSON.stringify(got)}`);
    }
  });
  return found;
}

/** The Oracle's cell `[result, thrown, verify, count]` of the double scenario `label`. */
function scenarioCell(output: Output, label: string): readonly [unknown, Cell, Cell, number] {
  const index = DOUBLE_CELLS.findIndex((cell) => cell.label === label);
  expect(index).toBeGreaterThanOrEqual(0);
  return resultValue(output, index, label) as readonly [unknown, Cell, Cell, number];
}

// ---------------------------------------------------------------------------
// The child run of the declared TestCase tests

interface FixtureRun {
  readonly exitCode: number;
  readonly output: string;
  /** junit name -> failure message, or null when it passed. */
  readonly results: Map<string, string | null>;
  readonly tests: Map<string, { report: Record<string, unknown>; outcome: Cell }>;
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
  const dir = mkdtempSync(join(tmpdir(), "xt-assert-15-"));
  tempDirs.push(dir);
  const junit = join(dir, "junit.xml");
  const outFile = join(dir, "tests.jsonl");
  const probeFile = join(dir, "probes.json");
  const child = Bun.spawnSync([process.execPath, "test", FIXTURE, "--reporter=junit", `--reporter-outfile=${junit}`], {
    cwd: root,
    env: { ...process.env, XT_DOUBLE_OUT_FILE: outFile, XT_DOUBLE_PROBE_FILE: probeFile },
    stdout: "pipe",
    stderr: "pipe",
    timeout: SPAWN_TIMEOUT,
  });
  const output = child.stdout.toString() + child.stderr.toString();
  if (!existsSync(junit) || !existsSync(outFile) || !existsSync(probeFile)) {
    throw new Error(`the fixture run wrote no junit report, test file or probe file (exit ${child.exitCode}); its output:\n${output}`);
  }
  const results = new Map<string, string | null>();
  for (const match of readFileSync(junit, "utf8").matchAll(/<testcase name="([^"]*)"[^>]*?(\/>|>\s*<failure([^>]*)>)/g)) {
    const failure = match[3];
    results.set(unescapeXml(match[1] ?? "").replace(`${CASE_ID}::`, ""), failure === undefined ? null : unescapeXml(/message="([^"]*)"/.exec(failure)?.[1] ?? ""));
  }
  const tests: FixtureRun["tests"] = new Map();
  for (const line of readFileSync(outFile, "utf8").split("\n").filter((text) => text !== "")) {
    const parsed = JSON.parse(line) as { report: Record<string, unknown>; outcome: Cell };
    tests.set(String(parsed.report["id"]).replace(`${CASE_ID}::`, ""), parsed);
  }
  cachedRun = { exitCode: child.exitCode, output, results, tests, probes: JSON.parse(readFileSync(probeFile, "utf8")) as Record<string, unknown> };
  return cachedRun;
}

/** The report a declared test of the fixture must send. */
const expectedReport = (label: string, assertions: Record<string, number>): Record<string, unknown> => ({ type: "ported", id: `${CASE_ID}::${label}`, consequence: null, assertions });

// ---------------------------------------------------------------------------

test("XT-assert-15: createMock, createStub and getMockBuilder(…)->getMock() make PHPUnit 13.4.3 test doubles: every return value, thrown exception, verify outcome and kind-less count of expects, method, with and the will* stubs matches the Oracle's", () => {
  // Fixture-free first.
  // A double is an instance of a subclass of its target; a token's double carries the token's brand.
  const test47 = new TestCase();
  const mock = test47.createMock(XtDouble);
  expect(mock).toBeInstanceOf(XtDouble);
  expect(Object.getPrototypeOf(mock)).not.toBe(XtDouble.prototype);
  expect(Object.hasOwn(Object.getPrototypeOf(mock) as object, "bar")).toBe(true);
  expect(test47.createMock(XtDoubleIface) instanceof (XtDoubleIface as unknown as abstract new () => unknown)).toBe(true);
  expect(test47.getMockBuilder(XtDouble)).toBeInstanceOf(MockBuilder);
  expect(Object.isFrozen(MockBuilder) && Object.isFrozen(MockBuilder.prototype)).toBe(true);
  // A double's own keys are the target's fields only: every internal is symbol-keyed.
  expect(Object.keys(test47.getMockBuilder(XtDouble).getMock())).toEqual(["ctorArgs"]);
  expect(Object.keys(mock)).toEqual([]);
  // A stub has no expects(): calling it is a TypeError. Its method() has no with().
  const stub = TestCase.createStub(XtDouble);
  expect(() => (stub as unknown as MockObject).expects(test47.once())).toThrow(TypeError);
  expect((stub.method("bar") as unknown as Record<string, unknown>)["with"]).toBeUndefined();
  // The APIs Upstream never calls are absent, and calling one is a TypeError.
  const instance = test47 as unknown as Record<string, unknown>;
  for (const name of ["createConfiguredMock", "createConfiguredStub", "createMockForIntersectionOfInterfaces", "createStubForIntersectionOfInterfaces", "atLeast", "atMost", "callback", "anything", "identicalTo"]) {
    expect({ name, type: typeof instance[name] }).toEqual({ name, type: "undefined" });
  }
  const mocker = test47.createMock(XtDouble).expects(test47.once()).method("bar") as unknown as Record<string, unknown>;
  for (const name of ["withAnyParameters", "withParameterSetsInOrder", "withParameterSetsInAnyOrder", "withParameterSetsInPartialOrder", "willReturnArgument", "willReturnReference", "willReturnStrictMap", "seal", "id", "after"]) {
    expect({ name, type: typeof mocker[name] }).toEqual({ name, type: "undefined" });
  }
  const builder = test47.getMockBuilder(XtDouble) as unknown as Record<string, unknown>;
  for (const name of ["doubleProperties", "setMockClassName", "enableAutoReturnValueGeneration", "disableAutoReturnValueGeneration"]) {
    expect({ name, type: typeof builder[name] }).toEqual({ name, type: "undefined" });
  }
  // Parameters as PHP reflects them: `x = default` is `$x`, a trailing `...rest` is the variadic (not declared), a
  // trailing comma and comments are skipped, and destructuring falls back to index names.
  const info = (fn: (...args: never[]) => unknown): unknown => parameterInfo(fn);
  expect(info((x = null, y = null) => [x, y])).toEqual({ count: 2, names: ["$x", "$y"] });
  expect(info((a: unknown, ...rest: unknown[]) => [a, rest])).toEqual({ count: 1, names: ["$a"] });
  // Source text bun's transpiler would rewrite (comments, a trailing comma), so built at run time.
  // oxlint-disable-next-line no-implied-eval
  expect(info(new Function("a /* b, c */", "b = ')', // d, e\n", "return [a, b];") as () => unknown)).toEqual({ count: 2, names: ["$a", "$b"] });
  // oxlint-disable-next-line no-implied-eval
  expect(info(new Function("a", "b,", "return [a, b];") as () => unknown)).toEqual({ count: 2, names: ["$a", "$b"] });
  expect(info(({ a }: { a: unknown }, b: unknown) => [a, b])).toEqual({ count: 2, names: [] });
  // A twin with default-valued parameters gives XtDouble's messages and return values: the omitted argument is null,
  // a mismatch names `$y`, and full-arity willReturnMap rows match.
  const withDefaults = (type: typeof XtDouble | typeof XtDoubleWithDefaults): unknown[] => [
    runCase47(function () {
      const m = this.createMock(type as typeof XtDouble);
      m.expects(this.once()).method("bar").with(1, 2);
      return m.bar(1);
    }),
    runCase47(function () {
      const m = this.createMock(type as typeof XtDouble);
      m.expects(this.once()).method("bar").with(1, 3);
      return m.bar(1, 2);
    }),
    runCase47(function () {
      const m = this.createMock(type as typeof XtDouble);
      m.method("bar").willReturnMap([
        [1, "a"],
        [1, 2, "c"],
        [3, 4, 5, "d"],
      ]);
      return [m.bar(1), m.bar(1, 2), m.bar(3, 4), m.bar(5)];
    }),
  ];
  const plain = withDefaults(XtDouble);
  expect((plain[1] as [unknown, Cell])[1]?.[1]).toContain("Parameter $y for invocation XtDouble::bar(1, 2) does not match expected value.");
  expect(withDefaults(XtDoubleWithDefaults)).toEqual(plain);
  // createMock never reads Story 4.4's Mockery hook.
  expect(readFileSync(join(root, "packages/assert/src/Framework/TestCase.ts"), "utf8")).not.toContain("xaravel.mockery.mock");

  // The declared TestCase tests: a met expects(once()) passes with an empty kind multiset, and a test whose only check
  // is a mock object without an expectation (or a stub) fails "zero assertions".
  const run = runFixture();
  expect(run.probes["mockeryHookReads"]).toBe(0);
  expect(run.probes).toMatchObject({ metOnceReturned: 2, mismatchCaught: true, stubReturned: 3 });
  expect(run.tests.get("testMetOnce")).toEqual({ report: expectedReport("testMetOnce", {}), outcome: null });
  expect(run.results.get("testMetOnce")).toBeNull();
  for (const label of ["testMockWithoutExpectation", "testStubOnly"]) {
    expect({ label, report: run.tests.get(label)?.report, failure: run.results.get(label) }).toEqual({
      label,
      report: expectedReport(label, {}),
      failure: `${CASE_ID}::${label}: Ported Test executed zero assertions (FR-113)`,
    });
  }
  expect(run.tests.get("testMockAndAssertion")).toEqual({ report: expectedReport("testMockAndAssertion", { assertSame: 1 }), outcome: null });
  expect(run.results.get("testMockAndAssertion")).toBeNull();
  // The declared tests end as PHPUnit's runBare would: an unmet expectation, an over-count and a parameter mismatch
  // the body caught each fail the test, and count no kind.
  for (const label of ["testUnmetOnce", "testOverCount", "testParameterMismatchCaught"]) {
    expect({ label, report: run.tests.get(label)?.report, failed: typeof run.results.get(label) === "string" }).toEqual({ label, report: expectedReport(label, {}), failed: true });
  }
  // A body whose exception expectException matched still has its mock objects verified.
  expect(run.tests.get("testExpectedExceptionThenVerify")).toEqual({
    report: expectedReport("testExpectedExceptionThenVerify", { assertThat: 1 }),
    outcome: ["ExpectationFailedException", "XtDouble::bar() was expected to be invoked once but was never invoked.", null, 0],
  });

  // Then every cell, against the signed fixture.
  const { outputs, problems } = oracleOutputs("XT-assert-15");
  expect(problems).toEqual([]);
  const doubles = outputs.get("doubles")!;
  expect(mismatches("doubles", doubles, DOUBLE_CELLS, (cell) => runCase47(cell.ts))).toEqual([]);
  // The declared tests' errors are the Oracle's: the unmet expectation and the over-count fail with its messages, and a
  // parameter mismatch the body caught fails at verification.
  expect(run.tests.get("testUnmetOnce")?.outcome).toEqual(scenarioCell(doubles, "unmet once")[2]);
  expect(run.tests.get("testOverCount")?.outcome).toEqual(scenarioCell(doubles, "over-count")[1]);
  expect(run.tests.get("testParameterMismatchCaught")?.outcome).toEqual(scenarioCell(doubles, "parameter mismatch caught")[2]);
}, CHILD_TIMEOUT);

test("XT-assert-16: addToAssertionCount, stringContains, assertArraySubset and the once, never, any, exactly and atLeastOnce matchers match the Oracle; assertArraySubset records assertThat, and a test whose only count is kind-less passes with an empty kind multiset", async () => {
  // Fixture-free first.
  // addToAssertionCount takes an integer.
  for (const bad of [1.5, "1", Number.NaN]) {
    expect(() => new TestCase().addToAssertionCount(bad as number)).toThrow(TypeError);
  }
  // PHPUnit's `int $count` takes any integer.
  const negative = new TestCase();
  negative.addToAssertionCount(-1);
  expect(negative.numberOfAssertionsPerformed()).toBe(-1);
  // A kind-less count adds to the total, never to the kinds.
  const counted = await runCounted(() => {
    new TestCase().addToAssertionCount(2);
    Assert.assertTrue(true);
  });
  expect({ assertions: counted.assertions, total: counted.total }).toEqual({ assertions: { assertTrue: 1 }, total: 3 });
  const run = runFixture();
  expect(run.tests.get("testAddToAssertionCountOnly")).toEqual({ report: expectedReport("testAddToAssertionCountOnly", {}), outcome: null });
  expect(run.results.get("testAddToAssertionCountOnly")).toBeNull();
  // expectNotToPerformAssertions with a verified mock object is risky (the mock's count is an assertion) and passes.
  expect(run.tests.get("testRiskyWithMock")).toEqual({ report: expectedReport("testRiskyWithMock", { expectNotToPerformAssertions: 1 }), outcome: null });
  expect(run.results.get("testRiskyWithMock")).toBeNull();
  expect(run.output).toContain(`${CASE_ID}::testRiskyWithMock: risky: This test is not expected to perform assertions but performed 1 assertion\n`);

  // Then every cell, against the signed fixtures.
  const { outputs, problems } = oracleOutputs("XT-assert-16");
  expect(problems).toEqual([]);
  const found: string[] = [];
  found.push(...mismatches("matchers", outputs.get("matchers")!, MATCHER_CELLS, (cell) => runCase47(cell.ts)));
  const strings = outputs.get("strings")!;
  found.push(...mismatches("strings", strings, STRING_CELLS, (cell) => runDirect47(cell.ts)));
  // assertArraySubset records assertThat (decisions/ESC-4.3-1.md item 8): Assert::getCount()'s delta is the port's counted total, all of kind assertThat.
  for (const [index, cell] of SUBSET_CELLS.entries()) {
    const oracle = resultValue(strings, STRING_CELLS.length + index, cell.label) as [unknown, Cell];
    const got = await runCounted(cell.ts);
    const delta = typeof oracle[0] === "number" ? oracle[0] : -1;
    if (oracle[1] !== null || got.error !== null || got.total !== delta || !Bun.deepEquals(got.assertions, { assertThat: delta })) {
      found.push(`strings: ${cell.label}:\n    Oracle ${JSON.stringify(oracle)}\n    got    ${JSON.stringify({ assertions: got.assertions, total: got.total, error: got.error === null ? null : String(got.error.value) })}`);
    }
  }
  expect(found).toEqual([]);
}, CHILD_TIMEOUT);
