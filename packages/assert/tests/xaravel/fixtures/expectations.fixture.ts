// Fixture for XT-assert-11 and XT-assert-12 (Story 4.4). Not collected by the
// root `bun test` (its name matches no test glob); expectations.test.ts runs it:
//
//   bun test ./packages/assert/tests/xaravel/fixtures/expectations.fixture.ts --reporter=junit --reporter-outfile=<file>
//
// Environment:
//   XT_EXPECT_OUT_FILE    one JSON line per finished test: its report and the
//                         error its lifecycle ended with, as a cell
//   XT_EXPECT_PROBE_FILE  the probes, as JSON
//
// Every lifecycle cell of expectation-cells.ts is one declared TestCase test.
// The scope protocol (ESC-4.2-1) is installed here only to see the error each
// test's lifecycle ends with, before bun reports it; it runs the test as is.
import { appendFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Assert, ExpectationFailedException, portedTest, TestCase } from "../../../src/index";
import { EXCEPTION_CELLS, EXPECTATION_CELLS, XtE } from "../expectation-cells";

const outFile = process.env["XT_EXPECT_OUT_FILE"];
const probeFile = process.env["XT_EXPECT_PROBE_FILE"];
const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

let pending: { value: unknown } | null = null;

function shortName(error: object): string {
  const constructor = (Object.getPrototypeOf(error) as { constructor?: unknown } | null)?.constructor;
  const fqcn: unknown = typeof constructor === "function" ? (constructor as unknown as Record<symbol, unknown>)[CLASS_FQCN] : undefined;
  if (typeof fqcn === "string") {
    return fqcn.split("\\").pop()!;
  }
  return typeof constructor === "function" ? constructor.name : typeof error;
}

/** The error as a cell: `[class short name, getMessage(), comparison failure strings or null, getCode()]`. */
function cell(error: unknown): unknown {
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
    appendFileSync(outFile, `${JSON.stringify({ report, outcome: pending === null ? null : cell(pending.value) })}\n`);
  }
  pending = null;
};

const probes: Record<string, unknown> = {};
function probe(name: string, value: unknown): void {
  probes[name] = value;
  if (probeFile !== undefined) {
    writeFileSync(probeFile, JSON.stringify(probes));
  }
}

class XtCase extends TestCase {}

const ID = "Tests\\Unit\\ExpectationsTest";

for (const lifecycle of [...EXCEPTION_CELLS, ...EXPECTATION_CELLS]) {
  portedTest(`${ID}::${lifecycle.label}`, { case: XtCase }, lifecycle.ts);
}

// No statement after the throw runs.
portedTest(`${ID}::testNoStatementAfterThrow`, { case: XtCase }, function () {
  this.expectException(XtE);
  probe("beforeThrow", true);
  const thrower = (): never => {
    throw new XtE("m");
  };
  thrower();
  probe("afterThrow", true);
});

// A skip from setUp ends the test as skipped; the body never runs.
class SkipInSetUp extends TestCase {
  setUp(): void {
    this.markTestSkipped("skipped in setUp");
  }
}
portedTest(`${ID}::testSkippedInSetUp`, { case: SkipInSetUp }, function () {
  probe("bodyAfterSkippedSetUp", true);
});

// expectNotToPerformAssertions, then an assertion: risky, still passing.
portedTest(`${ID}::testRisky`, { case: XtCase }, function () {
  this.expectNotToPerformAssertions();
  this.assertTrue(true);
  this.assertTrue(true);
});

// Output nobody expected is written through to stdout when the buffer stops.
portedTest(`${ID}::testUnexpectedOutput`, { case: XtCase }, function () {
  process.stdout.write("xt-unexpected-output\n");
  this.assertTrue(true);
});

// The Inventory's counting: each Story 4.4 Assert name records itself once; the nested assertFileExists and
// assertJson calls record nothing; fail records `fail`.
portedTest(`${ID}::testCounting`, { case: XtCase }, function () {
  const file = join(tmpdir(), `xt-assert-12-counting-${process.pid}.txt`);
  writeFileSync(file, "abc");
  try {
    this.assertThat(3, this.logicalAnd(this.greaterThanOrEqual(1), this.lessThanOrEqual(5)));
    this.assertFileExists("/");
    this.assertFileDoesNotExist("/xaravel-nonexistent/file.txt");
    this.assertDirectoryExists("/");
    this.assertDirectoryDoesNotExist("/xaravel-nonexistent");
    this.assertStringEqualsFile(file, "abc");
    Assert.assertJson("[]");
    this.assertJsonStringEqualsJsonString("[1]", "[1]");
    try {
      this.fail("counted");
    } catch {
      // fail() counts, whatever catches it.
    }
  } finally {
    rmSync(file, { force: true });
  }
});
