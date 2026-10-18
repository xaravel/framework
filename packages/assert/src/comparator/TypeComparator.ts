// sebastian/comparator 8.4.0's `TypeComparator` (Story 4.3): the fallback; values of different types differ.
import { gettype } from "../comparison/PhpValues";
import { shortenedExport } from "../exporter/Exporter";
import { ComparisonFailure } from "../Framework/ComparisonFailure";
import { Comparator } from "./Comparator";

export class TypeComparator extends Comparator {
  accepts(): boolean {
    return true;
  }

  assertEquals(expected: unknown, actual: unknown): void {
    if (gettype(expected) !== gettype(actual)) {
      throw new ComparisonFailure(expected, actual, "", "", `${shortenedExport(actual)} does not match expected type "${gettype(expected)}".`);
    }
  }
}
