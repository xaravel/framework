// Xaravel Tests for Story 4.2 (`portedTest`, `xaravelTest` and assertion
// counting; FR-2, FR-113, FR-115, AD-15). One test per AC, in order.
//
// XT-assert-4..6 run `fixtures/declarations.fixture.ts` in a child `bun test`
// with the junit reporter, then read the junit names and failures, the report
// file (the harness reporter protocol) and the declaration probes. Like 4.1's
// tests these are plain bun:test: `xaravelTest` is not used to test itself.
import { afterAll, expect } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { portedTest, recordAssertion, xaravelTest } from "../../src/index";

const root = resolve(import.meta.dir, "..", "..", "..", "..");
const FIXTURE = "./packages/assert/tests/xaravel/fixtures/declarations.fixture.ts";
const POINT = "Tests\\Unit\\PointTest";
/** Each test spawns (or may spawn) a child `bun test`; bun's 5 s default is too tight. */
const CHILD_TIMEOUT = 60_000;
/** spawnSync blocks the event loop, so the child is killed first and the test fails with its output. */
const SPAWN_TIMEOUT = 50_000;

interface FixtureRun {
  exitCode: number;
  output: string;
  /** junit test name -> failure message, or null when it passed. */
  results: Map<string, string | null>;
  reports: Record<string, unknown>[];
  phases: { id: string; phase: string; token: number }[];
  probes: Record<string, unknown>;
}

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function unescapeXml(text: string): string {
  return text.replace(/&(#\d+|quot|amp|lt|gt|apos);/g, (_, entity: string) => {
    switch (entity) {
      case "quot":
        return '"';
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "apos":
        return "'";
      default:
        return String.fromCodePoint(Number(entity.slice(1)));
    }
  });
}

interface ChildRun {
  exitCode: number;
  output: string;
}

/** Runs `bun test <fixture> ...args` from the repo root; a child still running after SPAWN_TIMEOUT is killed. */
function spawnFixture(fixture: string, args: string[], env: Record<string, string | undefined>): ChildRun {
  const child = Bun.spawnSync([process.execPath, "test", fixture, ...args], { cwd: root, env, stdout: "pipe", stderr: "pipe", timeout: SPAWN_TIMEOUT });
  const output = child.stdout.toString() + child.stderr.toString();
  if (child.exitedDueToTimeout === true) {
    throw new Error(`the fixture run was killed after ${SPAWN_TIMEOUT} ms; its output:\n${output}`);
  }
  return { exitCode: child.exitCode, output };
}

/** Reads a file the child should have written; fails with the child's own output when it is missing. */
function readChildFile(path: string, what: string, child: ChildRun): string {
  if (!existsSync(path)) {
    throw new Error(`the fixture run wrote no ${what} (exit ${child.exitCode}); its output:\n${child.output}`);
  }
  return readFileSync(path, "utf8");
}

function jsonLines(text: string): Record<string, unknown>[] {
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** `scope`: fake scope protocol and reporter; `noScope`: reporter only; `noReporter`: scope protocol only. */
type FixtureMode = "scope" | "noScope" | "noReporter";

const runs = new Map<FixtureMode, FixtureRun>();
function runFixture(mode: FixtureMode): FixtureRun {
  const cached = runs.get(mode);
  if (cached !== undefined) {
    return cached;
  }
  const dir = mkdtempSync(join(tmpdir(), "xt-assert-"));
  tempDirs.push(dir);
  const junit = join(dir, "junit.xml");
  const reportFile = join(dir, "reports.jsonl");
  const phaseFile = join(dir, "phases.jsonl");
  const probeFile = join(dir, "probes.json");
  const env: Record<string, string | undefined> = {
    ...process.env,
    XT_ASSERT_REPORT_FILE: reportFile,
    XT_ASSERT_PHASE_FILE: phaseFile,
    XT_ASSERT_PROBE_FILE: probeFile,
  };
  delete env["XT_ASSERT_NO_SCOPE"];
  delete env["XT_ASSERT_NO_REPORTER"];
  if (mode === "noScope") {
    env["XT_ASSERT_NO_SCOPE"] = "1";
  }
  const withReporter = mode !== "noReporter";
  if (!withReporter) {
    env["XT_ASSERT_NO_REPORTER"] = "1";
  }
  const child = spawnFixture(FIXTURE, ["--reporter=junit", `--reporter-outfile=${junit}`], env);
  const xml = readChildFile(junit, "junit report", child);
  const results = new Map<string, string | null>();
  const testcase = /<testcase name="([^"]*)"[^>]*?(\/>|>\s*<failure[^>]*?message="([^"]*)")/g;
  for (const match of xml.matchAll(testcase)) {
    const name = unescapeXml(match[1] ?? "");
    expect(results.has(name)).toBe(false);
    results.set(name, match[3] === undefined ? null : unescapeXml(match[3]));
  }
  // Without a reporter nothing is sent, so neither file may exist.
  if (!withReporter) {
    expect({ reportFile: existsSync(reportFile), phaseFile: existsSync(phaseFile) }).toEqual({ reportFile: false, phaseFile: false });
  }
  const reports = withReporter ? jsonLines(readChildFile(reportFile, "report file", child)) : [];
  const phases = withReporter ? (jsonLines(readChildFile(phaseFile, "phase file", child)) as FixtureRun["phases"]) : [];
  const probes = JSON.parse(readChildFile(probeFile, "probe file", child)) as FixtureRun["probes"];
  const run: FixtureRun = { exitCode: child.exitCode, output: child.output, results, reports, phases, probes };
  runs.set(mode, run);
  return run;
}

const PASSING = [
  `${POINT}::testKeyed#one`,
  `${POINT}::testKeyed#dataset "prompts/list"`,
  `${POINT}::testList#0`,
  `${POINT}::testList#1`,
  `${POINT}::testList#2`,
  `${POINT}::testMap#0`,
  `${POINT}::testMap#1`,
  `${POINT}::testMap#nested-01`,
  `${POINT}::testBare`,
  `${POINT}::testLoop`,
  `${POINT}::testHelper`,
  `${POINT}::testPlainCase`,
  `${POINT}::testSetUpAsserts`,
];
const FAILING_PORTED = [
  `${POINT}::testNothing`,
  `${POINT}::testThrows`,
  `${POINT}::testThrowsAfterAssertion`,
  `${POINT}::testSetUpThrows`,
  `${POINT}::testTearDownThrows`,
  `${POINT}::testBodyAndTearDownThrow`,
  `${POINT}::testThrowsAndReporterRefuses`,
  `${POINT}::testNothingAndReporterRefuses`,
];
const PASSING_XARAVEL = ["XT-fixture-1: an assertion-free Xaravel Test passes", "XT-fixture-2: a Xaravel Test reports its assertions"];
const FAILING_XARAVEL = ["XT-fixture-3: a throwing reporter fails the test", "XT-fixture-4: a rejecting reporter fails the test"];

const FULL = ["setUp", "body", "tearDown"];
/** The exact lifecycle phases of every case-backed test, in run order. */
const PHASES: [string, string[]][] = [
  [`${POINT}::testKeyed#one`, FULL],
  [`${POINT}::testKeyed#dataset "prompts/list"`, FULL],
  [`${POINT}::testList#0`, FULL],
  [`${POINT}::testList#1`, FULL],
  [`${POINT}::testList#2`, FULL],
  [`${POINT}::testMap#0`, FULL],
  [`${POINT}::testMap#1`, FULL],
  [`${POINT}::testMap#nested-01`, FULL],
  [`${POINT}::testSetUpAsserts`, FULL],
  [`${POINT}::testNothing`, FULL],
  // tearDown runs after a throwing body, and after a throwing setUp (PHPUnit's runBare).
  [`${POINT}::testThrows`, FULL],
  [`${POINT}::testSetUpThrows`, ["setUp", "tearDown"]],
  [`${POINT}::testTearDownThrows`, FULL],
  [`${POINT}::testBodyAndTearDownThrow`, FULL],
];

xaravelTest("XT-assert-4", "portedTest labels each dataset row with its full Test ID, binds this to the case instance through setUp, body and tearDown, and runs inside the scope protocol's test frame when one is installed (AD-15.1, AD-15.9)", () => {
  for (const mode of ["scope", "noScope"] as const) {
    const withScope = mode === "scope";
    const run = runFixture(mode);
    // Exactly these tests were registered, in declaration order; the colliding and invalid declarations registered nothing.
    expect([...run.results.keys()]).toEqual([...PASSING, ...FAILING_PORTED, ...PASSING_XARAVEL, ...FAILING_XARAVEL]);
    // The fixture throws from the constructor, setUp, body or tearDown when `this` is not a Point, the arguments
    // are wrong, or the active frame is not `test` (with the protocol) / absent (without it).
    for (const name of [...PASSING, ...PASSING_XARAVEL]) {
      expect({ withScope, name, failure: run.results.get(name) }).toEqual({ withScope, name, failure: null });
    }
    // setUp, the body and tearDown ran exactly as PHPUnit's runBare runs them, for every case-backed test.
    const expectedPhases = PHASES.flatMap(([id, phases]) => phases.map((phase) => ({ id, phase })));
    expect({ withScope, phases: run.phases.map(({ id, phase }) => ({ id, phase })) }).toEqual({ withScope, phases: expectedPhases });
    // setUp, body and tearDown of one test share one case instance; every test (and dataset row) gets its own.
    const tokens = new Map<string, Set<number>>();
    for (const { id, token } of run.phases) {
      tokens.set(id, (tokens.get(id) ?? new Set()).add(token));
    }
    expect({ withScope, sizes: [...tokens.values()].map((set) => set.size) }).toEqual({ withScope, sizes: PHASES.map(() => 1) });
    const perTest = [...tokens.values()].map((set) => [...set][0]);
    expect(new Set(perTest).size).toBe(PHASES.length);
    expect(tokens.get(`${POINT}::testList#0`)).not.toEqual(tokens.get(`${POINT}::testList#1`));
  }
}, CHILD_TIMEOUT);

xaravelTest("XT-assert-5", "a Ported Test that executes zero assertions fails with 'zero assertions'; a throwing body fails with its own error; an assertion-free Xaravel Test passes (FR-113.1)", () => {
  for (const mode of ["scope", "noScope"] as const) {
    const { results, exitCode } = runFixture(mode);
    expect(results.get(`${POINT}::testNothing`)).toBe(`${POINT}::testNothing: Ported Test executed zero assertions (FR-113)`);
    expect(results.get(`${POINT}::testThrows`)).toBe("boom from the body");
    expect(results.get(`${POINT}::testThrowsAfterAssertion`)).toBe("boom after an assertion");
    // The first error wins: setUp's, else the body's over tearDown's, else tearDown's; a lifecycle error beats the reporter's.
    expect(results.get(`${POINT}::testSetUpThrows`)).toBe("boom from setUp");
    expect(results.get(`${POINT}::testTearDownThrows`)).toBe("boom from tearDown");
    expect(results.get(`${POINT}::testBodyAndTearDownThrow`)).toBe("boom from the body before tearDown");
    expect(results.get(`${POINT}::testThrowsAndReporterRefuses`)).toBe("boom before the reporter");
    // A reporter error beats the zero-assertions failure.
    expect(results.get(`${POINT}::testNothingAndReporterRefuses`)).toBe(`reporter refused ${POINT}::testNothingAndReporterRefuses`);
    expect(results.get("XT-fixture-1: an assertion-free Xaravel Test passes")).toBeNull();
    // A reporter that throws, or returns a rejected promise, fails its test.
    expect(results.get("XT-fixture-3: a throwing reporter fails the test")).toBe("reporter refused XT-fixture-3");
    expect(results.get("XT-fixture-4: a rejecting reporter fails the test")).toBe("reporter rejected XT-fixture-4");
    expect(exitCode).not.toBe(0);
  }
}, CHILD_TIMEOUT);

xaravelTest("XT-assert-6", "every finished test, passing or failing, reports its type, full Test ID, consequence and assertion-kind multiset (keys sorted) to the harness reporter (FR-2.2)", () => {
  const keyed = { assertSame: 2, assertTrue: 1 };
  const ported = (id: string, assertions: Record<string, number>): Record<string, unknown> => ({ type: "ported", id: `${POINT}::${id}`, consequence: null, assertions });
  const expected = [
    ported("testKeyed#one", keyed),
    ported('testKeyed#dataset "prompts/list"', keyed),
    ported("testList#0", { assertEquals: 1 }),
    ported("testList#1", { assertEquals: 1 }),
    ported("testList#2", { assertEquals: 1 }),
    ported("testMap#0", { assertIsString: 1 }),
    ported("testMap#1", { assertIsString: 1 }),
    ported("testMap#nested-01", { assertIsString: 1 }),
    ported("testBare", { assertNull: 1 }),
    ported("testLoop", { assertTrue: 1 }),
    ported("testHelper", { assertTrue: 1 }),
    ported("testPlainCase", { assertTrue: 1 }),
    // Recorded in setUp: counted like a body assertion.
    ported("testSetUpAsserts", { assertInstanceOf: 1 }),
    ported("testNothing", {}),
    ported("testThrows", {}),
    ported("testThrowsAfterAssertion", { assertCount: 1 }),
    ported("testSetUpThrows", {}),
    ported("testTearDownThrows", { assertTrue: 1 }),
    ported("testBodyAndTearDownThrow", {}),
    ported("testThrowsAndReporterRefuses", {}),
    ported("testNothingAndReporterRefuses", {}),
    { type: "xaravel", id: "XT-fixture-1", consequence: "an assertion-free Xaravel Test passes", assertions: {} },
    { type: "xaravel", id: "XT-fixture-2", consequence: "a Xaravel Test reports its assertions", assertions: { assertSame: 1 } },
    { type: "xaravel", id: "XT-fixture-3", consequence: "a throwing reporter fails the test", assertions: {} },
    { type: "xaravel", id: "XT-fixture-4", consequence: "a rejecting reporter fails the test", assertions: {} },
  ];
  for (const mode of ["scope", "noScope"] as const) {
    const { reports } = runFixture(mode);
    expect(reports).toEqual(expected);
    // Key order on the wire: the payload's fields, then sorted assertion kinds (the fixture records assertTrue first).
    expect(reports.map((report) => JSON.stringify(Object.keys(report)))).toEqual(expected.map(() => '["type","id","consequence","assertions"]'));
    expect(Object.keys(reports[0]?.["assertions"] as object)).toEqual(["assertSame", "assertTrue"]);
  }

  // Without a reporter (runFixture checks that no report file is written) every test gets the same verdict,
  // except those the reporter refused or rejected, which now pass or fail on their own merits.
  const withReporter = runFixture("scope").results;
  const without = runFixture("noReporter").results;
  const ownMerits = new Map<string, string | null>([
    [`${POINT}::testNothingAndReporterRefuses`, `${POINT}::testNothingAndReporterRefuses: Ported Test executed zero assertions (FR-113)`],
    ["XT-fixture-3: a throwing reporter fails the test", null],
    ["XT-fixture-4: a rejecting reporter fails the test", null],
  ]);
  const expectedWithout = [...withReporter].map(([name, failure]): [string, string | null] => [name, ownMerits.has(name) ? (ownMerits.get(name) ?? null) : failure]);
  expect([...without]).toEqual(expectedWithout);
}, CHILD_TIMEOUT);

xaravelTest("XT-assert-7", "xaravelTest throws TypeError at declaration when the FR consequence is empty, and bad ids, datasets, kinds and duplicate Test IDs throw before any test is registered (FR-2.1, FR-115.1)", () => {
  const fn = (): void => {};
  expect(() => xaravelTest("XT-assert-99", "", fn)).toThrow(TypeError);
  expect(() => xaravelTest("XT-assert-99", "   ", fn)).toThrow(TypeError);
  // The optional timeout (Story 5.9) must be a positive number of milliseconds.
  for (const timeout of [0, -1, Number.NaN]) {
    expect(() => xaravelTest("XT-assert-99", "a consequence", fn, timeout)).toThrow(TypeError);
  }
  for (const id of ["assert-4", "XT-assert-0", "XT-assert-01", "XT-Assert-4", "XT--4", "XT-assert", ""]) {
    expect(() => xaravelTest(id, "a consequence", fn)).toThrow(TypeError);
  }
  expect(() => portedTest("", {}, fn)).toThrow(TypeError);
  expect(() => portedTest("   ", {}, fn)).toThrow(TypeError);
  // A list with a hole at index 1.
  const sparse: unknown[] = [[1]];
  sparse[2] = [2];
  const badDatasets: unknown[] = [
    {},
    [],
    sparse,
    { "0": [1] },
    { ok: [1], "-3": [2] },
    "rows",
    7,
    null,
    new Map(),
    // An integer-like string key names the int, so "1" and 1 collide.
    new Map<number | string, unknown>([
      [1, [1]],
      ["1", [2]],
    ]),
    new Map([[-1, [1]]]),
    new Map([[1.5, [1]]]),
    new Map([["", [1]]]),
    new Map([[Symbol("k"), [1]]]),
  ];
  for (const dataset of badDatasets) {
    expect(() => portedTest("A::t", { dataset: dataset as never }, fn)).toThrow(TypeError);
  }
  expect(() => portedTest("A::t", { case: "Point" as never }, fn)).toThrow(TypeError);
  expect(() => portedTest("A::t", null as never, fn)).toThrow(TypeError);
  expect(() => portedTest("A::t", {}, null as never)).toThrow(TypeError);

  // recordAssertion: a bad kind throws; outside a declared test a valid kind is a no-op.
  for (const kind of ["", "1assert", "assert-same", "assert same", 7]) {
    expect(() => recordAssertion(kind as never)).toThrow(TypeError);
  }
  expect(recordAssertion("assertTrue")).toBeUndefined();

  // In the fixture: the empty and blank consequences, a bad dataset and every duplicate Test ID (including one
  // declared twice from a loop and twice through a helper) threw at declaration, and XT-assert-4 shows none of
  // them registered a test (each ID appears once among the junit names).
  const duplicate = (id: string): { name: string; message: string } => ({ name: "Error", message: `portedTest(): Test ID "${POINT}::${id}" is already declared (FR-2)` });
  const expectedProbes = {
    duplicateLoop: [null, duplicate("testLoop")],
    duplicateHelper: [null, duplicate("testHelper")],
    duplicateBare: { name: "Error", message: `portedTest(): Test ID "${POINT}::testBare" is already declared (FR-2)` },
    duplicateDatasetLabel: { name: "Error", message: `portedTest(): Test ID "${POINT}::testKeyed#one" is already declared (FR-2)` },
    duplicatePartial: { name: "Error", message: `portedTest(): Test ID "${POINT}::testKeyed#one" is already declared (FR-2)` },
    duplicateXaravel: { name: "Error", message: 'xaravelTest(): Test ID "XT-fixture-1" is already declared (FR-2)' },
    emptyConsequence: { name: "TypeError", message: "xaravelTest(): XT-fixture-99 must declare the FR consequence it verifies" },
    blankConsequence: { name: "TypeError", message: "xaravelTest(): XT-fixture-98 must declare the FR consequence it verifies" },
    badDataset: { name: "TypeError", message: `portedTest(): ${POINT}::testBad dataset key "7" is integer-like; use a list for indexed rows` },
  };
  for (const mode of ["scope", "noScope"] as const) {
    expect({ mode, probes: runFixture(mode).probes }).toEqual({ mode, probes: expectedProbes });
  }
}, CHILD_TIMEOUT);
