// Fixture for XT-mockery-2 (Story 4.5). Not collected by the root `bun test`
// (its name matches no test glob); mockery.test.ts runs it explicitly:
//
//   bun test ./packages/mockery/tests/xaravel/fixtures/mockery.fixture.ts --reporter=junit
//
// Environment:
//   XT_MOCKERY_REPORT_FILE  the harness reporter appends one JSON line per finished test
//   XT_MOCKERY_PROBE_FILE   testPurged writes what it saw of the failed test's container
//   XT_MOCKERY_SCOPE_FILE   when set, a fake `xaravel.scope.run` is installed (as in
//                           @xaravel/assert's declarations fixture); the reporter appends one
//                           JSON line per test: the error that left the test's body while
//                           its frame was still active (Mockery's close runs inside it)
//
// Each Ported Test uses the real @xaravel/assert declarations, which run the
// body through Mockery's test-finish protocol (ESC-4.5-1 item 1).
import { appendFileSync, writeFileSync } from "node:fs";
import { portedTest, xaravelTest } from "@xaravel/assert";
import { type Container, Mockery } from "../../../src/index";
import { XtFoo } from "../scenarios";

const reportFile = process.env["XT_MOCKERY_REPORT_FILE"];
const probeFile = process.env["XT_MOCKERY_PROBE_FILE"];
const scopeFile = process.env["XT_MOCKERY_SCOPE_FILE"];

let activeFrame: string | null = null;
/** The error that rejected the running test's frame function while the frame was active. */
let inFrameError: { frame: string | null; error: string; message: string } | null = null;
if (scopeFile !== undefined) {
  (globalThis as Record<symbol, unknown>)[Symbol.for("xaravel.scope.run")] = async (kind: string, fn: () => unknown): Promise<unknown> => {
    if (activeFrame !== null) {
      throw new Error(`fake scope: frame "${activeFrame}" is already active`);
    }
    activeFrame = kind;
    try {
      return await fn();
    } catch (error) {
      inFrameError = { frame: activeFrame, error: error instanceof Error ? error.name : typeof error, message: error instanceof Error ? error.message : String(error) };
      throw error;
    } finally {
      activeFrame = null;
    }
  };
}

(globalThis as Record<symbol, unknown>)[Symbol.for("xaravel.harness.report")] = (report: unknown): void => {
  if (reportFile !== undefined) {
    appendFileSync(reportFile, `${JSON.stringify(report)}\n`);
  }
  if (scopeFile !== undefined) {
    appendFileSync(scopeFile, `${JSON.stringify({ id: (report as { id: string }).id, inFrameError })}\n`);
  }
  inFrameError = null;
};

class CloseInTearDown {
  tearDown(): void {
    Mockery.close();
  }
}

const T = "Tests\\Unit\\MockeryTest";

// An unmet once(): the test fails with Mockery's message, and the expectation still counts.
portedTest(`${T}::testUnmet`, {}, function () {
  Mockery.mock(XtFoo).shouldReceive("bar").once();
});

// Only met expectations: the test passes and reports them.
portedTest(`${T}::testMet`, {}, function () {
  const m = Mockery.mock(XtFoo);
  m.shouldReceive("bar").once().andReturn(1);
  m.bar();
  m.shouldReceive("baz").twice();
  m.baz();
  m.baz();
  m.shouldReceive("qux");
});

// tearDown closes the container: each expectation counts once.
portedTest(`${T}::testCloseInTearDown`, { case: CloseInTearDown }, function () {
  const m = Mockery.mock(XtFoo);
  m.shouldReceive("bar").once();
  m.bar();
  m.shouldReceive("qux").atLeast().once();
  m.qux();
});

// tearDown's close verifies too: the unmet expectation fails the test, counted once.
portedTest(`${T}::testUnmetCloseInTearDown`, { case: CloseInTearDown }, function () {
  Mockery.mock(XtFoo).shouldReceive("bar").once();
});

// An unmet once() under a scope frame: Mockery's close runs (and fails) inside the frame.
portedTest(`${T}::testUnmetInScopeFrame`, {}, function () {
  Mockery.mock(XtFoo).shouldReceive("bar").once();
});

let failedContainer: Container | null = null;

// A failing body's error wins; the container is purged without verifying.
portedTest(`${T}::testBodyFails`, {}, function () {
  Mockery.mock(XtFoo).shouldReceive("bar").once();
  failedContainer = Mockery.getContainer();
  throw new Error("body failed");
});

portedTest(`${T}::testPurged`, {}, function () {
  const m = Mockery.mock(XtFoo);
  m.shouldReceive("bar").once();
  m.bar();
  if (probeFile !== undefined) {
    const seen = failedContainer as Container | null;
    writeFileSync(probeFile, JSON.stringify({ failedContainerMocks: seen === null ? null : seen.getMocks().length, fresh: seen !== Mockery.getContainer() }));
  }
});

// A Xaravel Test runs through the protocol too.
xaravelTest("XT-fixture-1", "an unmet Mockery expectation fails a Xaravel Test", () => {
  Mockery.mock(XtFoo).shouldReceive("bar").once();
});
