// Fixture for XT-mockery-7 (Story 4.8). Not collected by the root `bun test`
// (its name matches no test glob); mockery.test.ts runs it explicitly:
//
//   bun test ./packages/mockery/tests/xaravel/fixtures/double.fixture.ts --reporter=junit
//
// Environment:
//   XT_DOUBLE_REPORT_FILE  the harness reporter appends one JSON line per finished test
//
// Each Ported Test uses the real @xaravel/assert declarations, which run the
// body through Mockery's run protocol; `Double.enableAutoVerify()` in the body
// stands for VerifiesDoubles' `#[Before]`, and the run performs its `#[After]`
// (ESC-4.8-1 item 2).
import { beforeEach, describe } from "bun:test";
import { appendFileSync } from "node:fs";
import { Assert, portedTest } from "@xaravel/assert";
import { Double, Mockery } from "../../../src/index";
import { XtSvc } from "../double-scenarios";

const reportFile = process.env["XT_DOUBLE_REPORT_FILE"];

(globalThis as Record<symbol, unknown>)[Symbol.for("xaravel.harness.report")] = (report: unknown): void => {
  if (reportFile !== undefined) {
    appendFileSync(reportFile, `${JSON.stringify(report)}\n`);
  }
};

const T = "Tests\\Unit\\DoubleTest";

// A met expects(): verified after the body, one assertTrue.
portedTest(`${T}::testMet`, {}, function () {
  Double.enableAutoVerify();
  const d = Double.for(XtSvc);
  d.expects("m").returns(1);
  d.m();
});

// An unmet expects(): the test fails with Double's message (XT-mockery-7's "expects() never called" scenario), the
// failure counted as one assertTrue.
portedTest(`${T}::testUnmet`, {}, function () {
  Double.enableAutoVerify();
  Double.for(XtSvc).expects("m");
});

// A failing body wins: only ambiguities are checked afterwards, so the unmet expects() adds nothing.
portedTest(`${T}::testBodyFails`, {}, function () {
  Double.enableAutoVerify();
  Double.for(XtSvc).expects("m");
  throw new Error("body failed");
});

// Without enableAutoVerify() nothing is verified: the unmet expects() goes unnoticed.
portedTest(`${T}::testNotEnabled`, {}, function () {
  Double.for(XtSvc).expects("m");
  Assert.assertTrue(true);
});

// A failing body and an ambiguous registration: the body's error is reported; the ambiguity check still runs and
// records its assertTrue.
portedTest(`${T}::testBodyFailsAmbiguous`, {}, function () {
  Double.enableAutoVerify();
  const d = Double.for(XtSvc);
  d.expects("m").with(1);
  d.expects("m").with(1);
  throw new Error("body failed first");
});

// A resolving body with an unmet Mockery once() and an unmet Double expects(): Mockery's close fails first, so only
// ambiguities are checked and no UnsatisfiedExpectation assertTrue is recorded.
portedTest(`${T}::testMockeryWins`, {}, function () {
  Double.enableAutoVerify();
  Double.for(XtSvc).expects("m");
  Mockery.mock().shouldReceive("f").once();
});

// Auto-verify enabled outside any run (a bare beforeEach), with an unmet expects(): the next run adopts it and fails;
// the following test is unaffected.
describe("outside a run", () => {
  let first = true;
  beforeEach(() => {
    if (first) {
      first = false;
      Double.enableAutoVerify();
      Double.for(XtSvc).expects("m");
    }
  });

  portedTest(`${T}::testAdoptsOutsideRun`, {}, function () {
    Assert.assertTrue(true);
  });

  portedTest(`${T}::testAfterAdoption`, {}, function () {
    Assert.assertTrue(true);
  });
});
