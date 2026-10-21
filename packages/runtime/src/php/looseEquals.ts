// PHP's comparison (AD-9.6, Story 9.6): `<=>` and `==` as PHP 8.5's `zend_compare` gives them over the AD-9 value
// model (see `casts.ts`). Objects compared by their properties expose `[Symbol.for('xaravel.php.props')]()`, which
// returns their public properties as a PHP array.
import { arrayEntries, floatValue, formatFloat, isTrue, phpType, type PhpType, stringPort, toPhpString } from "./casts";
import { parseNumeric } from "./isNumeric";
import type { PhpArrayKey } from "./PhpArray";

const PHP_PROPS = Symbol.for("xaravel.php.props");
const RECURSION = "Nesting level too deep - recursive dependency?";

type Order = -1 | 0 | 1;

/** `ZEND_THREEWAY_COMPARE`: NAN on either side gives 1. */
function threeway(a: number, b: number): Order {
  return a === b ? 0 : a < b ? -1 : 1;
}

/** `ZEND_NORMALIZE_BOOL`: the sign, NAN giving 0. */
function sign(n: number): Order {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

/** `zend_binary_strcmp`'s sign: PHP compares UTF-8 bytes, whose order is code-point order. */
function strcmp(a: string, b: string): Order {
  if (a === b) {
    return 0;
  }
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index++) {
    const x = a.codePointAt(index)!;
    const y = b.codePointAt(index)!;
    if (x !== y) {
      return x < y ? -1 : 1;
    }
    if (x > 0xffff) {
      index++;
    }
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

/** `zendi_smart_strcmp`: two numeric strings compare as numbers, anything else as bytes. */
function smartStrcmp(a: string, b: string): Order {
  const x = parseNumeric(a, false);
  const y = x === null ? null : parseNumeric(b, false);
  if (x === null || y === null) {
    return strcmp(a, b);
  }
  if (x.overflow !== 0 && x.overflow === y.overflow && x.float - y.float === 0) {
    // Both integers overflow to the same side: a numeric comparison would be inaccurate.
    return strcmp(a, b);
  }
  if (x.int !== null && y.int !== null) {
    return x.int > y.int ? 1 : x.int < y.int ? -1 : 0;
  }
  let dx = x.float;
  let dy = y.float;
  if (x.int !== null) {
    if (y.overflow !== 0) {
      return (-y.overflow) as Order;
    }
    dx = Number(x.int);
  } else if (y.int !== null) {
    if (x.overflow !== 0) {
      return x.overflow;
    }
    dy = Number(y.int);
  } else if (dx === dy && !Number.isFinite(dx)) {
    return strcmp(a, b);
  }
  return sign(dx - dy);
}

/** `compare_longs_to_string`. */
function compareIntToString(int: number | bigint, s: string): Order {
  const numeric = parseNumeric(s, false);
  if (numeric === null) {
    return strcmp(String(int), s);
  }
  if (numeric.int !== null) {
    return int > numeric.int ? 1 : int < numeric.int ? -1 : 0;
  }
  return threeway(Number(int), numeric.float);
}

/** `compare_doubles_to_string`. */
function compareFloatToString(float: number, s: string): Order {
  const numeric = parseNumeric(s, false);
  if (numeric === null) {
    return strcmp(formatFloat(float), s);
  }
  return threeway(float, numeric.int !== null ? Number(numeric.int) : numeric.float);
}

function negate(order: Order): Order {
  return (0 - order) as Order;
}

/** `zend_hash_compare(…, ordered = 0)`: the count first, then each key of `a` in order, a key missing in `b` giving 1. */
function compareArrays(a: object, b: object, guard: Set<object>): Order {
  if (a === b) {
    return 0;
  }
  if (guard.has(a)) {
    throw new Error(RECURSION);
  }
  guard.add(a);
  try {
    const left = arrayEntries(a);
    const right = arrayEntries(b);
    if (left.length !== right.length) {
      return left.length > right.length ? 1 : -1;
    }
    const lookup = new Map<PhpArrayKey, unknown>(right);
    for (const [key, value] of left) {
      if (!lookup.has(key)) {
        return 1;
      }
      const order = compare(value, lookup.get(key), guard);
      if (order !== 0) {
        return order;
      }
    }
    return 0;
  } finally {
    guard.delete(a);
  }
}

function props(o: object): (() => unknown) | null {
  const method: unknown = (o as Record<symbol, unknown>)[PHP_PROPS];
  return typeof method === "function" ? (method as () => unknown) : null;
}

/**
 * `zend_std_compare_objects` with the object `o` on the left (`objectLeft`) or right of `other`. Two objects: of
 * different classes uncomparable (1), of one class compared by their props arrays, else by identity (uncomparable
 * unless the same object). Against a non-object, the object is cast to the other's type: to bool it is true, to
 * string its `toString()` port's result, to int or float 1; when it does not cast (string without a port, null,
 * array) the object is greater.
 */
function compareObject(o: object, other: unknown, otherType: PhpType, objectLeft: boolean, guard: Set<object>): Order {
  if (otherType === "object") {
    const first = objectLeft ? o : (other as object);
    const second = objectLeft ? (other as object) : o;
    if (Object.getPrototypeOf(first) !== Object.getPrototypeOf(second)) {
      return 1;
    }
    const left = props(first);
    const right = props(second);
    if (left === null || right === null) {
      return 1;
    }
    if (guard.has(first)) {
      throw new Error(RECURSION);
    }
    guard.add(first);
    try {
      return compare(left.call(first), right.call(second), guard);
    } finally {
      guard.delete(first);
    }
  }
  let cast: unknown;
  switch (otherType) {
    case "bool":
      cast = true;
      break;
    case "int":
    case "float":
      cast = 1;
      break;
    case "string":
      if (stringPort(o) === null) {
        return objectLeft ? 1 : -1;
      }
      cast = toPhpString(o);
      break;
    default:
      return objectLeft ? 1 : -1;
  }
  return objectLeft ? compare(cast, other, guard) : compare(other, cast, guard);
}

function compare(a: unknown, b: unknown, guard: Set<object>): Order {
  const ta = phpType(a);
  const tb = phpType(b);
  switch (`${ta},${tb}`) {
    case "int,int":
      return (a as number | bigint) > (b as number | bigint) ? 1 : (a as number | bigint) < (b as number | bigint) ? -1 : 0;
    case "int,float":
      return threeway(Number(a), floatValue(b));
    case "float,int":
      return threeway(floatValue(a), Number(b));
    case "float,float":
      return threeway(floatValue(a), floatValue(b));
    case "array,array":
      return compareArrays(a as object, b as object, guard);
    case "null,string":
      return b === "" ? 0 : -1;
    case "string,null":
      return a === "" ? 0 : 1;
    case "string,string":
      return a === b ? 0 : smartStrcmp(a as string, b as string);
    case "int,string":
      return compareIntToString(a as number | bigint, b as string);
    case "string,int":
      return negate(compareIntToString(b as number | bigint, a as string));
    case "float,string": {
      const x = floatValue(a);
      return Number.isNaN(x) ? 1 : compareFloatToString(x, b as string);
    }
    case "string,float": {
      const y = floatValue(b);
      return Number.isNaN(y) ? 1 : negate(compareFloatToString(y, a as string));
    }
    default:
      break;
  }
  if (ta === "object" && tb === "object" && a === b) {
    return 0;
  }
  if (ta === "object") {
    return compareObject(a as object, b, tb, true, guard);
  }
  if (tb === "object") {
    return compareObject(b as object, a, ta, false, guard);
  }
  if (ta === "null" || a === false) {
    return isTrue(b) ? -1 : 0;
  }
  if (a === true) {
    return isTrue(b) ? 0 : 1;
  }
  if (tb === "null" || b === false) {
    return isTrue(a) ? 1 : 0;
  }
  if (b === true) {
    return isTrue(a) ? 0 : -1;
  }
  // An array against an int, a float or a string: the array is greater.
  return ta === "array" ? 1 : -1;
}

/**
 * PHP's `$a <=> $b` (`zend_compare`): -1, 0 or 1. Uncomparable operands (NAN, objects of different classes) give 1
 * both ways. Throws PHP's `Error` `Nesting level too deep - recursive dependency?` for an array or object that
 * contains itself, and `toPhpString`'s errors from an object's `toString()` port.
 */
export function spaceship(a: unknown, b: unknown): -1 | 0 | 1 {
  return compare(a, b, new Set());
}

/** PHP's `$a == $b`: `zend_compare($a, $b) == 0` (see `spaceship`). */
export function looseEquals(a: unknown, b: unknown): boolean {
  return compare(a, b, new Set()) === 0;
}
