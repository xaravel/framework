// Fixture for retro 4 item 2 (Epic 4 retrospective finding R3). Not collected
// by the root `bun test` (its name matches no test glob); mockery.test.ts runs
// it explicitly:
//
//   bun test ./packages/mockery/tests/xaravel/fixtures/outside-run.fixture.ts --reporter=junit
//
// Environment:
//   XT_OUTSIDE_RUN_SCENARIO     `unmet`, `met` or `body-fails`
//   XT_OUTSIDE_RUN_REPORT_FILE  the harness reporter appends one JSON line per finished test
//   XT_OUTSIDE_RUN_PROBE_FILE   the tests and the afterAll hook write what they saw of the containers
//
// A mock of XtFoo with `shouldReceive('run').once()` is made at module load,
// outside any run. The first Ported Test's run adopts its container (as
// PHPUnit's tearDown closes Mockery's one global container); the second one
// starts with no container.
import { afterAll } from "bun:test";
import { appendFileSync, writeFileSync } from "node:fs";
import { Assert, portedTest } from "@xaravel/assert";
import { Mockery } from "../../../src/index";
import { XtFoo } from "../scenarios";

const scenario = process.env["XT_OUTSIDE_RUN_SCENARIO"];
const reportFile = process.env["XT_OUTSIDE_RUN_REPORT_FILE"];
const probeFile = process.env["XT_OUTSIDE_RUN_PROBE_FILE"];
if (scenario !== "unmet" && scenario !== "met" && scenario !== "body-fails") {
  throw new Error(`XT_OUTSIDE_RUN_SCENARIO must be unmet, met or body-fails, got ${String(scenario)}`);
}

(globalThis as Record<symbol, unknown>)[Symbol.for("xaravel.harness.report")] = (report: unknown): void => {
  if (reportFile !== undefined) {
    appendFileSync(reportFile, `${JSON.stringify(report)}\n`);
  }
};

const probe: Record<string, unknown> = {};

/** Whether the current container (the run's, else the process slot's) holds no mock: `Mockery.self()` throws. */
function noContainer(): boolean {
  try {
    Mockery.self();
    return false;
  } catch (error) {
    return error instanceof Error && error.message === "You have not declared any mocks yet";
  }
}

const outside = Mockery.mock(XtFoo);
outside.shouldReceive("run").once();

const T = "Tests\\Unit\\MockeryOutsideRunTest";

portedTest(`${T}::testAdopts`, {}, function () {
  Assert.assertTrue(true);
  // The adopted container is the run's: the outside mock and one made here share it.
  probe["adoptedMocks"] = Mockery.getContainer().getMocks().length;
  Mockery.mock(XtFoo);
  probe["sharedMocks"] = Mockery.getContainer().getMocks().length;
  if (scenario === "met") {
    (outside as unknown as { run(): unknown }).run();
  }
  if (scenario === "body-fails") {
    throw new Error("body");
  }
});

portedTest(`${T}::testNextRun`, {}, function () {
  Assert.assertTrue(true);
  probe["nextRunEmpty"] = noContainer();
});

afterAll(() => {
  probe["processSlotEmpty"] = noContainer();
  if (probeFile !== undefined) {
    writeFileSync(probeFile, JSON.stringify(probe));
  }
});
