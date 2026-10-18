// sebastian/comparator 8.4.0's `ScalarComparator` (Story 4.3): scalars and null,
// and a string against a Stringable object. When either side is a string (and
// the other not a bool) both compare as strings, so `'1'` and `'01'` differ.
import { phpLooseEquals } from "../comparison/PhpComparison";
import { isPhpObject, isScalar, isStringable, phpToString } from "../comparison/PhpValues";
import { exportValue } from "../exporter/Exporter";
import { ComparisonFailure } from "../Framework/ComparisonFailure";
import { Comparator } from "./Comparator";

const OVERLONG_THRESHOLD = 40;
const KEEP_CONTEXT_CHARS = 25;

// PHP's strings are bytes: the common prefix and suffix, and the cuts, are in UTF-8 bytes, as `strlen` and `substr`
// count them. A cut inside a multi-byte character decodes to U+FFFD (a binary string has no JS form; DIV-9's value
// model holds only valid UTF-8 strings).

function commonPrefix(a: Uint8Array, b: Uint8Array): number {
  let index = 0;
  while (index < a.length && index < b.length && a[index] === b[index]) {
    index++;
  }
  return index;
}

function commonSuffix(a: Uint8Array, b: Uint8Array): number {
  if (a.length === 0 || b.length === 0 || a[a.length - 1] !== b[b.length - 1]) {
    return 0;
  }
  let i = a.length - 1;
  let j = b.length - 1;
  while (i > 0 && j > 0 && a[i] === b[j]) {
    i--;
    j--;
  }
  return a.length - (i + 1);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ELLIPSIS = encoder.encode("...");

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function removeOverlong(a: string, b: string): [string, string] {
  let left: Uint8Array = encoder.encode(a);
  let right: Uint8Array = encoder.encode(b);
  const prefix = commonPrefix(left, right);
  if (prefix > OVERLONG_THRESHOLD) {
    left = concat(ELLIPSIS, left.subarray(prefix - KEEP_CONTEXT_CHARS));
    right = concat(ELLIPSIS, right.subarray(prefix - KEEP_CONTEXT_CHARS));
  }
  const suffix = commonSuffix(left, right);
  if (suffix > OVERLONG_THRESHOLD) {
    const cut = suffix - KEEP_CONTEXT_CHARS;
    left = concat(left.subarray(0, left.length - cut), ELLIPSIS);
    right = concat(right.subarray(0, right.length - cut), ELLIPSIS);
  }
  return [decoder.decode(left), decoder.decode(right)];
}

export class ScalarComparator extends Comparator {
  accepts(expected: unknown, actual: unknown): boolean {
    return (
      ((isScalar(expected) || expected === null) && (isScalar(actual) || actual === null)) ||
      (typeof expected === "string" && isPhpObject(actual) && isStringable(actual)) ||
      (isPhpObject(expected) && isStringable(expected) && typeof actual === "string")
    );
  }

  assertEquals(expected: unknown, actual: unknown, _delta = 0, _canonicalize = false, ignoreCase = false): void {
    let expectedToCompare = expected;
    let actualToCompare = actual;
    if ((typeof expected === "string" && typeof actual !== "boolean") || (typeof actual === "string" && typeof expected !== "boolean")) {
      expectedToCompare = phpToString(expected);
      actualToCompare = phpToString(actual);
      if (ignoreCase) {
        expectedToCompare = (expectedToCompare as string).toLowerCase();
        actualToCompare = (actualToCompare as string).toLowerCase();
      }
    }
    if (expectedToCompare !== actualToCompare && typeof expected === "string" && typeof actual === "string") {
      const [cutExpected, cutActual] = removeOverlong(expected, actual);
      throw new ComparisonFailure(expected, actual, exportValue(cutExpected), exportValue(cutActual), "Failed asserting that two strings are equal.");
    }
    if (!phpLooseEquals(expectedToCompare, actualToCompare)) {
      throw new ComparisonFailure(expected, actual, "", "", `Failed asserting that ${exportValue(actual)} matches expected ${exportValue(expected)}.`);
    }
  }
}
