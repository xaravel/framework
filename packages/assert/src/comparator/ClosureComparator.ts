// sebastian/comparator 8.4.0's `ClosureComparator` (Story 4.3). PHP compares two
// closures by declaration, binding and captured state; a JS function exposes
// none of them, so two functions are equal only when they are one, and the
// declaration site is unknown.
import { exportValue } from "../exporter/Exporter";
import { ComparisonFailure } from "../Framework/ComparisonFailure";
import { Comparator } from "./Comparator";

export class ClosureComparator extends Comparator {
  accepts(expected: unknown, actual: unknown): boolean {
    return typeof expected === "function" && typeof actual === "function";
  }

  assertEquals(expected: unknown, actual: unknown): void {
    if (expected === actual) {
      return;
    }
    const where = (fn: unknown): string => `${(fn as { name?: string }).name || "{closure}"}:0`;
    throw new ComparisonFailure(
      expected,
      actual,
      exportValue(expected).replace(/ \([\s\S]*\)$/, " ()"),
      exportValue(actual).replace(/ \([\s\S]*\)$/, " ()"),
      `Failed asserting that closure declared at ${where(expected)} is equal to closure declared at ${where(actual)}.`,
    );
  }
}
