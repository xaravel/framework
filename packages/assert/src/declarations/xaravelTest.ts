// `xaravelTest`: declares a Xaravel Test (Story 4.2; FR-115).
//
// The label is `<id>: <consequence>`. Its assertions are counted and reported
// (ESC-4.2-1), but a Xaravel Test never fails for executing none. Its body
// runs through Mockery's test-finish protocol when @xaravel/mockery is loaded,
// as a Ported Test's does (ESC-4.5-1 item 1). A `markTestSkipped` ends it as
// skipped, as it ends a Ported Test (Declarations.ts, Story 4.4). The optional
// `timeout` is bun's per-test timeout in milliseconds (Story 5.9).
import { registerTests } from "./Declarations";
import { runWithMockery } from "./portedTest";

const XT_ID = /^XT-[a-z0-9]+(-[a-z0-9]+)*-[1-9][0-9]*$/;

/** Declares the Xaravel Test `id` (`XT-<component>-<n>`) that verifies the FR consequence `consequence`. */
export function xaravelTest(id: string, consequence: string, fn: () => unknown, timeout?: number): void {
  if (typeof id !== "string" || !XT_ID.test(id)) {
    throw new TypeError(`xaravelTest(): id must match ${String(XT_ID)}, got ${typeof id === "string" ? JSON.stringify(id) : typeof id}`);
  }
  if (typeof consequence !== "string" || consequence.trim() === "") {
    throw new TypeError(`xaravelTest(): ${id} must declare the FR consequence it verifies`);
  }
  if (typeof fn !== "function") {
    throw new TypeError(`xaravelTest(): ${id} needs a test function`);
  }
  if (timeout !== undefined && (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0)) {
    throw new TypeError(`xaravelTest(): ${id}'s timeout must be a positive number of milliseconds, got ${String(timeout)}`);
  }
  registerTests("xaravelTest()", "xaravel", consequence, [{ label: `${id}: ${consequence}`, id, run: () => runWithMockery(fn), timeout: timeout ?? null }], false);
}
