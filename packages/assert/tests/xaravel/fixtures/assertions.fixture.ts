// Fixture for XT-assert-8's counting check (Story 4.3). Not collected by the
// root `bun test` (its name matches no test glob); assertions.test.ts runs it:
//
//   bun test ./packages/assert/tests/xaravel/fixtures/assertions.fixture.ts
//
// Environment:
//   XT_ASSERT_REPORT_FILE  the harness reporter appends one JSON line per finished test
//   XT_ASSERT_PROBE_FILE   the kinds `testEveryAssertion` called, as JSON
//
// `testEveryAssertion` calls each of the 51 assertions once, through the case
// instance (`this.assertX(…)`, the Ported Test form), with the first
// operand cell of one of its matrices. Whether that cell passes, fails or
// throws an argument error does not matter: an assertion records its kind
// first thing, before any argument check, as the Inventory's recorder does.
import { appendFileSync, writeFileSync } from "node:fs";
import { Assert, portedTest } from "../../../src/index";
import { type Matrix, REQUESTS, U, V } from "../operands";

const reportFile = process.env["XT_ASSERT_REPORT_FILE"];
const probeFile = process.env["XT_ASSERT_PROBE_FILE"];

(globalThis as Record<symbol, unknown>)[Symbol.for("xaravel.harness.report")] = (report: { id: string }) => {
  if (reportFile !== undefined) {
    appendFileSync(reportFile, `${JSON.stringify(report)}\n`);
  }
};

class AssertCase extends Assert {}

const counted: Record<string, number> = {};

/** Calls the first cell of `matrix` once, through the case instance `self`, whatever its outcome. */
function runFirstCell(matrix: Matrix, self: AssertCase): void {
  const first = (value: Matrix["rows"]): unknown => (value === "v" ? V[0]![1] : value === "u" ? U[0]![1] : value === null ? null : value[0]![1]);
  try {
    matrix.ts(first(matrix.rows), first(matrix.cols), self);
  } catch {
    // A failure or an argument error counts all the same.
  }
}

portedTest("Tests\\Unit\\AssertionsTest::testEveryAssertion", { case: AssertCase }, function () {
  if (!(this instanceof AssertCase) || typeof this.assertSame !== "function") {
    throw new Error("the case instance has no assertSame");
  }
  this.assertSame(1, 1);
  counted["assertSame"] = 1;
  for (const spec of REQUESTS) {
    for (const matrix of spec.matrices) {
      if (counted[matrix.assertion] === undefined) {
        runFirstCell(matrix, this);
        counted[matrix.assertion] = 1;
      }
    }
  }
  if (probeFile !== undefined) {
    writeFileSync(probeFile, JSON.stringify(counted));
  }
});

// Two booleans: assertNotSame asserts them not equal first, as Assert.php:1842 does. That nested call is not
// counted, as the Inventory's recorder skips calls made by Assert itself; assertNotSame counts once per call, even
// when the nested check fails.
portedTest("Tests\\Unit\\AssertionsTest::testNotSameBooleans", { case: AssertCase }, function () {
  this.assertNotSame(true, false);
  Assert.assertNotSame(false, false);
});

// An argument error (PHPUnit's EmptyStringException for an empty prefix) still counts: the kind is recorded first.
portedTest("Tests\\Unit\\AssertionsTest::testArgumentError", { case: AssertCase }, function () {
  try {
    this.assertStringStartsWith("", "x");
  } catch (error) {
    if (error instanceof Error && error.name === "EmptyStringException") {
      return;
    }
    throw error;
  }
  throw new Error("assertStringStartsWith('', 'x') did not throw");
});

portedTest("Tests\\Unit\\AssertionsTest::testFailingAssertion", { case: AssertCase }, function () {
  this.assertTrue(true);
  this.assertTrue(false, "ctx");
});
