// sebastian/comparator 8.4.0's `NumericComparator` (Story 4.3): numbers and
// numeric strings, unless both are strings, within `delta`.
import { numericValue } from "../comparison/PhpComparison";
import { isFloat, isInt, isNumeric, toNumber } from "../comparison/PhpValues";
import { exportValue } from "../exporter/Exporter";
import { ComparisonFailure } from "../Framework/ComparisonFailure";
import { ScalarComparator } from "./ScalarComparator";

function isInfinite(value: unknown): boolean {
  return isFloat(value) && !Number.isNaN(toNumber(value)) && !Number.isFinite(toNumber(value));
}

function isNan(value: unknown): boolean {
  return isFloat(value) && Number.isNaN(toNumber(value));
}

/** The value as a PHP int (an int, or an integer numeric string), or null when PHP's arithmetic reads it as a float. */
function intValue(value: unknown): bigint | null {
  if (isInt(value)) {
    return BigInt(value);
  }
  if (isFloat(value)) {
    return null;
  }
  if (typeof value === "string") {
    const parsed = numericValue(value);
    return parsed !== null && parsed.int ? BigInt(parsed.value) : null;
  }
  return null;
}

/**
 * `abs($actual - $expected)`: exact when both are ints (an int beyond 2^53 is a `bigint`, which a `number`
 * subtraction would round), then compared with the float `delta` as PHP compares an int with a float.
 */
function distance(expected: unknown, actual: unknown): number {
  const e = intValue(expected);
  const a = intValue(actual);
  if (e !== null && a !== null) {
    const difference = a - e;
    return Number(difference < 0n ? -difference : difference);
  }
  return Math.abs(toNumber(actual) - toNumber(expected));
}

export class NumericComparator extends ScalarComparator {
  override accepts(expected: unknown, actual: unknown): boolean {
    return isNumeric(expected) && isNumeric(actual) && !(typeof expected === "string" && typeof actual === "string");
  }

  override assertEquals(expected: unknown, actual: unknown, delta = 0): void {
    if (isInfinite(expected) && isInfinite(actual)) {
      const e = toNumber(expected);
      const a = toNumber(actual);
      if ((e < 0 && a < 0) || (e > 0 && a > 0)) {
        return;
      }
    }
    if (isInfinite(actual) !== isInfinite(expected) || isNan(actual) || isNan(expected) || distance(expected, actual) > delta) {
      throw new ComparisonFailure(expected, actual, "", "", `Failed asserting that ${exportValue(actual)} matches expected ${exportValue(expected)}.`);
    }
  }
}
