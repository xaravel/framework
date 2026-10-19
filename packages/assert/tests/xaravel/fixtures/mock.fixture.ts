// Fixture for XT-assert-13 (Story 4.4, reworked by Story 4.7 under
// `decisions/ESC-4.4-2.md` item 6): `createMock` returns a PHPUnit mock object
// whether or not @xaravel/mockery is loaded, and Mockery stays reachable
// through `Mockery.mock()`. Not collected by the root `bun test`;
// expectations.test.ts runs it twice:
//
//   XT_MOCK_MOCKERY=1 bun test ./packages/assert/tests/xaravel/fixtures/mock.fixture.ts
//   bun test ./packages/assert/tests/xaravel/fixtures/mock.fixture.ts
//
// Environment:
//   XT_MOCK_MOCKERY   "1": load @xaravel/mockery (a devDependency of @xaravel/assert) first
//   XT_MOCK_OUT_FILE  one JSON line per finished test: its report and the error it ended with
//
// The package is imported through a computed specifier: @xaravel/mockery
// depends on @xaravel/assert, so the assert project cannot reference it for
// types. The scope protocol is installed only to see each test's error.
import { appendFileSync } from "node:fs";
import { portedTest, TestCase } from "../../../src/index";

const outFile = process.env["XT_MOCK_OUT_FILE"];
let mockery: { Mockery: { mock(type: unknown): unknown } } | null = null;
if (process.env["XT_MOCK_MOCKERY"] === "1") {
  const specifier = ["@xaravel", "mockery"].join("/");
  mockery = (await import(specifier)) as { Mockery: { mock(type: unknown): unknown } };
}

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
  const error = pending?.value;
  if (outFile !== undefined) {
    appendFileSync(outFile, `${JSON.stringify({ report, error: pending === null ? null : { name: error instanceof Error ? error.constructor.name : typeof error, message: error instanceof Error ? error.message : String(error) } })}\n`);
  }
  pending = null;
};

export class XtService {
  run(): number {
    return 1;
  }
}

interface Mocked {
  shouldReceive(method: string): { once(): { andReturn(value: unknown): unknown } };
  run(): unknown;
}

class XtCase extends TestCase {}

const ID = "Tests\\Unit\\CreateMockTest";

portedTest(`${ID}::testCreateMockIsPhpUnitDouble`, { case: XtCase }, function () {
  const mock = this.createMock(XtService);
  this.assertInstanceOf(XtService, mock);
  this.assertFalse("shouldReceive" in mock);
  mock.expects(this.once()).method("run").willReturn(5);
  this.assertSame(5, mock.run());
});

portedTest(`${ID}::testUnmetExpectation`, { case: XtCase }, function () {
  this.createMock(XtService).expects(this.once()).method("run");
  this.assertTrue(true);
});

// Mockery itself, beside createMock.
if (mockery !== null) {
  const { Mockery } = mockery;
  portedTest(`${ID}::testMockeryStillReachable`, { case: XtCase }, function () {
    const mock = Mockery.mock(XtService) as Mocked;
    mock.shouldReceive("run").once().andReturn(5);
    this.assertSame(5, mock.run());
  });
}
