// sebastian/comparator 8.4.0's `ObjectComparator` (Story 4.3): objects of one
// class are equal when their properties are, compared as arrays. A JS built-in
// has no props form, so it equals only itself (as in PhpComparison).
import { type Entries, isBuiltIn } from "../comparison/PhpComparison";
import { classNameOf, isPhpObject, sameClass } from "../comparison/PhpValues";
import { exportValue, objectToArray } from "../exporter/Exporter";
import { ComparisonFailure } from "../Framework/ComparisonFailure";
import { ArrayComparator } from "./ArrayComparator";
import type { Processed } from "./Comparator";

export class ObjectComparator extends ArrayComparator {
  override accepts(expected: unknown, actual: unknown): boolean {
    return isPhpObject(expected) && isPhpObject(actual);
  }

  protected toArray(object: object): Entries {
    return objectToArray(object);
  }

  override assertEquals(expected: unknown, actual: unknown, delta = 0, canonicalize = false, ignoreCase = false, processed: Processed = []): void {
    const e = expected as object;
    const a = actual as object;
    if (!sameClass(e, a)) {
      throw new ComparisonFailure(expected, actual, exportValue(expected), exportValue(actual), `${exportValue(actual)} is not instance of expected class "${classNameOf(e)}".`);
    }
    if (processed.some(([x, y]) => (x === a && y === e) || (x === e && y === a))) {
      return;
    }
    processed.push([a, e]);
    if (a === e) {
      return;
    }
    if (isBuiltIn(e) && !(e instanceof Error)) {
      throw new ComparisonFailure(expected, actual, exportValue(expected), exportValue(actual), "Failed asserting that two objects are equal.");
    }
    try {
      this.compareEntries(this.toArray(e), this.toArray(a), expected, actual, delta, canonicalize, ignoreCase, processed);
    } catch (error) {
      if (!(error instanceof ComparisonFailure)) {
        throw error;
      }
      throw new ComparisonFailure(
        expected,
        actual,
        `${classNameOf(e)} Object${error.getExpectedAsString().slice(5)}`,
        `${classNameOf(a)} Object${error.getActualAsString().slice(5)}`,
        "Failed asserting that two objects are equal.",
      );
    }
  }
}
