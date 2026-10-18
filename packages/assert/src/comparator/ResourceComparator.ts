// sebastian/comparator 8.4.0's `ResourceComparator` (Story 4.3): two resources are equal only when they are one.
import { isResource } from "../comparison/PhpValues";
import { exportValue } from "../exporter/Exporter";
import { ComparisonFailure } from "../Framework/ComparisonFailure";
import { Comparator } from "./Comparator";

export class ResourceComparator extends Comparator {
  accepts(expected: unknown, actual: unknown): boolean {
    return isResource(expected) && isResource(actual);
  }

  assertEquals(expected: unknown, actual: unknown): void {
    if (actual !== expected) {
      throw new ComparisonFailure(expected, actual, exportValue(expected), exportValue(actual), "");
    }
  }
}
