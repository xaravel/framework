// `xaravelTest`: declares a Xaravel Test (Story 4.2; FR-115).
//
// The label is `<id>: <consequence>`. Its assertions are counted and reported
// (ESC-4.2-1), but a Xaravel Test never fails for executing none.
import { registerTests } from "./Declarations";

const XT_ID = /^XT-[a-z0-9]+(-[a-z0-9]+)*-[1-9][0-9]*$/;

/** Declares the Xaravel Test `id` (`XT-<component>-<n>`) that verifies the FR consequence `consequence`. */
export function xaravelTest(id: string, consequence: string, fn: () => unknown): void {
  if (typeof id !== "string" || !XT_ID.test(id)) {
    throw new TypeError(`xaravelTest(): id must match ${String(XT_ID)}, got ${typeof id === "string" ? JSON.stringify(id) : typeof id}`);
  }
  if (typeof consequence !== "string" || consequence.trim() === "") {
    throw new TypeError(`xaravelTest(): ${id} must declare the FR consequence it verifies`);
  }
  if (typeof fn !== "function") {
    throw new TypeError(`xaravelTest(): ${id} needs a test function`);
  }
  registerTests("xaravelTest()", "xaravel", consequence, [{ label: `${id}: ${consequence}`, id, run: () => fn() }], false);
}
