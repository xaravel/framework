// sebastian/comparator 8.4.0's `ArrayComparator` (Story 4.3): arrays are equal
// when each key of the expected array exists in the actual one with an equal
// value, and the actual one has no other key; key order does not matter.
// `canonicalize` sorts lists by value (PHP 8's stable `usort`) and maps by key
// (`ksort`) first.
import { arrayEntries, type Entries, isPhpArray, type Key } from "../comparison/PhpComparison";
import { phpCompare, smartCompare } from "../comparison/PhpOrder";
import { classNameOf, isFloat, isInt, isPhpObject } from "../comparison/PhpValues";
import { exportValue, shortenedExport } from "../exporter/Exporter";
import { serialize } from "../exporter/VarExport";
import { ComparisonFailure } from "../Framework/ComparisonFailure";
import { Comparator, type Processed } from "./Comparator";

function isList(entries: Entries): boolean {
  return entries.every(([key], index) => key === index);
}

function typeOrder(value: unknown): number {
  if (value === null) {
    return 0;
  }
  if (typeof value === "boolean") {
    return 1;
  }
  if (isInt(value) || isFloat(value)) {
    return 2;
  }
  if (typeof value === "string") {
    return 3;
  }
  if (typeof value === "object" && isPhpArray(value)) {
    return 4;
  }
  return isPhpObject(value) ? 5 : 6;
}

function indent(lines: string): string {
  return lines.replace(/\n/g, "\n    ").trim();
}

export class ArrayComparator extends Comparator {
  accepts(expected: unknown, actual: unknown): boolean {
    return typeof expected === "object" && expected !== null && isPhpArray(expected) && typeof actual === "object" && actual !== null && isPhpArray(actual);
  }

  private compare(a: unknown, b: unknown): number {
    const orderA = typeOrder(a);
    const orderB = typeOrder(b);
    if (orderA !== orderB) {
      return Math.sign(orderA - orderB);
    }
    if (isPhpObject(a) && isPhpObject(b)) {
      const byClass = smartCompare(classNameOf(a), classNameOf(b));
      if (byClass !== 0) {
        return byClass;
      }
      try {
        this.factory().getComparatorFor(a, b).assertEquals(a, b);
        return 0;
      } catch (error) {
        if (!(error instanceof ComparisonFailure)) {
          throw error;
        }
        return phpCompare(serialize(a), serialize(b));
      }
    }
    if (orderA === 4) {
      return phpCompare(serialize(a), serialize(b));
    }
    return phpCompare(a, b);
  }

  assertEquals(expected: unknown, actual: unknown, delta = 0, canonicalize = false, ignoreCase = false, processed: Processed = []): void {
    this.compareEntries(arrayEntries(expected as object), arrayEntries(actual as object), expected, actual, delta, canonicalize, ignoreCase, processed);
  }

  protected compareEntries(
    expectedEntries: Entries,
    actualEntries: Entries,
    expected: unknown,
    actual: unknown,
    delta: number,
    canonicalize: boolean,
    ignoreCase: boolean,
    processed: Processed,
  ): void {
    let expectedList = [...expectedEntries];
    let actualList = [...actualEntries];
    let list = false;
    if (canonicalize) {
      list = isList(expectedList) && isList(actualList);
      if (list) {
        const byValue = (a: readonly [Key, unknown], b: readonly [Key, unknown]): number => this.compare(a[1], b[1]);
        expectedList = expectedList.sort(byValue).map(([, value], index) => [index, value] as const);
        actualList = actualList.sort(byValue).map(([, value], index) => [index, value] as const);
      } else {
        const byKey = (a: readonly [Key, unknown], b: readonly [Key, unknown]): number => phpCompare(a[0], b[0]);
        expectedList.sort(byKey);
        actualList.sort(byKey);
      }
    }
    const actualMap = new Map<Key, unknown>(actualList);
    const remaining = new Map<Key, unknown>(actualList);
    let actualAsString = "Array (\n";
    let expectedAsString = "Array (\n";
    let equal = true;
    const line = (key: Key, text: string): string => (canonicalize && list ? `    ${text}\n` : `    ${exportValue(key)} => ${text}\n`);
    for (const [key, value] of expectedList) {
      remaining.delete(key);
      if (!actualMap.has(key)) {
        expectedAsString += line(key, shortenedExport(value));
        equal = false;
        continue;
      }
      const other = actualMap.get(key);
      try {
        this.factory().getComparatorFor(value, other).assertEquals(value, other, delta, canonicalize, ignoreCase, processed);
        expectedAsString += line(key, shortenedExport(value));
        actualAsString += line(key, shortenedExport(other));
      } catch (error) {
        if (!(error instanceof ComparisonFailure)) {
          throw error;
        }
        const e = error.getExpectedAsString();
        const a = error.getActualAsString();
        expectedAsString += line(key, e !== "" ? indent(e) : shortenedExport(error.getExpected()));
        actualAsString += line(key, a !== "" ? indent(a) : shortenedExport(error.getActual()));
        equal = false;
      }
    }
    for (const [key, value] of remaining) {
      actualAsString += line(key, shortenedExport(value));
      equal = false;
    }
    expectedAsString += ")";
    actualAsString += ")";
    if (!equal) {
      throw new ComparisonFailure(expected, actual, expectedAsString, actualAsString, "Failed asserting that two arrays are equal.");
    }
  }
}
