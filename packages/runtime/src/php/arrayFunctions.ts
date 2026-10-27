// PHP's array functions the Collections core calls (ESC-14.1-6; action item
// epic-14-item-2-runtime-generators-functions), under their PHP names, each a port of PHP 8.5.11's
// `ext/standard/array.c` or `ext/spl/spl_iterators.c` in coercive typing mode: `is_scalar`, `in_array`,
// `array_combine`, `array_filter`, `array_unique`, `iterator_to_array`, `iterator_count`, the constants they take, and
// PHP's `(array)` cast as `toPhpArray`; and (action item epic-14-item-3-runtime-type-tests-functions, ESC-14.1-9)
// `array_map`, `array_keys`, `array_values`, `array_key_exists`, `array_key_first`, `array_key_last`, `array_merge`,
// `count` with `COUNT_NORMAL` / `COUNT_RECURSIVE`; and (action item epic-14-item-5-runtime-array-functions, ESC-14.2-1)
// `array_any`, `array_all`, `array_find_key`, `array_first`, `array_last`, `array_search`, `array_flip`, `array_slice`,
// `array_reverse`, `array_intersect_key`, `array_intersect_assoc`, `min`, `max` and the sort flag constants (the
// by-reference functions are in `arrayRefFunctions.ts`); and (action item
// epic-14-item-9-runtime-set-functions-callable-names, ESC-14.4-1) `array_diff`, `array_diff_assoc`, `array_diff_key`,
// `array_intersect`, the callback forms `array_udiff`, `array_diff_uassoc`, `array_diff_ukey`, `array_uintersect` and
// `array_intersect_uassoc` (`php_array_diff` / `php_array_intersect` with `zend_sort`, as written),
// `array_merge_recursive`, `array_replace`, `array_replace_recursive`, `array_pad`, and `arrayUnion` for PHP's `+` on
// arrays (`add_function_array`). A callback that is a PHP function name resolves through `phpFunction` (ESC-14.4-2). A
// PHP array comes in as `arrayEntries` reads it and goes out through `arrayFromEntries` (the AD-9 form); `toPhpArray`
// alone returns a `PhpArray`. `undefined` reads as null (AD-9), and an omitted optional argument is PHP's default.
// PHP's warnings and deprecations are not reproduced. Everything is synchronous.
import { isContractToken } from "../registry/registry";
import { ArgumentCountError } from "./ArgumentCountError";
import { arrayCount, arrayEntries, floatValue, isTrue, toFloat, toInt, toPhpString } from "./casts";
import { isEnumCase } from "./classExistence";
import { isClassConstructor } from "./Closure";
import { Error as PhpError } from "./Error";
import { identical } from "./identical";
import { binaryStrcmp, looseEquals, spaceship } from "./looseEquals";
import { objectProps } from "./mangle";
import { arrayParameter, boolParameter, intParameter, nullableIntParameter } from "./phpArguments";
import { arrayFromEntries, nextFreeIndex, normalizeKey, PhpArray, phpArrayWithNextFree, type PhpArrayKey, type PhpKeyInput } from "./PhpArray";
import { phpFunction } from "./phpFunctions";
import { phpType, phpTypeName } from "./phpType";
import { phpValueOf } from "./throwableArguments";
import { iterableArgument, iterableCount, iterableToArray } from "./traverse";
import { TypeError as PhpTypeError } from "./TypeError";
import { stringOf } from "./typeTests";
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

/** PHP's `SORT_LOCALE_STRING`: compare as strings in the current locale (`strcoll`; the runtime's is the C locale). */
export const SORT_LOCALE_STRING = 5;
/** PHP's `SORT_NATURAL`: compare as strings in natural order (`strnatcmp`). */
export const SORT_NATURAL = 6;
/** PHP's `SORT_FLAG_CASE`: with `SORT_STRING` or `SORT_NATURAL`, compare case-insensitively. */
export const SORT_FLAG_CASE = 8;

/** `SORT_FLAG_CASE` as a bigint, which `array_unique` masks off before it picks a comparator. */
const FLAG_CASE = 8n;

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

/** The error for a callback that is a PHP callable string or array, which the runtime does not port (DIV-9.13). */
function unportedCallable(fn: string, position: number, label: string, form: string): PhpTypeError {
  return new PhpTypeError(`${fn}(): Argument #${position}${label} is a PHP callable ${form}, which Xaravel does not port; pass a function`);
}

/**
 * A `?callable` callback parameter as `array_filter` and `array_map` take it: a function, an object with an
 * `__invoke` method (called with exactly the given arguments), a PHP callable string naming a global function the
 * runtime exports (`phpFunction`, DIV-9.13 / DIV-9.14 as ESC-14.4-2 amends them), or null. Throws PHP's `TypeError`
 * naming the unported form for any other PHP callable string or array (DIV-9.13), and PHP's `must be a valid callback
 * or null, no array or string given` for anything else. With `nullable` false it is a `callable` parameter
 * (`array_any`, `array_all`, `array_find_key`): null throws PHP's `must be a valid callback, no array or string given`
 * too. `name` is the parameter's name in the message (` ($callback)`), or null for an unnamed variadic argument.
 */
function callbackParameter(fn: string, position: number, callback: unknown, nullable: boolean = true, name: string | null = "callback"): ((...args: unknown[]) => unknown) | null {
  const label = name === null ? "" : ` ($${name})`;
  const refused = `${fn}(): Argument #${position}${label} must be a valid callback${nullable ? " or null" : ""}, no array or string given`;
  if (callback === null || callback === undefined) {
    if (nullable) {
      return null;
    }
    throw new PhpTypeError(refused);
  }
  // A class constructor and a contract token are class-strings (AD-9, DIV-12.19): PHP calls the function their name
  // names, if the runtime exports one (`is_callable` agrees).
  if (isClassConstructor(callback) || isContractToken(callback)) {
    const resolved = phpFunction(stringOf(callback));
    if (resolved !== null) {
      return resolved;
    }
    throw unportedCallable(fn, position, label, "string");
  }
  const invoke: unknown = typeof callback === "object" ? Reflect.get(callback, "__invoke") : null;
  if (typeof callback === "function") {
    return callback as (...args: unknown[]) => unknown;
  }
  if (typeof invoke === "function" && phpType(callback) === "object") {
    return (...args: unknown[]) => Reflect.apply(invoke, callback, args) as unknown;
  }
  if (typeof callback === "string") {
    const resolved = phpFunction(callback);
    if (resolved !== null) {
      return resolved;
    }
    throw unportedCallable(fn, position, label, "string");
  }
  if (typeof callback === "object" && phpType(callback) === "array") {
    throw unportedCallable(fn, position, label, "array");
  }
  throw new PhpTypeError(refused);
}

/**
 * PHP's `array_filter($array, $callback = null, $mode = 0)`: the entries of `array`, keys kept, for which
 * `callback` returns a true value (by `zend_is_true`), or that are true themselves when there is no callback. The
 * callback gets exactly one argument, the value, or the key with `ARRAY_FILTER_USE_KEY`; with
 * `ARRAY_FILTER_USE_BOTH` the value and the key. The callback may be a PHP function name the runtime exports, which
 * resolves (`phpFunction`, ESC-14.4-2). Throws PHP's `TypeError` for a non-array, a callback that is neither a
 * function, an object with an `__invoke` method, a resolved name nor null, any other callable string or a callable
 * array (not ported, DIV-9.13), and a non-int `mode`.
 */
export function array_filter(array: unknown, callback: unknown = null, mode: unknown = 0): unknown {
  const entries = arrayParameter("array_filter", 1, "array", array);
  const fn = callbackParameter("array_filter", 2, callback);
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
export function zendCompare(a: unknown, b: unknown): number {
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
export function regularCompare(a: unknown, b: unknown): number {
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
export function numericCompare(a: unknown, b: unknown): number {
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
  return (sortType & FLAG_CASE) !== 0n ? `${flag} | SORT_FLAG_CASE` : flag;
}

/** `php_get_data_compare_func_unstable(sort_type, 0)`, for the comparators the runtime ports. */
function compareFor(sortType: bigint): (a: unknown, b: unknown) => number {
  switch (sortType & ~FLAG_CASE) {
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

/** PHP's `COUNT_NORMAL`: `count` counts the top level. */
export const COUNT_NORMAL = 0;
/** PHP's `COUNT_RECURSIVE`: `count` also counts the elements of nested arrays. */
export const COUNT_RECURSIVE = 1;

const COUNTABLE = Symbol.for("Countable");

/** The PHP type name of `value` in a message; a contract token is its class-string, a `string` (AD-9). */
function valueTypeName(value: unknown): string {
  return isContractToken(value) ? "string" : phpTypeName(phpValueOf(value ?? null));
}

/** An array argument, else PHP's `TypeError`; `name` null for a variadic argument, which PHP's message leaves unnamed. */
function arrayArgument(fn: string, position: number, name: string | null, value: unknown): [PhpArrayKey, unknown][] {
  if (typeof value === "object" && value !== null && !isContractToken(value) && phpType(value) === "array") {
    return arrayEntries(value);
  }
  throw new PhpTypeError(`${fn}(): Argument #${position}${name === null ? "" : ` ($${name})`} must be of type array, ${valueTypeName(value)} given`);
}

/**
 * PHP's `array_map($callback, $array, ...$arrays)`. With one array: `callback(value)` for each entry, keys kept (string
 * and int), or the array itself without a callback. With several: a list as long as the longest array, each element
 * `callback(v1, v2, …)` over the arrays' values in order, a shorter array giving null, or, without a callback, the
 * list of those value lists. The callback is taken as `array_filter` takes it: a PHP function name the runtime exports
 * resolves (`phpFunction`, ESC-14.4-2), any other callable string is refused (DIV-9.13). Throws PHP's `TypeError`
 * for a non-array (`Argument #2 ($array)`, then `Argument #3` and on unnamed) and for a callback PHP or the runtime
 * refuses.
 */
export function array_map(callback: unknown, array: unknown, ...arrays: unknown[]): unknown {
  const fn = callbackParameter("array_map", 1, callback);
  if (arrays.length === 0) {
    const entries = arrayArgument("array_map", 2, "array", array);
    if (fn === null || entries.length === 0) {
      return arrayFromEntries(entries);
    }
    return arrayFromEntries(entries.map(([key, value]) => [key, fn(value) ?? null] as const));
  }
  const lists = [array, ...arrays].map((value, index) => arrayArgument("array_map", index + 2, index === 0 ? "array" : null, value).map(([, item]) => item));
  const length = Math.max(...lists.map((list) => list.length));
  const result: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const values = lists.map((list) => (index < list.length ? list[index] : null));
    result.push(fn === null ? values : (fn(...values) ?? null));
  }
  return result;
}

/**
 * PHP's `array_keys($array, $filter_value, $strict = false)`: the keys of `array` as a list, or, when `filter_value`
 * is passed (by argument count: `null` and `undefined` are PHP's null), the keys whose value is `==` it (`in_array`'s
 * comparison), or `===` it when `strict`. Throws PHP's `TypeError` for a non-array and a `strict` that is no bool.
 */
export function array_keys(array: unknown, ...rest: [filter_value?: unknown, strict?: unknown]): PhpArrayKey[] {
  const entries = arrayArgument("array_keys", 1, "array", array);
  const isStrict = boolParameter("array_keys", 3, "strict", rest.length >= 2 ? rest[1] : false);
  if (rest.length === 0) {
    return entries.map(([key]) => key);
  }
  const filter = rest[0] ?? null;
  return entries.filter(([, value]) => (isStrict ? identical(filter, value) : zendEquals(filter, value))).map(([key]) => key);
}

/** PHP's `array_values($array)`: the values of `array` as a list. Throws PHP's `TypeError` for a non-array. */
export function array_values(array: unknown): unknown[] {
  return arrayArgument("array_values", 1, "array", array).map(([, value]) => value);
}

/** Whether two normalised keys are the same key: two equal strings, or two equal ints. */
function sameKey(a: PhpArrayKey, b: PhpArrayKey): boolean {
  if (typeof a === "string" || typeof b === "string") {
    return a === b;
  }
  return BigInt(a) === BigInt(b);
}

/** `value` as an array argument, unread, else PHP's `TypeError` (`arrayArgument` without copying the entries). */
function arrayObject(fn: string, position: number, value: unknown): object {
  if (typeof value === "object" && value !== null && !isContractToken(value) && phpType(value) === "array") {
    return value;
  }
  throw new PhpTypeError(`${fn}(): Argument #${position} ($array) must be of type array, ${valueTypeName(value)} given`);
}

/** Whether the PHP array `array` has the normalised key `key`, looked up without copying its entries. */
function hasKey(array: object, key: PhpArrayKey): boolean {
  if (Array.isArray(array)) {
    return typeof key !== "string" && BigInt(key) >= 0n && BigInt(key) < BigInt(array.length);
  }
  if (array instanceof PhpArray) {
    return array.has(key);
  }
  if ((array as Record<symbol, unknown>)[PHP_ARRAY_BRAND] === true) {
    return arrayEntries(array).some(([entry]) => sameKey(entry, key));
  }
  return Object.hasOwn(array, String(key));
}

const PHP_ARRAY_BRAND = Symbol.for("xaravel.php.array");

/**
 * PHP's `array_key_exists($key, $array)`: whether `array` has the key `key` as PHP's array offset reads it: a numeric
 * string is its int, null is `""`, a float truncates, a bool is 0 or 1. Throws PHP's `TypeError` for a non-array, and
 * `Cannot access offset of type <type> on array` for a key no array takes.
 */
export function array_key_exists(key: unknown, array: unknown): boolean {
  const subject = arrayObject("array_key_exists", 2, array);
  return hasKey(subject, normalizeKey(key ?? null));
}

/** The first (`last` false) or last key of the PHP array `array`, or null when it is empty, without copying its entries. */
function edgeKey(array: object, last: boolean): PhpArrayKey | null {
  if (Array.isArray(array)) {
    return array.length === 0 ? null : last ? array.length - 1 : 0;
  }
  if (array instanceof PhpArray || (array as Record<symbol, unknown>)[PHP_ARRAY_BRAND] === true) {
    let found: PhpArrayKey | null = null;
    for (const key of array instanceof PhpArray ? array.keys() : arrayEntries(array).map(([k]) => k)) {
      found = key;
      if (!last) {
        break;
      }
    }
    return found;
  }
  if (!last) {
    for (const key in array) {
      if (Object.hasOwn(array, key)) {
        return normalizeKey(key);
      }
    }
    return null;
  }
  const keys = Object.keys(array);
  return keys.length === 0 ? null : normalizeKey(keys[keys.length - 1]);
}

/** PHP's `array_key_first($array)`: the first key of `array`, or null when it is empty. */
export function array_key_first(array: unknown): PhpArrayKey | null {
  return edgeKey(arrayObject("array_key_first", 1, array), false);
}

/** PHP's `array_key_last($array)`: the last key of `array`, or null when it is empty. */
export function array_key_last(array: unknown): PhpArrayKey | null {
  return edgeKey(arrayObject("array_key_last", 1, array), true);
}

/**
 * PHP's `array_merge(...$arrays)`: the entries of each array in turn, a string key overwriting an earlier one in its
 * place, an int key renumbered from 0; `[]` with no arguments. Throws PHP's `TypeError` `array_merge(): Argument #<n>
 * must be of type array, <type> given` for a non-array.
 */
export function array_merge(...arrays: unknown[]): unknown {
  const lists = arrays.map((value, index) => arrayArgument("array_merge", index + 1, null, value));
  const result = new PhpArray<PhpKeyInput, unknown>();
  for (const entries of lists) {
    for (const [key, value] of entries) {
      if (typeof key === "string") {
        result.set(key, value);
      } else {
        result.push(value);
      }
    }
  }
  return arrayFromEntries(result);
}

/** `php_count_recursive`: the entries of `array` and of every array nested in it; an array already being counted is 0. */
function countRecursive(array: object, counting: Set<object>): number {
  if (counting.has(array)) {
    return 0;
  }
  counting.add(array);
  const entries = arrayEntries(array);
  let count = entries.length;
  for (const [, value] of entries) {
    if (typeof value === "object" && value !== null && !isContractToken(value) && phpType(value) === "array") {
      count += countRecursive(value, counting);
    }
  }
  counting.delete(array);
  return count;
}

/**
 * PHP's `count($value, $mode = COUNT_NORMAL)`: the entries of an array (with `COUNT_RECURSIVE`, those of nested arrays
 * too), or, for an object carrying the `Countable` brand (`Symbol.for("Countable")`), its `count()` as an int. Throws
 * PHP's `ValueError` for a mode other than `COUNT_NORMAL` and `COUNT_RECURSIVE`, and PHP's `TypeError` for any other
 * value.
 */
export function count(value: unknown, mode: unknown = COUNT_NORMAL): number | bigint {
  const countMode = BigInt(intParameter("count", 2, "mode", mode));
  if (countMode !== BigInt(COUNT_NORMAL) && countMode !== BigInt(COUNT_RECURSIVE)) {
    throw new ValueError("count(): Argument #2 ($mode) must be either COUNT_NORMAL or COUNT_RECURSIVE");
  }
  if (typeof value === "object" && value !== null && !isContractToken(value)) {
    const type = phpType(value);
    if (type === "array") {
      return countMode === BigInt(COUNT_RECURSIVE) ? countRecursive(value, new Set()) : arrayCount(value);
    }
    if (type === "object" && (value as Record<symbol, unknown>)[COUNTABLE] === true) {
      return toInt((value as { count(): unknown }).count());
    }
  }
  throw new PhpTypeError(`count(): Argument #1 ($value) must be of type Countable|array, ${valueTypeName(value)} given`);
}

/**
 * A `callable` callback parameter (`array_any`, `array_all`, `array_find_key`, `uasort`): taken as `array_filter`
 * takes one (a PHP function name the runtime exports resolves through `phpFunction`, ESC-14.4-2; any other callable
 * string or array is refused, DIV-9.13), except that null throws PHP's `TypeError` `must be a valid callback, no array
 * or string given`. Internal: the package does not export it.
 */
export function requiredCallback(fn: string, position: number, callback: unknown): (...args: unknown[]) => unknown {
  return callbackParameter(fn, position, callback, false) as (...args: unknown[]) => unknown;
}

/**
 * The first entry of `array` for which `callback(value, key)` is `decisive` (by `zend_is_true`), or null; the
 * callback is not called after it. `php_array_find` of `ext/standard/array.c`.
 */
function findEntry(fn: string, array: unknown, callback: unknown, decisive: boolean): [PhpArrayKey, unknown] | null {
  const entries = arrayParameter(fn, 1, "array", array);
  const test = requiredCallback(fn, 2, callback);
  for (const entry of entries) {
    if (isTrue(test(entry[1], entry[0])) === decisive) {
      return entry;
    }
  }
  return null;
}

/**
 * PHP's `array_any($array, $callback)`: whether `callback(value, key)` is true (by `zend_is_true`) for some entry,
 * stopping at the first; false for `[]`. The callback is taken as `array_filter` takes one (a PHP function name the
 * runtime exports resolves, ESC-14.4-2; any other callable string is refused, DIV-9.13), and must not be null. Throws PHP's `TypeError` for a non-array and for a callback PHP or the runtime refuses.
 */
export function array_any(array: unknown, callback: unknown): boolean {
  return findEntry("array_any", array, callback, true) !== null;
}

/**
 * PHP's `array_all($array, $callback)`: whether `callback(value, key)` is true (by `zend_is_true`) for every entry,
 * stopping at the first that is not; true for `[]`. Throws as `array_any` does.
 */
export function array_all(array: unknown, callback: unknown): boolean {
  return findEntry("array_all", array, callback, false) === null;
}

/**
 * PHP's `array_find_key($array, $callback)`: the key of the first entry for which `callback(value, key)` is true (by
 * `zend_is_true`), or null; the callback is not called after it. Throws as `array_any` does.
 */
export function array_find_key(array: unknown, callback: unknown): PhpArrayKey | null {
  return findEntry("array_find_key", array, callback, true)?.[0] ?? null;
}

/** The first (`last` false) or last value of the PHP array `array`, or null when it is empty. */
function edgeValue(fn: string, array: unknown, last: boolean): unknown {
  if (Array.isArray(array)) {
    return array.length === 0 ? null : ((array[last ? array.length - 1 : 0] as unknown) ?? null);
  }
  const entries = arrayParameter(fn, 1, "array", array);
  return entries.length === 0 ? null : entries[last ? entries.length - 1 : 0]![1];
}

/** PHP's `array_first($array)`: the first value of `array`, or null when it is empty. Throws PHP's `TypeError` for a non-array. */
export function array_first(array: unknown): unknown {
  return edgeValue("array_first", array, false);
}

/** PHP's `array_last($array)`: the last value of `array`, or null when it is empty. Throws PHP's `TypeError` for a non-array. */
export function array_last(array: unknown): unknown {
  return edgeValue("array_last", array, true);
}

/**
 * PHP's `array_search($needle, $haystack, $strict = false)`: the key of the first value of `haystack` that is `==`
 * `needle` (`in_array`'s comparison, the enum rule included), or `===` it (`identical`) when `strict`; false when none
 * is. Throws PHP's `TypeError` for a non-array `haystack` and a `strict` that is no bool, int, float, string or null.
 */
export function array_search(needle: unknown, haystack: unknown, strict: unknown = false): PhpArrayKey | false {
  const entries = arrayParameter("array_search", 2, "haystack", haystack);
  const isStrict = boolParameter("array_search", 3, "strict", strict);
  const value = needle ?? null;
  const found = entries.find(([, entry]) => (isStrict ? identical(value, entry) : zendEquals(value, entry)));
  return found === undefined ? false : found[0];
}

/**
 * PHP's `array_flip($array)`: each value of `array` as a key (a numeric string normalised to its int, as PHP's
 * `zend_symtable_update` does) whose value is its key; a repeated value keeps its first place and its last key. A
 * value that is no int or string is skipped (PHP warns). Throws PHP's `TypeError` for a non-array.
 */
export function array_flip(array: unknown): unknown {
  const entries = arrayParameter("array_flip", 1, "array", array);
  const flipped = new PhpArray<PhpKeyInput, unknown>();
  for (const [key, value] of entries) {
    const type = phpType(value);
    if (type === "int") {
      flipped.set(value as number | bigint, key);
    } else if (type === "string") {
      flipped.set(value as string, key);
    }
  }
  return arrayFromEntries(flipped);
}

/**
 * The entries `entries` gives, a string key kept and an int key kept when `preserveKeys`, else renumbered from 0 in
 * order (`zend_hash_next_index_insert_new`).
 */
function renumbered(entries: Iterable<readonly [PhpArrayKey, unknown]>, preserveKeys: boolean): unknown {
  const result = new PhpArray<PhpKeyInput, unknown>();
  for (const [key, value] of entries) {
    if (typeof key === "string" || preserveKeys) {
      result.set(key, value);
    } else {
      result.push(value);
    }
  }
  return arrayFromEntries(result);
}

/**
 * PHP's `array_slice($array, $offset, $length = null, $preserve_keys = false)`: `length` entries of `array` from
 * position `offset` (a negative `offset` counts from the end; a negative `length` stops that many entries before it;
 * null runs to the end). A string key is kept; an int key is kept with `preserve_keys`, else renumbered from 0.
 * Throws PHP's `TypeError` for a non-array, an `offset` that is no int, a `length` that is no int or null, and a
 * `preserve_keys` that is no bool.
 */
export function array_slice(array: unknown, offset: unknown, length: unknown = null, preserve_keys: unknown = false): unknown {
  const entries = arrayParameter("array_slice", 1, "array", array);
  let from = BigInt(intParameter("array_slice", 2, "offset", offset));
  const userLength = nullableIntParameter("array_slice", 3, "length", length);
  const preserve = boolParameter("array_slice", 4, "preserve_keys", preserve_keys);
  const count = BigInt(entries.length);
  let size = userLength === null ? count : BigInt(userLength);
  if (from > count) {
    return [];
  }
  if (from < 0n && (from = count + from) < 0n) {
    from = 0n;
  }
  if (size < 0n) {
    size = count - from + size;
  } else if (from + size > count) {
    size = count - from;
  }
  if (size <= 0n) {
    return [];
  }
  return renumbered(entries.slice(Number(from), Number(from + size)), preserve);
}

/**
 * PHP's `array_reverse($array, $preserve_keys = false)`: the entries of `array` in reverse order, a string key kept
 * and an int key kept with `preserve_keys`, else renumbered from 0. Throws PHP's `TypeError` for a non-array and a
 * `preserve_keys` that is no bool.
 */
export function array_reverse(array: unknown, preserve_keys: unknown = false): unknown {
  const entries = arrayParameter("array_reverse", 1, "array", array);
  const preserve = boolParameter("array_reverse", 2, "preserve_keys", preserve_keys);
  return renumbered(entries.reverse(), preserve);
}

/** The arrays of `array_intersect_key` / `array_intersect_assoc`, each checked as PHP checks them, in order. */
function intersectArguments(fn: string, array: unknown, arrays: unknown[]): { first: [PhpArrayKey, unknown][]; others: Map<string, unknown>[] } {
  const first = arrayParameter(fn, 1, "array", array);
  const others = arrays.map((other, index) => {
    if (typeof other === "object" && other !== null && phpType(other) === "array") {
      return new Map(arrayEntries(other).map(([key, value]) => [keyId(key), value] as const));
    }
    throw new PhpTypeError(`${fn}(): Argument #${index + 2} must be of type array, ${phpTypeName(phpValueOf(other ?? null))} given`);
  });
  return { first, others };
}

/** A normalised key as a map key: an int as `i<digits>`, a string as `s<string>`. */
function keyId(key: PhpArrayKey): string {
  return typeof key === "string" ? `s${key}` : `i${key}`;
}

/**
 * PHP's `array_intersect_key($array, ...$arrays)`: the entries of `array`, keys kept, whose key every other array has
 * (`"1"` and `1` are one key); `array` itself with no other array. Throws PHP's `TypeError` for a non-array
 * (`Argument #1 ($array)`, then `Argument #2` and on, unnamed).
 */
export function array_intersect_key(array: unknown, ...arrays: unknown[]): unknown {
  const { first, others } = intersectArguments("array_intersect_key", array, arrays);
  return arrayFromEntries(first.filter(([key]) => others.every((other) => other.has(keyId(key)))));
}

/**
 * PHP's `array_intersect_assoc($array, ...$arrays)`: the entries of `array`, keys kept, whose key every other array
 * has with a value whose string is the same (`string_compare_function`: `(string) $a === (string) $b`, so an array
 * reads as `"Array"`). Throws PHP's `TypeError` for a non-array (as `array_intersect_key` does) and PHP's `Error` for an
 * object without a `__toString` port.
 */
export function array_intersect_assoc(array: unknown, ...arrays: unknown[]): unknown {
  const { first, others } = intersectArguments("array_intersect_assoc", array, arrays);
  return arrayFromEntries(
    first.filter(([key, value]) =>
      others.every((other) => {
        const id = keyId(key);
        return other.has(id) && toPhpString(value) === toPhpString(other.get(id));
      }),
    ),
  );
}

/** An int or a float as `min` / `max`'s fast paths read it, or null for any other value. */
type FastNumber = { readonly int: bigint } | { readonly float: number } | null;

function fastNumber(value: unknown): FastNumber {
  switch (phpType(value)) {
    case "int":
      return { int: BigInt(value as number | bigint) };
    case "float":
      return { float: floatValue(value) };
    default:
      return null;
  }
}

/** Whether the int `value` is exactly a double (`zend_dval_to_lval_silent((double) value) == value`). */
function exactDouble(value: bigint): boolean {
  const double = Number(value);
  return double !== 2 ** 63 && BigInt(double) === value;
}

/**
 * PHP 8.5's two-argument `min` / `max` (`ZEND_FRAMELESS_FUNCTION(min, 2)` / `(max, 2)`, what a direct call
 * compiles to): `min` keeps `lhs` when it is less (`rhs` when equal), `max` keeps `lhs` when it is greater or equal,
 * comparing two numbers directly (so a NAN loses only as PHP's comparisons make it) and anything else by `zend_compare`.
 */
function minMaxPair(lhs: unknown, rhs: unknown, max: boolean): unknown {
  const left = fastNumber(lhs);
  const right = fastNumber(rhs);
  const keepLeft = (x: number, y: number): boolean => (max ? x >= y : x < y);
  if (left !== null && right !== null) {
    if ("int" in left && "int" in right) {
      return (max ? left.int >= right.int : left.int < right.int) ? lhs : rhs;
    }
    if ("int" in left && "float" in right && exactDouble(left.int)) {
      return keepLeft(Number(left.int), right.float) ? lhs : rhs;
    }
    if ("float" in left && "float" in right) {
      return keepLeft(left.float, right.float) ? lhs : rhs;
    }
    if ("float" in left && "int" in right && exactDouble(right.int)) {
      return keepLeft(left.float, Number(right.int)) ? lhs : rhs;
    }
  }
  const order = zendCompare(lhs, rhs);
  return (max ? order >= 0 : order < 0) ? lhs : rhs;
}

/**
 * PHP's variadic `min` / `max` over three or more arguments: the first argument, replaced by each later one that is
 * less (`min`) or greater (`max`), comparing ints and floats directly while every value so far is one (PHP's fast
 * paths) and anything else by `zend_compare`.
 */
function minMaxList(values: unknown[], max: boolean): unknown {
  let best = values[0];
  const first = fastNumber(best);
  let mode: "int" | "float" | "generic" = first === null ? "generic" : "int" in first ? "int" : "float";
  let intBest = first !== null && "int" in first ? first.int : 0n;
  let floatBest = first !== null && "float" in first ? first.float : 0;
  const better = (x: number, y: number): boolean => (max ? x < y : x > y);
  for (const value of values.slice(1)) {
    const fast = fastNumber(value);
    if (mode === "int") {
      if (fast !== null && "int" in fast) {
        if (max ? intBest < fast.int : intBest > fast.int) {
          intBest = fast.int;
          best = value;
        }
        continue;
      }
      if (fast !== null && "float" in fast && exactDouble(intBest)) {
        floatBest = Number(intBest);
        mode = "float";
      } else {
        mode = "generic";
      }
    }
    if (mode === "float") {
      if (fast !== null && "float" in fast) {
        if (better(floatBest, fast.float)) {
          floatBest = fast.float;
          best = value;
        }
        continue;
      }
      if (fast !== null && "int" in fast && exactDouble(fast.int)) {
        if (better(floatBest, Number(fast.int))) {
          floatBest = Number(fast.int);
          best = value;
        }
        continue;
      }
      mode = "generic";
    }
    const order = zendCompare(value, best);
    if (max ? order > 0 : order < 0) {
      best = value;
    }
  }
  return best;
}

/** `min` / `max` (`fn`) over `values`, as PHP 8.5's `min` / `max` read their arguments. */
function minMax(fn: "min" | "max", values: unknown[]): unknown {
  const max = fn === "max";
  const args = values.map((value) => value ?? null);
  if (args.length === 0) {
    throw new ArgumentCountError(`${fn}() expects at least 1 argument, 0 given`);
  }
  if (args.length === 1) {
    const entries = arrayParameter(fn, 1, "value", args[0]);
    if (entries.length === 0) {
      throw new ValueError(`${fn}(): Argument #1 ($value) must contain at least one element`);
    }
    // `zend_hash_minmax`: the kept value against each later one.
    let best = entries[0]![1];
    for (const [, value] of entries.slice(1)) {
      const order = zendCompare(best, value);
      if (max ? order < 0 : order > 0) {
        best = value;
      }
    }
    return best;
  }
  return args.length === 2 ? minMaxPair(args[0], args[1], max) : minMaxList(args, max);
}

/**
 * PHP's `min($value, ...$values)`. With one argument, the least value of that array (`zend_hash_minmax`: the first
 * kept unless a later one compares less). With two, PHP 8.5's direct-call form: the first when it is less, else the
 * second. With more, the first argument replaced by each later one that is less. Values compare by `zend_compare`
 * (`spaceship`, with PHP's enum rule), two numbers directly as PHP's fast paths do. Throws PHP's
 * `ArgumentCountError` with no argument, `TypeError` for one argument that is no array, and `ValueError` for an
 * empty array.
 */
export function min(...values: unknown[]): unknown {
  return minMax("min", values);
}

/**
 * PHP's `max($value, ...$values)`, as `min` with the comparison reversed; with two arguments the first is kept when it
 * is greater or equal.
 */
export function max(...values: unknown[]): unknown {
  return minMax("max", values);
}

/**
 * `php_array_user_compare_unstable`: `callback(a, b)` read as PHP reads it, its `zval_get_long` (`toInt`) and then its
 * sign; a `false` result calls `callback(b, a)` and negates that sign, and `true` is 1 (PHP's bool deprecation is not
 * reproduced). Once a call has thrown (or its result could not be read), no further call is made: PHP's
 * `zend_call_function` returns at once while an exception is pending, and the comparison is 0. Internal: the package
 * does not export it (`uasort` and the set functions share it).
 */
export function userCompare(callback: (...args: unknown[]) => unknown, failed: { error: { thrown: unknown } | null }): (a: unknown, b: unknown) => number {
  // The sign of `callback(a, b)` (null for a `false` result), read inside the try: a throw from the callback or from
  // reading its result is recorded, and the comparison is 0.
  const call = (a: unknown, b: unknown): number | null => {
    if (failed.error !== null) {
      return 0;
    }
    try {
      const result = callback(a, b) ?? null;
      if (result === false) {
        return null;
      }
      const long = toInt(result);
      return long > 0 ? 1 : long < 0 ? -1 : 0;
    } catch (thrown) {
      failed.error = { thrown };
      return 0;
    }
  };
  return (a, b) => {
    const first = call(a, b);
    if (first !== null) {
      return first;
    }
    const swapped = call(b, a);
    return swapped === null ? 0 : -swapped;
  };
}

/**
 * The next free index `entries`' own keys give (the largest int key plus 1), or null when none is an int. Internal: the
 * package does not export it.
 */
export function derivedNextFree(entries: readonly (readonly [PhpArrayKey, unknown])[]): bigint | null {
  let next: bigint | null = null;
  for (const [key] of entries) {
    if (typeof key !== "string" && (next === null || BigInt(key) >= next)) {
      next = BigInt(key) + 1n;
    }
  }
  return next;
}

/**
 * `entries` as the written-back array of a function that keeps the keys: through `arrayFromEntries`, unless `nextFree`
 * (PHP's kept next free index) differs from the one the keys give, which only a `PhpArray` carries. Internal: the
 * package does not export it.
 */
export function keptArray(entries: readonly (readonly [PhpArrayKey, unknown])[], nextFree: bigint | null): unknown {
  return nextFree === derivedNextFree(entries) ? arrayFromEntries(entries) : phpArrayWithNextFree(entries, nextFree);
}

/**
 * The next free index of the PHP array `array` (`nNextFreeElement`), which `zend_array_dup` and `ZVAL_COPY` keep:
 * a `PhpArray`'s own, else the one its keys give.
 */
function nextFreeOf(array: object): bigint | null {
  return array instanceof PhpArray ? nextFreeIndex(array) : derivedNextFree(arrayEntries(array));
}

/** A copy of the PHP array `array` (`zend_array_dup`) as a `PhpArray` to build on, its next free index kept. */
function dupArray(array: object): PhpArray<PhpKeyInput, unknown> {
  return phpArrayWithNextFree(arrayEntries(array), nextFreeOf(array)) as PhpArray<PhpKeyInput, unknown>;
}

/** `built` (a `dupArray` worked on) in the AD-9 form, or a `PhpArray` when its next free index is not its keys'. */
function keptDup(built: PhpArray<PhpKeyInput, unknown>): unknown {
  return keptArray([...built], nextFreeIndex(built));
}

/** A PHP array as an argument of a set function, for its `TypeError`: `Argument #1 ($array)`, the others unnamed. */
function setArgument(fn: string, position: number, value: unknown, firstName: string | null = "array"): [PhpArrayKey, unknown][] {
  return arrayArgument(fn, position, position === 1 ? firstName : null, value);
}

/** PHP's `ArgumentCountError` when `given` arguments are fewer than `minimum` (`zend_wrong_parameters_count_error`). */
function atLeast(fn: string, minimum: number, given: number): void {
  if (given < minimum) {
    throw new ArgumentCountError(`${fn}() expects at least ${minimum} argument${minimum === 1 ? "" : "s"}, ${given} given`);
  }
}

/** `string_compare_function`: `(string) $a` against `(string) $b` by their bytes (an array is `"Array"`). */
function stringCompare(a: unknown, b: unknown): number {
  const left = toPhpString(a);
  return binaryStrcmp(left, toPhpString(b));
}

/** A normalised key as PHP's `php_array_key_compare_string` reads it: an int as its decimal string. */
function keyString(key: PhpArrayKey): string {
  return typeof key === "string" ? key : String(key);
}

/** A hash bucket of `php_array_diff` / `php_array_intersect`: a key and its value. */
type Bucket = { readonly key: PhpArrayKey; readonly value: unknown };

/** A comparator of two buckets. */
type BucketCompare = (a: Bucket, b: Bucket) => number;

/** `php_array_key_compare_string_unstable`: the keys as strings, by their bytes. */
const keyCompare: BucketCompare = (a, b) => binaryStrcmp(keyString(a.key), keyString(b.key));

/** `php_array_data_compare_string_unstable`: the values by `string_compare_function`. */
const dataCompare: BucketCompare = (a, b) => stringCompare(a.value, b.value);

/** The comparators and the failure record of a sorted-list diff or intersection (`php_array_diff` / `php_array_intersect`). */
type SetCompare = { readonly data: BucketCompare; readonly key: BucketCompare; readonly failed: { error: { thrown: unknown } | null } };

/**
 * The comparators of a set function: the user callback on values (`data`, `php_array_user_compare_unstable`) or keys
 * (`key`, `php_array_user_key_compare_unstable`), the string comparisons otherwise.
 */
function setCompare(callback: ((...args: unknown[]) => unknown) | null, on: "data" | "key" | null): SetCompare {
  const failed: { error: { thrown: unknown } | null } = { error: null };
  if (callback === null || on === null) {
    return { data: dataCompare, key: keyCompare, failed };
  }
  const user = userCompare(callback, failed);
  return on === "data" ? { data: (a, b) => user(a.value, b.value), key: keyCompare, failed } : { data: dataCompare, key: (a, b) => user(a.key, b.key), failed };
}

/**
 * The arguments of a callback form (`"+f"`): at least one array and the callback, which comes last and is checked
 * first (PHP's `TypeError` `must be a valid callback, no array or string given`, or the DIV-9.13 one); the arrays are
 * checked later, as PHP checks them.
 */
function callbackArguments(fn: string, args: readonly unknown[]): { arrays: unknown[]; callback: (...args: unknown[]) => unknown } {
  atLeast(fn, 2, args.length);
  const callback = callbackParameter(fn, args.length, args[args.length - 1], false, null) as (...args: unknown[]) => unknown;
  return { arrays: args.slice(0, -1), callback };
}

/**
 * The bucket lists of `php_array_diff` / `php_array_intersect`: each argument's entries in order, checked as an array
 * (PHP's `TypeError`) and sorted with `zend_sort` by `cmp` when it has more than one, argument by argument.
 */
function sortedLists(fn: string, arrays: readonly unknown[], cmp: BucketCompare): Bucket[][] {
  return arrays.map((array, index) => {
    const list = setArgument(fn, index + 1, array).map(([key, value]) => ({ key, value }));
    if (list.length > 1) {
      zendSort(list, cmp);
    }
    return list;
  });
}

/** The behaviours of `php_array_diff` and `php_array_intersect`: by value (`NORMAL`), by key and value (`ASSOC`), by key (`KEY`). */
type SetBehavior = "normal" | "assoc" | "key";

/**
 * The entries of `first` whose keys `deleted` does not hold, in order: the copy of `array` PHP deletes from
 * (`zend_array_dup`), so its next free index is `array`'s.
 */
function remaining(array: object, first: readonly Bucket[], deleted: ReadonlySet<string>): unknown {
  const kept: [PhpArrayKey, unknown][] = [];
  for (const { key, value } of first) {
    if (!deleted.has(keyId(key))) {
      kept.push([key, value]);
    }
  }
  return keptArray(kept, nextFreeOf(array));
}

/** Throws what a user comparison threw, after the algorithm ran on as PHP's does. */
function rethrow(compare: SetCompare): void {
  if (compare.failed.error !== null) {
    throw compare.failed.error.thrown;
  }
}

/**
 * `php_array_intersect` as written: every argument's list sorted (by value for `normal`, by key otherwise), then
 * walked in step, deleting from a copy of the first array each entry that some other list lacks.
 */
function phpArrayIntersect(fn: string, arrays: readonly unknown[], behavior: SetBehavior, compare: SetCompare): unknown {
  const lists = sortedLists(fn, arrays, behavior === "normal" ? compare.data : compare.key);
  const first = arrayEntries(arrays[0] as object).map(([key, value]) => ({ key, value }));
  const list0 = lists[0]!;
  const ptrs = lists.map(() => 0);
  const deleted = new Set<string>();
  const remove = (bucket: Bucket): void => {
    deleted.add(keyId(bucket.key));
  };
  let c = 0;
  out: while (ptrs[0]! < list0.length) {
    let i = 1;
    for (; i < lists.length; i++) {
      const list = lists[i]!;
      if (behavior === "normal") {
        while (ptrs[i]! < list.length && 0 < (c = compare.data(list0[ptrs[0]!]!, list[ptrs[i]!]!))) {
          ptrs[i]!++;
        }
      } else {
        while (ptrs[i]! < list.length && 0 < (c = compare.key(list0[ptrs[0]!]!, list[ptrs[i]!]!))) {
          ptrs[i]!++;
        }
        if (c === 0 && ptrs[i]! < list.length && behavior === "assoc" && compare.data(list0[ptrs[0]!]!, list[ptrs[i]!]!) !== 0) {
          c = 1;
        }
      }
      if (ptrs[i] === list.length) {
        // The rest of the first list is in no other argument.
        for (;;) {
          const p = ptrs[0]!++;
          if (p >= list0.length) {
            break out;
          }
          remove(list0[p]!);
        }
      }
      if (c !== 0) {
        break;
      }
      ptrs[i]!++;
    }
    if (c !== 0) {
      // The value of ptrs[0] is not in every argument: delete it, and every following one less than ptrs[i]'s.
      for (;;) {
        remove(list0[ptrs[0]!]!);
        if (++ptrs[0]! >= list0.length) {
          break out;
        }
        if (behavior !== "normal" || 0 <= compare.data(list0[ptrs[0]!]!, lists[i]![ptrs[i]!]!)) {
          break;
        }
      }
    } else {
      // The value of ptrs[0] is in every argument: skip every entry equal to it.
      for (;;) {
        if (++ptrs[0]! >= list0.length) {
          break out;
        }
        if (behavior !== "normal" || compare.data(list0[ptrs[0]! - 1]!, list0[ptrs[0]!]!) !== 0) {
          break;
        }
      }
    }
  }
  rethrow(compare);
  return remaining(arrays[0] as object, first, deleted);
}

/**
 * `php_array_diff` as written: every argument's list sorted (by value for `normal`, by key otherwise), then walked,
 * deleting from a copy of the first array each entry that some other list holds.
 */
function phpArrayDiff(fn: string, arrays: readonly unknown[], behavior: SetBehavior, compare: SetCompare): unknown {
  const lists = sortedLists(fn, arrays, behavior === "normal" ? compare.data : compare.key);
  const first = arrayEntries(arrays[0] as object).map(([key, value]) => ({ key, value }));
  const list0 = lists[0]!;
  const ptrs = lists.map(() => 0);
  const deleted = new Set<string>();
  out: while (ptrs[0]! < list0.length) {
    let c = 1;
    for (let i = 1; i < lists.length; i++) {
      const list = lists[i]!;
      let ptr = ptrs[i]!;
      if (behavior === "normal") {
        while (ptrs[i]! < list.length && 0 < (c = compare.data(list0[ptrs[0]!]!, list[ptrs[i]!]!))) {
          ptrs[i]!++;
        }
      } else {
        while (ptr < list.length && 0 !== (c = compare.key(list0[ptrs[0]!]!, list[ptr]!))) {
          ptr++;
        }
      }
      if (c === 0) {
        if (behavior === "normal") {
          if (ptrs[i]! < list.length) {
            ptrs[i]!++;
          }
          break;
        }
        if (behavior === "key") {
          break;
        }
        if (ptr < list.length) {
          if (compare.data(list0[ptrs[0]!]!, list[ptr]!) === 0) {
            break;
          }
          c = -1;
        }
      }
    }
    if (c === 0) {
      // ptrs[0] is in another argument: delete it, and every following entry equal to it.
      for (;;) {
        deleted.add(keyId(list0[ptrs[0]!]!.key));
        if (++ptrs[0]! >= list0.length) {
          break out;
        }
        if (behavior !== "normal" || compare.data(list0[ptrs[0]! - 1]!, list0[ptrs[0]!]!) !== 0) {
          break;
        }
      }
    } else {
      // ptrs[0] is in no other argument: skip every following entry equal to it.
      for (;;) {
        if (++ptrs[0]! >= list0.length) {
          break out;
        }
        if (behavior !== "normal" || compare.data(list0[ptrs[0]! - 1]!, list0[ptrs[0]!]!) !== 0) {
          break;
        }
      }
    }
  }
  rethrow(compare);
  return remaining(arrays[0] as object, first, deleted);
}

/**
 * PHP's `array_diff($array, ...$arrays)`: the entries of `array`, keys kept, whose value's string is the string of no
 * value of the other arrays (`(string) $a === (string) $b`: an array reads as `"Array"`, `1`, `"1"`, `1.0` and `true`
 * are one); `array` itself with no other value. It ports `PHP_FUNCTION(array_diff)`'s paths (an empty and a
 * one-element `array` read no string of the others but the first that matches). Throws PHP's `ArgumentCountError`
 * with no argument, `TypeError` for a non-array (`Argument #1 ($array)`, then `Argument #2` and on, unnamed), and
 * PHP's `Error` for an object without a `__toString` port.
 */
export function array_diff(...args: [array: unknown, ...arrays: unknown[]]): unknown {
  const fn = "array_diff";
  atLeast(fn, 1, args.length);
  const first = setArgument(fn, 1, args[0]);
  const others = args.slice(1);
  if (first.length === 0) {
    others.forEach((other, index) => setArgument(fn, index + 2, other));
    return [];
  }
  if (first.length === 1) {
    const search = toPhpString(first[0]![1]);
    let found = false;
    others.forEach((other, index) => {
      const entries = setArgument(fn, index + 2, other);
      if (!found) {
        found = entries.some(([, value]) => toPhpString(value) === search);
      }
    });
    return found ? [] : keptArray(first, nextFreeOf(args[0] as object));
  }
  const lists = others.map((other, index) => setArgument(fn, index + 2, other));
  if (lists.every((entries) => entries.length === 0)) {
    return keptArray(first, nextFreeOf(args[0] as object));
  }
  const exclude = new Set<string>();
  for (const entries of lists) {
    for (const [, value] of entries) {
      exclude.add(toPhpString(value));
    }
  }
  return arrayFromEntries(first.filter(([, value]) => !exclude.has(toPhpString(value))));
}

/**
 * `php_array_diff_key`: the entries of `array`, keys kept, whose key no other array has (`"1"` and `1` are one key),
 * or, with `compareData`, has with a value whose string is the same (`string_compare_function`).
 */
function phpArrayDiffKey(fn: string, args: readonly unknown[], compareData: boolean): unknown {
  atLeast(fn, 1, args.length);
  const first = setArgument(fn, 1, args[0]);
  const others = args.slice(1).map((other, index) => new Map(setArgument(fn, index + 2, other).map(([key, value]) => [keyId(key), value] as const)));
  return arrayFromEntries(
    first.filter(([key, value]) => {
      const id = keyId(key);
      return !others.some((other) => other.has(id) && (!compareData || stringCompare(value, other.get(id)) === 0));
    }),
  );
}

/**
 * PHP's `array_diff_key($array, ...$arrays)`: the entries of `array`, keys kept, whose key no other array has (`"1"`
 * and `1` are one key). Throws as `array_diff` does for its arguments.
 */
export function array_diff_key(...args: [array: unknown, ...arrays: unknown[]]): unknown {
  return phpArrayDiffKey("array_diff_key", args, false);
}

/**
 * PHP's `array_diff_assoc($array, ...$arrays)`: the entries of `array`, keys kept, that no other array has under the
 * same key with a value whose string is the same (`string_compare_function`). Throws as `array_diff` does.
 */
export function array_diff_assoc(...args: [array: unknown, ...arrays: unknown[]]): unknown {
  return phpArrayDiffKey("array_diff_assoc", args, true);
}

/**
 * PHP's `array_intersect($array, ...$arrays)`: the entries of `array`, keys kept, whose value's string is the string of
 * a value of every other array. It ports `php_array_intersect`: each array sorted by `zend_sort` with the string
 * comparison, then walked in step. Throws PHP's `ArgumentCountError` with no argument, `TypeError` for a non-array
 * (`Argument #1 ($array)`, then unnamed) and `Error` for an object without a `__toString` port.
 */
export function array_intersect(...args: [array: unknown, ...arrays: unknown[]]): unknown {
  atLeast("array_intersect", 1, args.length);
  return phpArrayIntersect("array_intersect", args, "normal", setCompare(null, null));
}

/**
 * PHP's `array_udiff($array, ...$arrays, $value_compare_func)`: `array_diff` with `value_compare_func(a, b)` comparing
 * the values. It ports `php_array_diff` as written: each array sorted by `zend_sort` with the callback, then walked, so
 * the callback is called in PHP's order and an inconsistent one gives PHP's result. The callback's result is read as
 * `uasort` reads it (`(int)`, its sign; `false` retried swapped); after it throws, it is not called again and the
 * exception propagates. The callback is taken as `array_any` takes one, a PHP function name included. Throws PHP's
 * `ArgumentCountError` for fewer than two arguments, `TypeError` for an invalid callback (`Argument #<n> must be a valid
 * callback, …`) and for a non-array.
 */
export function array_udiff(...args: [array: unknown, ...rest: unknown[]]): unknown {
  const { arrays, callback } = callbackArguments("array_udiff", args);
  return phpArrayDiff("array_udiff", arrays, "normal", setCompare(callback, "data"));
}

/**
 * PHP's `array_diff_uassoc($array, ...$arrays, $key_compare_func)`: `array_diff_assoc` with `key_compare_func(a, b)`
 * comparing the keys (an int key as an int) and the values compared as strings. It ports `php_array_diff`: each array
 * sorted by key with the callback, then each entry's key looked up in every other array by the callback, in PHP's
 * order. Throws as `array_udiff` does.
 */
export function array_diff_uassoc(...args: [array: unknown, ...rest: unknown[]]): unknown {
  const { arrays, callback } = callbackArguments("array_diff_uassoc", args);
  return phpArrayDiff("array_diff_uassoc", arrays, "assoc", setCompare(callback, "key"));
}

/**
 * PHP's `array_diff_ukey($array, ...$arrays, $key_compare_func)`: `array_diff_key` with `key_compare_func(a, b)`
 * comparing the keys, as `php_array_diff` calls it. Throws as `array_udiff` does.
 */
export function array_diff_ukey(...args: [array: unknown, ...rest: unknown[]]): unknown {
  const { arrays, callback } = callbackArguments("array_diff_ukey", args);
  return phpArrayDiff("array_diff_ukey", arrays, "key", setCompare(callback, "key"));
}

/**
 * PHP's `array_uintersect($array, ...$arrays, $value_compare_func)`: `array_intersect` with `value_compare_func(a, b)`
 * comparing the values, as `php_array_intersect` calls it. Throws as `array_udiff` does.
 */
export function array_uintersect(...args: [array: unknown, ...rest: unknown[]]): unknown {
  const { arrays, callback } = callbackArguments("array_uintersect", args);
  return phpArrayIntersect("array_uintersect", arrays, "normal", setCompare(callback, "data"));
}

/**
 * PHP's `array_intersect_uassoc($array, ...$arrays, $key_compare_func)`: `array_intersect_assoc` with
 * `key_compare_func(a, b)` comparing the keys and the values compared as strings, as `php_array_intersect` calls it.
 * Throws as `array_udiff` does.
 */
export function array_intersect_uassoc(...args: [array: unknown, ...rest: unknown[]]): unknown {
  const { arrays, callback } = callbackArguments("array_intersect_uassoc", args);
  return phpArrayIntersect("array_intersect_uassoc", arrays, "assoc", setCompare(callback, "key"));
}

/** Whether `value` is a PHP array (a contract token is a string). */
function isPhpArray(value: unknown): value is object {
  return typeof value === "object" && value !== null && !isContractToken(value) && phpType(value) === "array";
}

/**
 * `php_array_merge_recursive`: each entry of `src` into `dest`, an int key appended, a new string key added, and a
 * string key `dest` has merged: `dest`'s value as an array (null `[null]`, an object its properties, a scalar or a
 * contract token, which is its class-string, `[scalar]`), then `src`'s value merged into it when it is an array (an
 * object read as its properties) or appended.
 * `protecting` holds `dest`'s arrays being merged into; meeting one again throws PHP's `Error` `Recursion detected`.
 */
function mergeRecursive(dest: PhpArray<PhpKeyInput, unknown>, src: readonly [PhpArrayKey, unknown][], protecting: Set<object>): void {
  for (const [key, value] of src) {
    if (typeof key !== "string") {
      dest.push(value);
      continue;
    }
    if (!dest.has(key)) {
      dest.set(key, value);
      continue;
    }
    const current = dest.get(key) ?? null;
    const thash = isPhpArray(current) ? current : null;
    if (thash !== null && protecting.has(thash)) {
      throw new PhpError("Recursion detected");
    }
    // A contract token is its class-string (AD-9), which `convert_to_array` wraps as a scalar.
    const target =
      current === null || isContractToken(current)
        ? new PhpArray<PhpKeyInput, unknown>([[0, current]])
        : thash !== null
          ? dupArray(thash)
          : (toPhpArray(current) as PhpArray<PhpKeyInput, unknown>);
    const source = phpType(value) === "object" && !isContractToken(value) ? toPhpArray(value) : value;
    if (isPhpArray(source)) {
      if (thash !== null) {
        protecting.add(thash);
      }
      try {
        mergeRecursive(target, arrayEntries(source), protecting);
      } finally {
        if (thash !== null) {
          protecting.delete(thash);
        }
      }
    } else {
      target.push(source ?? null);
    }
    dest.set(key, keptDup(target));
  }
}

/**
 * PHP's `array_merge_recursive(...$arrays)`: `array_merge`, except that a string key two arrays share holds both
 * values: merged recursively when both are arrays, else gathered into a list (`['a' => 1] + ['a' => 2]` gives
 * `['a' => [1, 2]]`; null gives `[null]`, an object its properties). Int keys are renumbered from 0; `[]` with no
 * argument. Throws PHP's `TypeError` `array_merge_recursive(): Argument #<n> must be of type array, <type> given` for
 * a non-array, and PHP's `Error` `Recursion detected` for a self-referencing value it would merge into itself.
 */
export function array_merge_recursive(...arrays: unknown[]): unknown {
  const fn = "array_merge_recursive";
  if (arrays.length === 0) {
    return [];
  }
  const lists = arrays.map((value, index) => setArgument(fn, index + 1, value, null));
  const dest = new PhpArray<PhpKeyInput, unknown>();
  for (const [key, value] of lists[0]!) {
    if (typeof key === "string") {
      dest.set(key, value);
    } else {
      dest.push(value);
    }
  }
  for (const entries of lists.slice(1)) {
    mergeRecursive(dest, entries, new Set());
  }
  return arrayFromEntries(dest);
}

/** The arrays of `array_replace` / `array_replace_recursive`, each checked, and a copy of the first, keys kept. */
function replaceArguments(fn: string, args: readonly unknown[]): { dest: PhpArray<PhpKeyInput, unknown>; others: [PhpArrayKey, unknown][][] } {
  atLeast(fn, 1, args.length);
  const lists = args.map((value, index) => setArgument(fn, index + 1, value));
  return { dest: dupArray(args[0] as object), others: lists.slice(1) };
}

/**
 * PHP's `array_replace($array, ...$replacements)`: `array` with each later array's entries set over it in turn (`zend_hash_merge`
 * with overwrite): a key it has keeps its place and takes the new value, any other key, int or string, is added
 * with its key. Throws PHP's `ArgumentCountError` with no argument and `TypeError` for a non-array (`Argument #1
 * ($array)`, then unnamed).
 */
export function array_replace(...args: [array: unknown, ...replacements: unknown[]]): unknown {
  const { dest, others } = replaceArguments("array_replace", args);
  for (const entries of others) {
    for (const [key, value] of entries) {
      dest.set(key, value);
    }
  }
  return keptDup(dest);
}

/**
 * `php_array_replace_recursive`: each entry of `src` set over `dest`, except that an array value replacing an array
 * value is replaced into it recursively. `protecting` holds `src`'s arrays being replaced from; meeting one again
 * throws PHP's `Error` `Recursion detected` (PHP protects `dest`'s separated copies too, which are fresh arrays).
 */
function replaceRecursive(dest: PhpArray<PhpKeyInput, unknown>, src: readonly [PhpArrayKey, unknown][], protecting: Set<object>): void {
  for (const [key, value] of src) {
    const current = dest.has(key) ? (dest.get(key) ?? null) : null;
    if (!isPhpArray(value) || !isPhpArray(current)) {
      dest.set(key, value);
      continue;
    }
    if (protecting.has(value)) {
      throw new PhpError("Recursion detected");
    }
    const target = dupArray(current);
    protecting.add(value);
    try {
      replaceRecursive(target, arrayEntries(value), protecting);
    } finally {
      protecting.delete(value);
    }
    dest.set(key, keptDup(target));
  }
}

/**
 * PHP's `array_replace_recursive($array, ...$replacements)`: `array_replace`, except that an array value replacing an
 * array value under the same key is replaced into it recursively. Throws as `array_replace` does, and PHP's `Error`
 * `Recursion detected` for a self-referencing replacement it would replace into itself.
 */
export function array_replace_recursive(...args: [array: unknown, ...replacements: unknown[]]): unknown {
  const { dest, others } = replaceArguments("array_replace_recursive", args);
  for (const entries of others) {
    replaceRecursive(dest, entries, new Set());
  }
  return keptDup(dest);
}

/** PHP's `HT_MAX_SIZE` on a 64-bit build: the largest number of elements an array holds. */
const HT_MAX_SIZE = 0x40000000n;

/**
 * PHP's `array_pad($array, $length, $value)`: `array` padded with `value` to `|length|` entries, on the right for a
 * positive `length` and on the left for a negative one; `array` itself when it has `|length|` entries or more. Int keys
 * are renumbered from 0 and string keys kept. Throws PHP's `TypeError` for a non-array and a `length` that is no int,
 * and PHP's `ValueError` `array_pad(): Argument #2 ($length) must not exceed the maximum allowed array size` for a
 * `|length|` above 2^30.
 */
export function array_pad(array: unknown, length: unknown, value: unknown): unknown {
  const entries = arrayParameter("array_pad", 1, "array", array);
  const size = BigInt(intParameter("array_pad", 2, "length", length));
  if (size < -HT_MAX_SIZE || size > HT_MAX_SIZE) {
    throw new ValueError("array_pad(): Argument #2 ($length) must not exceed the maximum allowed array size");
  }
  const absolute = size < 0n ? -size : size;
  if (BigInt(entries.length) >= absolute) {
    return keptArray(entries, nextFreeOf(array as object));
  }
  const pads = Number(absolute) - entries.length;
  const pad = value ?? null;
  const result = new PhpArray<PhpKeyInput, unknown>();
  const padding = (): void => {
    for (let index = 0; index < pads; index++) {
      result.push(pad);
    }
  };
  if (size < 0n) {
    padding();
  }
  for (const [key, item] of entries) {
    if (typeof key === "string") {
      result.set(key, item);
    } else {
      result.push(item);
    }
  }
  if (size > 0n) {
    padding();
  }
  return arrayFromEntries(result);
}

/** An operand's type in PHP's `Unsupported operand types` message (`zend_zval_type_name`: `bool`, an object's class). */
function operandTypeName(value: unknown): string {
  if (isContractToken(value)) {
    return "string";
  }
  const php = phpValueOf(value ?? null);
  return typeof php === "boolean" ? "bool" : phpTypeName(php);
}

/**
 * PHP's `$a + $b` for arrays (`add_function_array`): `a`'s entries, then each entry of `b` whose key `a` lacks (`"1"`
 * and `1` are one key), on a copy of `a` that keeps its next free index (`zend_array_dup`). It is the array form of `+`
 * only: it throws PHP's `TypeError` `Unsupported operand types: <type> + <type>` when either operand is no array, two
 * non-arrays included (`arrayUnion(1, 2)` throws `int + int`, where PHP's `+` gives 3). It has no PHP function name; a
 * port writes it for `+` on arrays (ESC-14.4-1).
 */
export function arrayUnion(a: unknown, b: unknown): unknown {
  if (!isPhpArray(a) || !isPhpArray(b)) {
    throw new PhpTypeError(`Unsupported operand types: ${operandTypeName(a)} + ${operandTypeName(b)}`);
  }
  const result = dupArray(a);
  for (const [key, value] of arrayEntries(b)) {
    if (!result.has(key)) {
      result.set(key, value);
    }
  }
  return keptDup(result);
}
