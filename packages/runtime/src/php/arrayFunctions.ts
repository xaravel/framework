// PHP's array functions the Collections core calls (ESC-14.1-6; action item
// epic-14-item-2-runtime-generators-functions), under their PHP names, each a port of PHP 8.5.11's
// `ext/standard/array.c` or `ext/spl/spl_iterators.c` in coercive typing mode: `is_scalar`, `in_array`,
// `array_combine`, `array_filter`, `array_unique`, `iterator_to_array`, `iterator_count`, the constants they take,
// and PHP's `(array)` cast as `toPhpArray`. A PHP array comes in as `arrayEntries` reads it and goes out through
// `arrayFromEntries` (the AD-9 form); `toPhpArray` alone returns a `PhpArray`. `undefined` reads as null (AD-9), and
// an omitted optional argument is PHP's default. PHP's warnings and deprecations are not reproduced. Everything is
// synchronous.
import { arrayEntries, isTrue, toFloat, toPhpString } from "./casts";
import { isEnumClass } from "./classExistence";
import { identical } from "./identical";
import { looseEquals, spaceship } from "./looseEquals";
import { objectProps } from "./mangle";
import { arrayParameter, boolParameter, intParameter } from "./phpArguments";
import { arrayFromEntries, PhpArray, type PhpArrayKey, type PhpKeyInput } from "./PhpArray";
import { phpType } from "./phpType";
import { iterableArgument, iterableCount, iterableToArray } from "./traverse";
import { TypeError as PhpTypeError } from "./TypeError";
import { ValueError } from "./ValueError";
import { valueCopy } from "./valueCopy";
import { zendSort } from "./zendSort";

/** PHP's `ARRAY_FILTER_USE_BOTH`: `array_filter` passes the value and the key. */
export const ARRAY_FILTER_USE_BOTH = 1;
/** PHP's `ARRAY_FILTER_USE_KEY`: `array_filter` passes the key. */
export const ARRAY_FILTER_USE_KEY = 2;
/** PHP's `SORT_REGULAR`: compare with `==` / `<=>`. */
export const SORT_REGULAR = 0;
/** PHP's `SORT_NUMERIC`: compare as floats. */
export const SORT_NUMERIC = 1;
/** PHP's `SORT_STRING`: compare as strings. */
export const SORT_STRING = 2;

/** PHP's `SORT_FLAG_CASE`, which `array_unique` masks off before it picks a comparator. */
const SORT_FLAG_CASE = 8n;

/** PHP's `is_scalar($value)`: true for an int, a float, a string or a bool. */
export function is_scalar(value: unknown): boolean {
  const type = phpType(value);
  return type === "int" || type === "float" || type === "string" || type === "bool";
}

/**
 * PHP's `in_array($needle, $haystack, $strict = false)`: whether a value of `haystack` is `==` `needle`
 * (`looseEquals`; an enum case compares as a bool with a bool or null, else equals only itself, as PHP's enum handler
 * makes it), or `===` it when `strict`. Throws PHP's `TypeError` for a `haystack` that is no array and a
 * `strict` that is no bool, int, float, string or null.
 */
export function in_array(needle: unknown, haystack: unknown, strict: unknown = false): boolean {
  const entries = arrayParameter("in_array", 2, "haystack", haystack);
  const isStrict = boolParameter("in_array", 3, "strict", strict);
  const value = needle ?? null;
  return entries.some(([, entry]) => (isStrict ? identical(value, entry) : zendEquals(value, entry)));
}

/**
 * PHP's `array_combine($keys, $values)`: the values of `values` keyed by the values of `keys`, in order; an int key
 * as it is, any other as its string (`"1"` an int key, `[]` `"Array"`), a repeated key keeping its first place and its
 * last value. Throws PHP's `ValueError` when the counts differ, `TypeError` for a non-array, and `Error` for a key
 * object without a `__toString` port.
 */
export function array_combine(keys: unknown, values: unknown): unknown {
  const keyEntries = arrayParameter("array_combine", 1, "keys", keys);
  const valueEntries = arrayParameter("array_combine", 2, "values", values);
  if (keyEntries.length !== valueEntries.length) {
    throw new ValueError("array_combine(): Argument #1 ($keys) and argument #2 ($values) must have the same number of elements");
  }
  const result = new PhpArray<PhpKeyInput, unknown>();
  keyEntries.forEach(([, key], index) => {
    const value = valueEntries[index]![1];
    result.set(phpType(key) === "int" ? (key as number | bigint) : toPhpString(key), value);
  });
  return arrayFromEntries(result);
}

/** The error for an `array_filter` callback that is a PHP callable string or array, which the runtime does not port. */
function unportedCallable(form: string): PhpTypeError {
  return new PhpTypeError(`array_filter(): Argument #2 ($callback) is a PHP callable ${form}, which Xaravel does not port; pass a function`);
}

/**
 * PHP's `array_filter($array, $callback = null, $mode = 0)`: the entries of `array`, keys kept, for which
 * `callback` returns a true value (by `zend_is_true`), or that are true themselves when there is no callback. The
 * callback gets exactly one argument, the value, or the key with `ARRAY_FILTER_USE_KEY`; with
 * `ARRAY_FILTER_USE_BOTH` the value and the key. Throws PHP's `TypeError` for a non-array, a callback that is neither
 * a function, an object with an `__invoke` method nor null, a callable string or array (not ported), and a non-int `mode`.
 */
export function array_filter(array: unknown, callback: unknown = null, mode: unknown = 0): unknown {
  const entries = arrayParameter("array_filter", 1, "array", array);
  let fn: ((...args: unknown[]) => unknown) | null = null;
  if (callback !== null && callback !== undefined) {
    const invoke: unknown = typeof callback === "object" ? Reflect.get(callback, "__invoke") : null;
    if (typeof callback === "function") {
      fn = callback as (...args: unknown[]) => unknown;
    } else if (typeof invoke === "function" && phpType(callback) === "object") {
      fn = (...args: unknown[]) => Reflect.apply(invoke, callback, args) as unknown;
    } else if (typeof callback === "string") {
      throw unportedCallable("string");
    } else if (typeof callback === "object" && phpType(callback) === "array") {
      throw unportedCallable("array");
    } else {
      throw new PhpTypeError("array_filter(): Argument #2 ($callback) must be a valid callback or null, no array or string given");
    }
  }
  const useType = Number(intParameter("array_filter", 3, "mode", mode));
  if (entries.length === 0) {
    return [];
  }
  const kept: [PhpArrayKey, unknown][] = [];
  for (const [key, value] of entries) {
    if (fn !== null) {
      let args: unknown[];
      if (useType === ARRAY_FILTER_USE_BOTH) {
        args = [value, key];
      } else {
        // PHP sets the key into the only argument for any non-zero mode, then the value over it unless USE_KEY.
        args = [useType !== 0 ? key : null];
        if (useType !== ARRAY_FILTER_USE_KEY) {
          args[0] = value;
        }
      }
      if (!isTrue(fn(...args))) {
        continue;
      }
    } else if (!isTrue(value)) {
      continue;
    }
    kept.push([key, value]);
  }
  return arrayFromEntries(kept);
}

/** Whether `value` is a case of an AD-26 enum (PHP's `ZEND_ACC_ENUM` class). */
function isEnumCase(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return typeof prototype === "object" && prototype !== null && isEnumClass(Reflect.get(prototype, "constructor"));
}

/** An order of enum cases, standing in for the object addresses PHP compares; it only groups equal cases. */
const enumOrder = new WeakMap<object, number>();
let nextEnumOrder = 0;

function orderOf(value: object): number {
  let order = enumOrder.get(value);
  if (order === undefined) {
    order = nextEnumOrder++;
    enumOrder.set(value, order);
  }
  return order;
}

/**
 * Whether PHP's enum handler decides `a` against `b`: one is an enum case and neither is a bool or null, which
 * `zend_compare` compares as bools before any object handler runs.
 */
function enumRule(a: unknown, b: unknown): boolean {
  if (!isEnumCase(a) && !isEnumCase(b)) {
    return false;
  }
  const ta = phpType(a);
  const tb = phpType(b);
  return ta !== "bool" && ta !== "null" && tb !== "bool" && tb !== "null";
}

/**
 * `zend_compare` as these functions read it: `spaceship`, with PHP's enum handler (`zend_objects_not_comparable`: a
 * case compares as a bool with a bool or null, else is uncomparable, 1, with anything but itself), which `spaceship`
 * does not apply yet. It applies to the compared values themselves; a case nested in an array or a property is
 * compared by `spaceship`.
 */
function zendCompare(a: unknown, b: unknown): number {
  if (a !== b && enumRule(a, b)) {
    return 1;
  }
  return spaceship(a, b);
}

/**
 * PHP's `==` as `in_array` reads it: `looseEquals`, with PHP's rule that an enum case compares as a bool with a bool
 * or null, else equals only itself.
 */
function zendEquals(a: unknown, b: unknown): boolean {
  if (enumRule(a, b)) {
    return a === b;
  }
  return looseEquals(a, b);
}

/** `php_array_data_compare_unstable_i`: `zend_compare` (`zendCompare`), with `array_unique`'s rule that groups enum cases. */
function regularCompare(a: unknown, b: unknown): number {
  const result = zendCompare(a, b);
  if (result === 1 && isEnumCase(b)) {
    if (isEnumCase(a)) {
      const left = orderOf(a as object);
      const right = orderOf(b as object);
      return left === right ? 0 : left < right ? -1 : 1;
    }
    // PHP shifts enum cases to the end.
    return -1;
  }
  return result;
}

/** `numeric_compare_function`: both as floats, `ZEND_THREEWAY_COMPARE` (NAN gives 1). */
function numericCompare(a: unknown, b: unknown): number {
  const x = toFloat(a);
  const y = toFloat(b);
  return x === y ? 0 : x < y ? -1 : 1;
}

/** The ValueError for an `array_unique` flag whose comparator the runtime does not port. */
function unportedFlag(flag: string): ValueError {
  return new ValueError(`array_unique(): Argument #2 ($flags) ${flag} is not ported by Xaravel`);
}

/** `flag`, with ` | SORT_FLAG_CASE` when `sortType` sets it. */
function withCase(flag: string, sortType: bigint): string {
  return (sortType & SORT_FLAG_CASE) !== 0n ? `${flag} | SORT_FLAG_CASE` : flag;
}

/** `php_get_data_compare_func_unstable(sort_type, 0)`, for the comparators the runtime ports. */
function compareFor(sortType: bigint): (a: unknown, b: unknown) => number {
  switch (sortType & ~SORT_FLAG_CASE) {
    case 1n:
      return numericCompare;
    case 2n:
      throw unportedFlag("SORT_STRING | SORT_FLAG_CASE");
    case 5n:
      throw unportedFlag(withCase("SORT_LOCALE_STRING", sortType));
    case 6n:
      throw unportedFlag(withCase("SORT_NATURAL", sortType));
    default:
      return regularCompare;
  }
}

/**
 * PHP's `array_unique($array, $flags = SORT_STRING)`: `array` with each value's first occurrence kept, keys kept.
 * `SORT_STRING` compares the values' strings; `SORT_REGULAR` (any other flag PHP reads as it) and `SORT_NUMERIC` sort
 * a copy with `zend_sort` and PHP's unstable comparator, then delete duplicates in PHP's order, so the kept keys are
 * PHP's even where `==` is not transitive. Throws PHP's `TypeError` for a non-array or a non-int flag, `Error` for an
 * object without a `__toString` port under `SORT_STRING`, and a `ValueError` naming `SORT_LOCALE_STRING`,
 * `SORT_NATURAL` or `SORT_STRING | SORT_FLAG_CASE`, which are not ported.
 */
export function array_unique(array: unknown, flags: unknown = SORT_STRING): unknown {
  const entries = arrayParameter("array_unique", 1, "array", array);
  const sortType = BigInt(intParameter("array_unique", 2, "flags", flags));
  if (entries.length <= 1) {
    return arrayFromEntries(entries);
  }
  if (sortType === BigInt(SORT_STRING)) {
    const seen = new Set<string>();
    const kept: [PhpArrayKey, unknown][] = [];
    for (const [key, value] of entries) {
      const string = typeof value === "string" ? value : toPhpString(value);
      if (!seen.has(string)) {
        seen.add(string);
        kept.push([key, value]);
      }
    }
    return arrayFromEntries(kept);
  }
  const cmp = compareFor(sortType);
  const buckets = entries.map(([, value], index) => ({ value, index }));
  zendSort(buckets, (a, b) => cmp(a.value, b.value));
  const deleted = new Set<number>();
  let lastKept = buckets[0]!;
  for (let position = 1; position < buckets.length; position++) {
    const bucket = buckets[position]!;
    if (cmp(lastKept.value, bucket.value) !== 0) {
      lastKept = bucket;
      continue;
    }
    if (lastKept.index > bucket.index) {
      deleted.add(lastKept.index);
      lastKept = bucket;
    } else {
      deleted.add(bucket.index);
    }
  }
  return arrayFromEntries(entries.filter((_, index) => !deleted.has(index)));
}

/**
 * PHP's `iterator_to_array($iterator, $preserve_keys = true)`: an array's entries, or a Traversable's pairs by PHP's
 * protocol (a bare JS generator object is wrapped in `Generator`), a later key overwriting an earlier one; with
 * `preserve_keys` false, the values as a list. Throws PHP's `TypeError` for a non-iterable, a non-bool
 * `preserve_keys` and a key no array takes (`Cannot access offset of type array on array`), and PHP's `Exception`
 * for a closed generator.
 */
export function iterator_to_array(iterator: unknown, preserve_keys: unknown = true): unknown {
  iterableArgument("iterator_to_array", iterator);
  const preserve = boolParameter("iterator_to_array", 2, "preserve_keys", preserve_keys);
  return arrayFromEntries(iterableToArray("iterator_to_array", iterator, preserve));
}

/**
 * PHP's `iterator_count($iterator)`: an array's count, or the elements of a Traversable by PHP's protocol (it reads
 * no key or value). Throws PHP's `TypeError` for a non-iterable, and PHP's `Exception` for a closed generator.
 */
export function iterator_count(iterator: unknown): number {
  return iterableCount("iterator_count", iterator);
}

/**
 * PHP's `(array) $value`, as a `PhpArray`: null gives `[]`; a scalar or a closure `[value]`; an array a copy (nested
 * arrays copied, `valueCopy`); an object its properties as `phpSerialize` reads them (`objectProps`: protected
 * `"\0*\0name"` and private `"\0Class\0name"` names mangled, an `ArrayObject` its storage), a numeric property name
 * an int key.
 */
export function toPhpArray(value: unknown): PhpArray {
  switch (phpType(value)) {
    case "null":
      return new PhpArray();
    case "array": {
      const copy = valueCopy(value);
      return copy instanceof PhpArray ? (copy as PhpArray) : new PhpArray(arrayEntries(copy as object));
    }
    case "object":
      if (typeof value === "function") {
        return new PhpArray([[0, value]]);
      }
      return new PhpArray(objectProps(value as object).map(([key, item]) => [key, valueCopy(item)] as const));
    default:
      return new PhpArray([[0, value]]);
  }
}
