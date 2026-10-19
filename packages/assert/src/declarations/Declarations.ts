// Shared machinery of `portedTest` and `xaravelTest` (Story 4.2; FR-2, FR-113, FR-115).
//
// - Test IDs: every full Test ID is declared at most once per process (FR-2),
//   whatever declares it (a loop, a shared helper or another file). So
//   `bun test --rerun-each`, which re-evaluates a test file in the same
//   process, is unsupported; the harness reruns in a fresh process (ESC-4.2-1).
// - Reporter protocol (ESC-4.2-1): `globalThis[Symbol.for('xaravel.harness.report')]`,
//   when a function, receives one frozen report per finished test, passing or
//   failing; its result is awaited. It is read at test run time, never imported.
// - Skips (Story 4.4): a test whose run ends with PHPUnit's `SkippedTest`
//   (`markTestSkipped`) as its error ends as skipped. That is a skip thrown
//   from setUp or the body, or from tearDown when nothing failed before it
//   (the first error wins). Bun 1.4.3 has
//   no run-time skip, so bun records a pass; the zero-assertion rule does not
//   apply, and its report gets a fifth key, `skipped: <message>` (ESC-4.4-2
//   item 1). Every other report has exactly the four keys.
// - Risky (Story 4.4): a test that recorded `expectNotToPerformAssertions` and
//   any other kind passes, with PHPUnit's risky warning on stderr (Laravel's
//   phpunit.xml.dist does not fail risky tests).
// - Late-assertion protocol (Story 5.3): each test's counts end when its body
//   settles. An assertion recorded after that (an un-awaited promise or timer
//   left by the body) is not counted; instead
//   `globalThis[Symbol.for('xaravel.harness.late')]`, when a function,
//   receives a frozen `{ id, kind }`: the full Test ID and the kind, or
//   `null` for the kind-less count. Its result is not awaited and its errors
//   are swallowed, since the test that is running then may be another one.
//   The harness preload installs it (conformance/harness/preload.ts) and fails
//   the test as `late`.
import { test } from "bun:test";
import { isSkippedTest } from "../Framework/Exception/SkippedWithMessageException";
import { type CountedRun, runCounted } from "./AssertionCounter";

const REPORT = Symbol.for("xaravel.harness.report");
/** Captured at load, so a test that reassigns `globalThis.Object` cannot alter reports. */
const freeze = Object.freeze;

/** Every full Test ID declared so far in this process. */
const declared = new Set<string>();

/** One finished test, as the harness reporter receives it. */
export interface TestReport {
  readonly type: "ported" | "xaravel";
  readonly id: string;
  readonly consequence: string | null;
  readonly assertions: Readonly<Record<string, number>>;
  /** Only on a skipped test: the skip message. */
  readonly skipped?: string;
}

/** A test ready to register: its bun:test label, its full Test ID (reported), and its body. */
export interface PlannedTest {
  readonly label: string;
  readonly id: string;
  readonly run: () => unknown;
  /** Bun's per-test timeout in milliseconds, or null (or absent) for bun's default. */
  readonly timeout?: number | null;
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
  for (const { label, id, run, timeout } of planned) {
    const body = async (): Promise<void> => {
      const result: CountedRun = await runCounted(run, id);
      const skip = result.error !== null && isSkippedTest(result.error.value) ? result.error.value.getMessage() : null;
      let reportError: { value: unknown } | null = null;
      try {
        const report: TestReport = skip === null ? { type, id, consequence, assertions: result.assertions } : { type, id, consequence, assertions: result.assertions, skipped: skip };
        await sendReport(freeze(report));
      } catch (thrown) {
        reportError = { value: thrown };
      }
      if (result.error !== null && skip === null) {
        throw result.error.value;
      }
      if (reportError !== null) {
        throw reportError.value;
      }
      if (skip !== null) {
        return;
      }
      const expectedNone = result.assertions["expectNotToPerformAssertions"] ?? 0;
      if (expectedNone > 0 && result.total > expectedNone) {
        const performed = result.total - expectedNone;
        process.stderr.write(`${label}: risky: This test is not expected to perform assertions but performed ${performed} assertion${performed > 1 ? "s" : ""}\n`);
      }
      if (zeroAssertionsFail && result.total === 0) {
        throw new Error(`${label}: Ported Test executed zero assertions (FR-113)`);
      }
    };
    if (timeout === undefined || timeout === null) {
      test(label, body);
    } else {
      test(label, body, timeout);
    }
  }
}

async function sendReport(report: TestReport): Promise<void> {
  const reporter: unknown = (globalThis as Record<symbol, unknown>)[REPORT];
  if (typeof reporter === "function") {
    await (reporter as (report: TestReport) => unknown)(report);
  }
}
