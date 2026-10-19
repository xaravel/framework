// Fixture for XT-assert-15 and XT-assert-16 (Story 4.7). Not collected by the
// root `bun test` (its name matches no test glob); doubles.test.ts runs it:
//
//   bun test ./packages/assert/tests/xaravel/fixtures/doubles.fixture.ts
//
// Environment:
//   XT_DOUBLE_OUT_FILE    one JSON line per finished test: its report and the
//                         error it ended with (class short name and message)
//   XT_DOUBLE_PROBE_FILE  the probes, as JSON
//
// @xaravel/mockery is not loaded here. A getter on
// `globalThis[Symbol.for('xaravel.mockery.mock')]` counts every read of the
// hook Story 4.4's `createMock` called; Story 4.7's must never read it.
import { appendFileSync, writeFileSync } from "node:fs";
import { portedTest, TestCase } from "../../../src/index";
import { thrownCell, XtDouble } from "../double-cells";
import { XtE } from "../expectation-cells";

const outFile = process.env["XT_DOUBLE_OUT_FILE"];
const probeFile = process.env["XT_DOUBLE_PROBE_FILE"];
const probes: Record<string, unknown> = { mockeryHookReads: 0 };

Object.defineProperty(globalThis, Symbol.for("xaravel.mockery.mock"), {
  get() {
    probes["mockeryHookReads"] = (probes["mockeryHookReads"] as number) + 1;
    return undefined;
  },
  configurable: true,
});

let pending: { value: unknown } | null = null;

(globalThis as Record<symbol, unknown>)[Symbol.for("xaravel.scope.run")] = async (_kind: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (error) {
    pending = { value: error };
    throw error;
  }
};

(globalThis as Record<symbol, unknown>)[Symbol.for("xaravel.harness.report")] = (report: Record<string, unknown>) => {
  if (outFile !== undefined) {
    appendFileSync(outFile, `${JSON.stringify({ report, outcome: pending === null ? null : thrownCell(pending.value) })}\n`);
  }
  pending = null;
  if (probeFile !== undefined) {
    writeFileSync(probeFile, JSON.stringify(probes));
  }
};

class XtCase extends TestCase {}

const ID = "Tests\\Unit\\DoublesTest";

// The same scenarios as double-cells.ts's "met once", "unmet once", "over-count" and "parameter mismatch caught".
portedTest(`${ID}::testMetOnce`, { case: XtCase }, function () {
  const m = this.createMock(XtDouble);
  m.expects(this.once()).method("bar").with(1).willReturn(2);
  probes["metOnceReturned"] = m.bar(1);
});

portedTest(`${ID}::testUnmetOnce`, { case: XtCase }, function () {
  this.createMock(XtDouble).expects(this.once()).method("bar").with(1).willReturn(2);
});

portedTest(`${ID}::testOverCount`, { case: XtCase }, function () {
  const m = this.createMock(XtDouble);
  m.expects(this.once()).method("bar").with(1).willReturn(2);
  m.bar(1);
  m.bar(1);
});

portedTest(`${ID}::testParameterMismatchCaught`, { case: XtCase }, function () {
  const m = this.createMock(XtDouble);
  m.expects(this.once()).method("bar").with("x", { k: 1 });
  try {
    m.bar("y", { k: 2 });
  } catch {
    probes["mismatchCaught"] = true;
  }
});

// A mock object without an expectation counts nothing: the test executed zero assertions (FR-113).
portedTest(`${ID}::testMockWithoutExpectation`, { case: XtCase }, function () {
  this.createMock(XtDouble).baz();
});

// A stub is never verified, and counts nothing either.
portedTest(`${ID}::testStubOnly`, { case: XtCase }, function () {
  const s = this.createStub(XtDouble);
  s.method("bar").willReturn(3);
  probes["stubReturned"] = s.bar();
});

// A mock's count and an assertion kind together: the kind is reported, the mock's count is not.
portedTest(`${ID}::testMockAndAssertion`, { case: XtCase }, function () {
  const m = this.createMock(XtDouble);
  m.expects(this.atLeastOnce()).method("baz").willReturn("doubled");
  this.assertSame("doubled", m.baz());
});

// A body whose exception expectException matched still has its mock objects verified (runTest returns, then verifyTest).
portedTest(`${ID}::testExpectedExceptionThenVerify`, { case: XtCase }, function () {
  this.expectException(XtE);
  this.createMock(XtDouble).expects(this.once()).method("bar");
  throw new XtE("expected");
});

// XT-assert-16: only addToAssertionCount.
portedTest(`${ID}::testAddToAssertionCountOnly`, { case: XtCase }, function () {
  this.addToAssertionCount(3);
});

// expectNotToPerformAssertions with a verified mock: the mock's count makes the test risky, as in PHPUnit.
portedTest(`${ID}::testRiskyWithMock`, { case: XtCase }, function () {
  this.expectNotToPerformAssertions();
  this.createMock(XtDouble).expects(this.never()).method("bar");
});
