// Fixture for XT-assert-21 (Story 9.11, ESC-5.3-3). Not collected by the root
// `bun test` (its name matches no test glob); late-failures.test.ts runs it
// explicitly:
//
//   bun test ./packages/assert/tests/xaravel/fixtures/late-failures.fixture.ts --reporter=junit
//
// Environment:
//   XT_LATE_FILE   the fake `Symbol.for('xaravel.harness.late')` hook appends one JSON line per late report
//   XT_PROBE_FILE  what the late calls returned or threw, as JSON
//
// XT-fixture-1 leaves a timer that fails assertTrue, fail and a double's
// `expects(never())` rule after its counts have ended; XT-fixture-2 awaits the
// timer, then fails an assertion of its own, which must still throw.
import { appendFileSync, writeFileSync } from "node:fs";
import { Assert, AssertionFailedError, TestCase, xaravelTest } from "../../../src/index";

const lateFile = process.env["XT_LATE_FILE"]!;
const probeFile = process.env["XT_PROBE_FILE"]!;

(globalThis as Record<symbol, unknown>)[Symbol.for("xaravel.harness.late")] = (late: unknown): void => {
  appendFileSync(lateFile, `${JSON.stringify(late)}\n`);
};
(globalThis as Record<symbol, unknown>)[Symbol.for("xaravel.harness.report")] = (): void => undefined;

class Service {
  run(): unknown {
    return "real";
  }
}

/** What `call` returned, or the name of what it threw. */
function outcome(call: () => unknown): unknown {
  try {
    const value = call();
    return { returned: value === undefined ? "undefined" : value };
  } catch (error) {
    return { threw: error instanceof Error ? error.name : String(error) };
  }
}

let release: () => void = () => undefined;
const timerDone = new Promise<void>((resolve) => {
  release = resolve;
});

xaravelTest("XT-fixture-1", "leaves a timer whose assertions fail after the test ended", () => {
  const test = new TestCase();
  const service = test.createMock(Service);
  service.expects(test.never()).method("run");
  Assert.assertTrue(true);
  setTimeout(() => {
    const probes = {
      assertTrue: outcome(() => Assert.assertTrue(false)),
      fail: outcome(() => Assert.fail("x")),
      viaPrototype: outcome(() => test.assertSame(1, 2)),
      double: outcome(() => service.run()),
      skipped: outcome(() => Assert.markTestSkipped("s")),
      typeError: outcome(() => Assert.assertCount("x" as unknown as number, [])),
    };
    writeFileSync(probeFile, JSON.stringify(probes));
    release();
  }, 20);
});

xaravelTest("XT-fixture-2", "awaits the timer, then fails an assertion of its own", async () => {
  await timerDone;
  let caught = false;
  try {
    Assert.assertTrue(false);
  } catch (error) {
    caught = error instanceof AssertionFailedError;
  }
  Assert.assertTrue(caught);
});
