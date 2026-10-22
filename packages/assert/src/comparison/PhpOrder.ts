// PHP 8.5 `<=>` (zend_compare) over the AD-9 value model (Story 4.3; FR-116).
//
// GreaterThan and LessThan (`$a < $b` is `($a <=> $b) < 0`), and the
// canonicalizing ArrayComparator's sort, order values through this. Two values
// PHP cannot order (objects of different classes, an array missing a key of the
// other) compare as 1 in both directions, as ZEND_UNCOMPARABLE does. A value
// carrying the runtime's float marker orders as the plain `number` it stands
// for (Story 9.11).
import { arrayEntries, type Entries, isBuiltIn, isNumber, isPhpArray, type Key, numericValue, objectProps, RECURSION, truthy } from "./PhpComparison";
import { formatDouble, isFloat, isPhpObject, isStringable, sameClass, stringOf, unmarkFloat } from "./PhpValues";

const UNCOMPARABLE = 1;

function sign(value: number): number {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

/** ZEND_THREEWAY_COMPARE over doubles: NAN compares as 1. */
function threeway(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

function compareNumbers(a: number | bigint, b: number | bigint): number {
  if (typeof a === "bigint" && typeof b === "bigint") {
    return a === b ? 0 : a < b ? -1 : 1;
  }
  if (typeof a === "number" && typeof b === "number") {
    return threeway(a, b);
  }
  const big = (typeof a === "bigint" ? a : b) as bigint;
  const num = (typeof a === "number" ? a : b) as number;
  let result: number;
  if (Number.isSafeInteger(num)) {
    const other = BigInt(num);
    result = big === other ? 0 : big < other ? -1 : 1;
  } else {
    result = threeway(Number(big), num);
    if (Number.isNaN(num)) {
      return 1;
    }
  }
  return typeof a === "bigint" ? result : -result;
}

/** `zend_binary_strcmp`, normalised: bytewise over UTF-8, then by length. */
export function binaryCompare(a: string, b: string): number {
  return sign(Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8")));
}

/** PHP 8 `zendi_smart_strcmp`. */
export function smartCompare(a: string, b: string): number {
  const left = numericValue(a);
  const right = numericValue(b);
  if (left === null || right === null) {
    return binaryCompare(a, b);
  }
  const leftOflow = left.int ? 0 : left.oflow;
  const rightOflow = right.int ? 0 : right.oflow;
  if (leftOflow !== 0 && leftOflow === rightOflow && Number(left.value) - Number(right.value) === 0) {
    return binaryCompare(a, b);
  }
  if (!left.int || !right.int) {
    let l: number;
    let r: number;
    if (left.int) {
      if (rightOflow !== 0) {
        return -1 * rightOflow;
      }
      l = Number(left.value);
      r = right.value as number;
    } else if (right.int) {
      if (leftOflow !== 0) {
        return leftOflow;
      }
      l = left.value;
      r = Number(right.value);
    } else {
      l = left.value;
      r = right.value;
      if (l === r && !Number.isFinite(l)) {
        return binaryCompare(a, b);
      }
    }
    return sign(l - r);
  }
  return compareNumbers(left.value, right.value);
}

/** `compare_longs_to_string` / `compare_doubles_to_string`. */
function compareNumberToString(number: number | bigint, text: string): number {
  const parsed = numericValue(text);
  if (parsed !== null) {
    if (typeof number === "number" && isFloat(number)) {
      return threeway(number, Number(parsed.value));
    }
    if (parsed.int) {
      return compareNumbers(number, parsed.value);
    }
    return threeway(Number(number), parsed.value);
  }
  const asString = typeof number === "number" && isFloat(number) ? formatDouble(number, 14) : String(number);
  return binaryCompare(asString, text);
}

class Ordering {
  private readonly active = new Set<object>();

  private guard(container: object, compare: () => number): number {
    if (this.active.has(container)) {
      throw new Error(RECURSION);
    }
    this.active.add(container);
    try {
      return compare();
    } finally {
      this.active.delete(container);
    }
  }

  private entries(a: Entries, b: Entries): number {
    if (a.length !== b.length) {
      return sign(a.length - b.length);
    }
    const right = new Map<Key, unknown>();
    for (const [key, value] of b) {
      right.set(key, value);
    }
    for (const [key, value] of a) {
      if (!right.has(key)) {
        return UNCOMPARABLE;
      }
      const result = this.compare(value, right.get(key));
      if (result !== 0) {
        return result;
      }
    }
    return 0;
  }

  /** `zend_std_compare_objects` with one operand not an object: the object is cast to the other's type. */
  private objectWith(object: object, value: unknown, objectLeft: boolean): number {
    let casted: unknown;
    if (typeof value === "boolean") {
      casted = true;
    } else if (typeof value === "number" || typeof value === "bigint") {
      casted = 1;
    } else if (typeof value === "string" && isStringable(object)) {
      casted = stringOf(object);
    } else {
      return objectLeft ? 1 : -1;
    }
    return objectLeft ? this.compare(casted, value) : this.compare(value, casted);
  }

  compare(left: unknown, right: unknown): number {
    const a = unmarkFloat(left);
    const b = unmarkFloat(right);
    if (a === undefined || b === undefined || typeof a === "symbol" || typeof b === "symbol") {
      return Object.is(a, b) ? 0 : UNCOMPARABLE;
    }
    if (isNumber(a) && isNumber(b)) {
      return compareNumbers(a, b);
    }
    if (typeof a === "object" && a !== null && typeof b === "object" && b !== null && isPhpArray(a) && isPhpArray(b)) {
      return this.guard(a, () => this.entries(arrayEntries(a), arrayEntries(b)));
    }
    if ((a === null || typeof a === "boolean") && (b === null || typeof b === "boolean")) {
      return sign(Number(truthy(a)) - Number(truthy(b)));
    }
    if (a === null && typeof b === "string") {
      return b === "" ? 0 : -1;
    }
    if (typeof a === "string" && b === null) {
      return a === "" ? 0 : 1;
    }
    if (typeof a === "string" && typeof b === "string") {
      return a === b ? 0 : smartCompare(a, b);
    }
    // A NAN against a string is uncomparable, in either order.
    if (isNumber(a) && typeof b === "string") {
      return Number.isNaN(a) ? UNCOMPARABLE : compareNumberToString(a, b);
    }
    if (typeof a === "string" && isNumber(b)) {
      return Number.isNaN(b) ? UNCOMPARABLE : -compareNumberToString(b, a);
    }
    const leftObject = isPhpObject(a);
    const rightObject = isPhpObject(b);
    if (leftObject && rightObject) {
      if (a === b) {
        return 0;
      }
      if (!sameClass(a, b) || typeof a === "function" || isBuiltIn(a)) {
        return UNCOMPARABLE;
      }
      return this.guard(a, () => this.entries(objectProps(a), objectProps(b as object)));
    }
    if (leftObject) {
      return this.objectWith(a, b, true);
    }
    if (rightObject) {
      return this.objectWith(b as object, a, false);
    }
    if (a === null || a === false) {
      return truthy(b) ? -1 : 0;
    }
    if (a === true) {
      return truthy(b) ? 0 : 1;
    }
    if (b === null || b === false) {
      return truthy(a) ? 1 : 0;
    }
    if (b === true) {
      return truthy(a) ? 0 : -1;
    }
    // Arrays against scalars (resources compare by their own rules, not ported): the array is greater.
    if (isPhpArray(a)) {
      return 1;
    }
    if (isPhpArray(b)) {
      return -1;
    }
    return UNCOMPARABLE;
  }
}

/** PHP 8.5 `$a <=> $b`: -1, 0 or 1. Throws `Error('Nesting level too deep - recursive dependency?')` on recursion. */
export function phpCompare(a: unknown, b: unknown): number {
  return new Ordering().compare(a, b);
}
