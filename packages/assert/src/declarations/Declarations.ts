// Shared machinery of `portedTest` and `xaravelTest` (Story 4.2; FR-2, FR-113, FR-115).
//
// - Test IDs: every full Test ID is declared at most once per process (FR-2),
//   whatever declares it (a loop, a shared helper or another file). So
//   `bun test --rerun-each`, which re-evaluates a test file in the same
//   process, is unsupported; the harness reruns in a fresh process (ESC-4.2-1).
// - Reporter protocol (ESC-4.2-1): `globalThis[Symbol.for('xaravel.harness.report')]`,
//   when a function, receives one frozen report per finished test, passing or
//   failing; its result is awaited. It is read at test run time, never imported.
import { test } from "bun:test";
import { type CountedRun, runCounted } from "./AssertionCounter";

const REPORT = Symbol.for("xaravel.harness.report");

/** Every full Test ID declared so far in this process. */
const declared = new Set<string>();

/** One finished test, as the harness reporter receives it. */
export interface TestReport {
  readonly type: "ported" | "xaravel";
  readonly id: string;
  readonly consequence: string | null;
  readonly assertions: Readonly<Record<string, number>>;
}

/** A test ready to register: its bun:test label, its full Test ID (reported), and its body. */
export interface PlannedTest {
  readonly label: string;
  readonly id: string;
  readonly run: () => unknown;
}

/**
 * Registers `planned` with bun:test after checking that no Test ID repeats, here
 * or anywhere earlier in the process. Nothing is registered when any check fails.
 */
export function registerTests(
  declaration: string,
  type: TestReport["type"],
  consequence: string | null,
  planned: readonly PlannedTest[],
  zeroAssertionsFail: boolean,
): void {
  const ids = new Set<string>();
  for (const { id } of planned) {
    if (declared.has(id) || ids.has(id)) {
      throw new Error(`${declaration}: Test ID "${id}" is already declared (FR-2)`);
    }
    ids.add(id);
  }
  for (const id of ids) {
    declared.add(id);
  }
  for (const { label, id, run } of planned) {
    test(label, async () => {
      const result: CountedRun = await runCounted(run);
      let reportError: { value: unknown } | null = null;
      try {
        await sendReport(Object.freeze({ type, id, consequence, assertions: result.assertions }));
      } catch (thrown) {
        reportError = { value: thrown };
      }
      if (result.error !== null) {
        throw result.error.value;
      }
      if (reportError !== null) {
        throw reportError.value;
      }
      if (zeroAssertionsFail && result.total === 0) {
        throw new Error(`${label}: Ported Test executed zero assertions (FR-113)`);
      }
    });
  }
}

async function sendReport(report: TestReport): Promise<void> {
  const reporter: unknown = (globalThis as Record<symbol, unknown>)[REPORT];
  if (typeof reporter === "function") {
    await (reporter as (report: TestReport) => unknown)(report);
  }
}
