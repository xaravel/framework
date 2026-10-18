// Fixture for XT-assert-4..7 (Story 4.2). Not collected by the root `bun test`
// (its name matches no test glob); declarations.test.ts runs it explicitly:
//
//   bun test ./packages/assert/tests/xaravel/fixtures/declarations.fixture.ts --reporter=junit
//
// Environment:
//   XT_ASSERT_REPORT_FILE  the reporter appends one JSON line per finished test
//   XT_ASSERT_PHASE_FILE   one `{id, phase, token}` JSON line per case lifecycle phase
//                          (setUp, body, tearDown), written when the test reports
//   XT_ASSERT_PROBE_FILE   declaration-time probes are written here as JSON
//   XT_ASSERT_NO_SCOPE=1   no scope protocol is installed
//   XT_ASSERT_NO_REPORTER=1  no harness reporter is installed (so no report or
//                          phase file is written)
//
// Every check about `this`, the frame and arguments throws when it fails, so
// the junit result of each test carries the verdict.
import { appendFileSync, writeFileSync } from "node:fs";
import { portedTest, recordAssertion, xaravelTest } from "../../../src/index";

const reportFile = process.env["XT_ASSERT_REPORT_FILE"];
const phaseFile = process.env["XT_ASSERT_PHASE_FILE"];
const probeFile = process.env["XT_ASSERT_PROBE_FILE"];
const withScope = process.env["XT_ASSERT_NO_SCOPE"] !== "1";
const withReporter = process.env["XT_ASSERT_NO_REPORTER"] !== "1";

let activeFrame: string | null = null;
if (withScope) {
  (globalThis as Record<symbol, unknown>)[Symbol.for("xaravel.scope.run")] = async (kind: string, fn: () => unknown): Promise<unknown> => {
    if (activeFrame !== null) {
      throw new Error(`fake scope: frame "${activeFrame}" is already active`);
    }
    activeFrame = kind;
    try {
      return await fn();
    } finally {
      activeFrame = null;
    }
  };
}

// Phases of the running test, each with the token of the case instance that ran
// it; the reporter (called once per finished test, with its full Test ID)
// flushes them to the phase file.
let phases: { phase: string; token: number }[] = [];

const REFUSED = new Set(["XT-fixture-3", "Tests\\Unit\\PointTest::testThrowsAndReporterRefuses", "Tests\\Unit\\PointTest::testNothingAndReporterRefuses"]);
const reporter = (report: unknown): unknown => {
  if (!Object.isFrozen(report)) {
    throw new Error("report is not frozen");
  }
  const { id } = report as { id: string };
  if (reportFile !== undefined) {
    appendFileSync(reportFile, `${JSON.stringify(report)}\n`);
  }
  if (phaseFile !== undefined) {
    for (const { phase, token } of phases) {
      appendFileSync(phaseFile, `${JSON.stringify({ id, phase, token })}\n`);
    }
  }
  phases = [];
  if (REFUSED.has(id)) {
    throw new Error(`reporter refused ${id}`);
  }
  if (id === "XT-fixture-4") {
    return Promise.reject(new Error("reporter rejected XT-fixture-4"));
  }
  return undefined;
};
if (withReporter) {
  (globalThis as Record<symbol, unknown>)[Symbol.for("xaravel.harness.report")] = reporter;
}

function checkFrame(where: string): void {
  const expected = withScope ? "test" : null;
  if (activeFrame !== expected) {
    throw new Error(`${where}: active frame is ${String(activeFrame)}, expected ${String(expected)}`);
  }
}

let instances = 0;

class Point {
  /** Distinct per instance: setUp, body and tearDown of one test must share it. */
  readonly token: number;

  constructor() {
    checkFrame("constructor");
    this.token = ++instances;
  }

  // Async hooks await before checking, so the frame must survive the await and
  // the hook must finish before the body starts (the phase order shows it).
  async setUp(): Promise<void> {
    await Promise.resolve();
    if (!(this instanceof Point)) {
      throw new Error("setUp: this is not a Point");
    }
    checkFrame("setUp");
    phases.push({ phase: "setUp", token: this.token });
  }

  async tearDown(): Promise<void> {
    await Promise.resolve();
    if (!(this instanceof Point)) {
      throw new Error("tearDown: this is not a Point");
    }
    checkFrame("tearDown");
    phases.push({ phase: "tearDown", token: this.token });
  }
}

class ThrowingSetUp extends Point {
  override async setUp(): Promise<void> {
    await super.setUp();
    throw new Error("boom from setUp");
  }
}

// Its only assertion is recorded in setUp, which counts like one in the body.
class AssertingSetUp extends Point {
  override async setUp(): Promise<void> {
    await super.setUp();
    recordAssertion("assertInstanceOf");
  }
}

// A case class with no setUp or tearDown.
class Plain {}

class ThrowingTearDown extends Point {
  override async tearDown(): Promise<void> {
    await super.tearDown();
    throw new Error("boom from tearDown");
  }
}

function bodyChecks(self: unknown): void {
  if (!(self instanceof Point)) {
    throw new Error("body: this is not a Point");
  }
  checkFrame("body");
  phases.push({ phase: "body", token: self.token });
}

const noop = (): void => {};

// Out of any test: a no-op.
recordAssertion("assertTrue");

portedTest("Tests\\Unit\\PointTest::testKeyed", { case: Point, dataset: { one: [1, 2], 'dataset "prompts/list"': [3, 4] } }, function (a: number, b: number) {
  bodyChecks(this);
  if (b !== a + 1) {
    throw new Error(`body: arguments were ${a}, ${b}`);
  }
  recordAssertion("assertTrue");
  recordAssertion("assertSame");
  recordAssertion("assertSame");
});

portedTest("Tests\\Unit\\PointTest::testList", { case: Point, dataset: [[1, 2], [3, 4], 5] }, async function (...args: unknown[]) {
  await Promise.resolve();
  bodyChecks(this);
  const ok = args.length === 2 ? args[1] === (args[0] as number) + 1 : args.length === 1 && args[0] === 5;
  if (!ok) {
    throw new Error(`body: arguments were ${JSON.stringify(args)}`);
  }
  recordAssertion("assertEquals");
});

// A provider mixing int and named keys, like ValidationValidatorTest::testExcludeIf.
portedTest(
  "Tests\\Unit\\PointTest::testMap",
  {
    case: Point,
    dataset: new Map<number | string, unknown>([
      [0, ["zero"]],
      [1, ["one"]],
      ["nested-01", ["nested"]],
    ]),
  },
  function (word: unknown) {
    bodyChecks(this);
    if (typeof word !== "string") {
      throw new Error(`body: argument was ${String(word)}`);
    }
    recordAssertion("assertIsString");
  },
);

portedTest("Tests\\Unit\\PointTest::testBare", {}, function (...args: unknown[]) {
  checkFrame("body");
  if (this !== undefined || args.length !== 0) {
    throw new Error("body: expected no case and no arguments");
  }
  recordAssertion("assertNull");
});

// Declaration-time probes (XT-assert-7): each must throw before registering.
function probe(fn: () => void): { name: string; message: string } | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof Error ? { name: error.name, message: error.message } : { name: typeof error, message: String(error) };
  }
}

// One Test ID declared twice from a loop, and twice through a shared helper: the
// first declaration registers, the second throws the FR-2 Error and registers nothing.
const loopProbes: ({ name: string; message: string } | null)[] = [];
for (let round = 0; round < 2; round++) {
  loopProbes.push(
    probe(() =>
      portedTest("Tests\\Unit\\PointTest::testLoop", {}, function () {
        checkFrame("body");
        recordAssertion("assertTrue");
      }),
    ),
  );
}
function declareHelper(): void {
  portedTest("Tests\\Unit\\PointTest::testHelper", {}, function () {
    checkFrame("body");
    recordAssertion("assertTrue");
  });
}
const helperProbes = [probe(declareHelper), probe(declareHelper)];

portedTest("Tests\\Unit\\PointTest::testPlainCase", { case: Plain }, function () {
  checkFrame("body");
  if (!(this instanceof Plain)) {
    throw new Error("body: this is not a Plain");
  }
  recordAssertion("assertTrue");
});

portedTest("Tests\\Unit\\PointTest::testSetUpAsserts", { case: AssertingSetUp }, function () {
  bodyChecks(this);
});

portedTest("Tests\\Unit\\PointTest::testNothing", { case: Point }, function () {
  bodyChecks(this);
});

portedTest("Tests\\Unit\\PointTest::testThrows", { case: Point }, function () {
  bodyChecks(this);
  throw new Error("boom from the body");
});

portedTest("Tests\\Unit\\PointTest::testThrowsAfterAssertion", {}, function () {
  recordAssertion("assertCount");
  throw new Error("boom after an assertion");
});

portedTest("Tests\\Unit\\PointTest::testSetUpThrows", { case: ThrowingSetUp }, function () {
  bodyChecks(this);
  recordAssertion("assertTrue");
});

portedTest("Tests\\Unit\\PointTest::testTearDownThrows", { case: ThrowingTearDown }, function () {
  bodyChecks(this);
  recordAssertion("assertTrue");
});

portedTest("Tests\\Unit\\PointTest::testBodyAndTearDownThrow", { case: ThrowingTearDown }, function () {
  bodyChecks(this);
  throw new Error("boom from the body before tearDown");
});

portedTest("Tests\\Unit\\PointTest::testThrowsAndReporterRefuses", {}, function () {
  throw new Error("boom before the reporter");
});

// No assertion and no throw: the reporter's error wins over the zero-assertions failure.
portedTest("Tests\\Unit\\PointTest::testNothingAndReporterRefuses", {}, noop);

xaravelTest("XT-fixture-1", "an assertion-free Xaravel Test passes", () => {
  if (activeFrame !== null) {
    throw new Error("xaravelTest opened a frame");
  }
});

xaravelTest("XT-fixture-2", "a Xaravel Test reports its assertions", async () => {
  await Promise.resolve();
  recordAssertion("assertSame");
});

xaravelTest("XT-fixture-3", "a throwing reporter fails the test", noop);

xaravelTest("XT-fixture-4", "a rejecting reporter fails the test", noop);

const probes = {
  duplicateLoop: loopProbes,
  duplicateHelper: helperProbes,
  duplicateBare: probe(() => portedTest("Tests\\Unit\\PointTest::testBare", {}, noop)),
  duplicateDatasetLabel: probe(() => portedTest("Tests\\Unit\\PointTest::testKeyed#one", {}, noop)),
  // Collides on `#one` only, so `testKeyed#fresh` must not be registered either.
  duplicatePartial: probe(() => portedTest("Tests\\Unit\\PointTest::testKeyed", { dataset: { fresh: [1, 2], one: [1, 2] } }, noop)),
  duplicateXaravel: probe(() => xaravelTest("XT-fixture-1", "another consequence", noop)),
  emptyConsequence: probe(() => xaravelTest("XT-fixture-99", "", noop)),
  blankConsequence: probe(() => xaravelTest("XT-fixture-98", "   ", noop)),
  badDataset: probe(() => portedTest("Tests\\Unit\\PointTest::testBad", { dataset: { ok: [1], "7": [2] } }, noop)),
};
if (probeFile !== undefined) {
  writeFileSync(probeFile, JSON.stringify(probes));
}
