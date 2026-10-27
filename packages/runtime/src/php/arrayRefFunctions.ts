// PHP's by-reference array functions Story 14.2 calls (action item epic-14-item-5-runtime-array-functions,
// ESC-14.2-1), under their PHP names, ports of PHP 8.5.11's `ext/standard/array.c` and `strnatcmp.c` in coercive
// typing mode: `array_shift`, `array_pop`, `array_unshift`, `array_splice`, `asort` and `arsort`. Beside them, for
// `Collection::sortBy` (action item epic-14-item-6-runtime-sort-string-functions, ESC-14.2-4): `uasort`, a port of
// `php_usort` with `php_array_user_compare_unstable`, and the string comparisons `strcmp`, `strcasecmp`, `strnatcmp`,
// `strnatcasecmp` and `strcoll` (`ext/standard/string.c`, `Zend/zend_operators.c`), which call the comparators the
// sorts use. Beside them, for `whereBetween` / `whereNotBetween` (action item
// epic-14-item-8-runtime-round-string-array-pointer, ESC-14.3-1): `reset` and `end`, which read the array without
// moving anything, as the runtime's arrays carry no internal pointer.
//
// A by-reference parameter is a `Ref` (AD-9, DIV-9.2) whose `value` is an AD-9 array. PHP arrays are values, so each
// function builds a new array and writes it to `ref.value` (PHP's copy-on-write: no other holder of the old JS value
// sees a change). An int key is renumbered from 0 where PHP renumbers it (`array_shift`, `array_unshift`,
// `array_splice`), and the array goes out through `arrayFromEntries`. Where PHP keeps the keys (`array_pop`, the
// sorts), the array goes out through `arrayFromEntries` too, unless the input is a `PhpArray` whose next free index
// (`nNextFreeElement`, which a later `[]` append reads) differs from the one the result's keys give: then it stays a
// `PhpArray` with PHP's index. PHP's warnings are not reproduced. Everything is synchronous.
import { isContractToken } from "../registry/registry";
import { numericCompare, regularCompare, requiredCallback, toPhpArray } from "./arrayFunctions";
import { arrayEntries, toInt, toPhpString } from "./casts";
import { LONE_SURROGATE, utf8 } from "./mangle";
import { argumentTypeError, intParameter, nullableIntParameter, stringParameter } from "./phpArguments";
import { arrayFromEntries, nextFreeIndex, PhpArray, phpArrayWithNextFree, type PhpArrayKey, type PhpKeyInput } from "./PhpArray";
import { phpType } from "./phpType";
import { Ref } from "./Ref";
import { zendSort } from "./zendSort";

/** The array a by-reference `$array` parameter holds, and its entries; throws for a non-`Ref` and a non-array. */
function referencedArray(fn: string, ref: unknown): { array: object; entries: [PhpArrayKey, unknown][] } {
  if (!(ref instanceof Ref)) {
    throw new TypeError(`${fn}(): Argument #1 ($array) is by reference; pass a Ref holding the array (DIV-9.2)`);
  }
  const array: unknown = (ref as Ref<unknown>).value ?? null;
  if (typeof array === "object" && array !== null && phpType(array) === "array") {
    return { array, entries: arrayEntries(array) };
  }
  throw argumentTypeError(fn, 1, "array", "array", array);
}

/** The next free index `entries`' own keys give (the largest int key plus 1), or null when none is an int. */
function derivedNextFree(entries: readonly (readonly [PhpArrayKey, unknown])[]): bigint | null {
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
 * (PHP's kept next free index) differs from the one the keys give, which only a `PhpArray` carries.
 */
function keptArray(entries: readonly (readonly [PhpArrayKey, unknown])[], nextFree: bigint | null): unknown {
  return nextFree === derivedNextFree(entries) ? arrayFromEntries(entries) : phpArrayWithNextFree(entries, nextFree);
}

/** Appends `entries` to `target`, a string key kept and an int key renumbered (`zend_hash_next_index_insert_new`). */
function appendRenumbered(target: PhpArray<PhpKeyInput, unknown>, entries: Iterable<readonly [PhpArrayKey, unknown]>): void {
  for (const [key, value] of entries) {
    if (typeof key === "string") {
      target.set(key, value);
    } else {
      target.push(value);
    }
  }
}

/**
 * PHP's `array_shift(&$array)`: removes and returns the first value of `array.value`, renumbering its int keys from 0
 * and keeping its string keys; null for an empty array, which is left as it is. Throws a JS `TypeError` for an
 * argument that is no `Ref` (DIV-9.2), and PHP's `TypeError` for a `Ref` that holds no array.
 */
export function array_shift(array: Ref<unknown>): unknown {
  const { entries } = referencedArray("array_shift", array);
  if (entries.length === 0) {
    return null;
  }
  const rest = new PhpArray<PhpKeyInput, unknown>();
  appendRenumbered(rest, entries.slice(1));
  array.value = arrayFromEntries(rest);
  return entries[0]![1];
}

/**
 * PHP's `array_pop(&$array)`: removes and returns the last value of `array.value`, keys kept; null for an empty array,
 * which is left as it is. A `PhpArray` input keeps its next free index, lowered by one when the removed key is the int
 * just below it (`nNextFreeElement`), and stays a `PhpArray` when that index differs from the one the remaining keys
 * give, so a later append lands where PHP's does. Throws as `array_shift` does.
 */
export function array_pop(array: Ref<unknown>): unknown {
  const { array: input, entries } = referencedArray("array_pop", array);
  if (entries.length === 0) {
    return null;
  }
  const [key, removed] = entries[entries.length - 1]!;
  const rest = entries.slice(0, -1);
  if (input instanceof PhpArray) {
    let next = nextFreeIndex(input);
    if (typeof key !== "string" && next !== null && BigInt(key) === next - 1n) {
      next -= 1n;
    }
    array.value = keptArray(rest, next);
  } else {
    array.value = arrayFromEntries(rest);
  }
  return removed;
}

/** The entries of the array a `reset` / `end` `Ref` holds; an object that is no array is PHP 8.1's deprecated form. */
function pointerEntries(fn: string, ref: unknown): [PhpArrayKey, unknown][] {
  if (ref instanceof Ref) {
    const held: unknown = (ref as Ref<unknown>).value;
    if (isContractToken(held)) {
      // A contract token is its class-string (AD-9).
      throw argumentTypeError(fn, 1, "array", "array", "");
    }
    if ((typeof held === "object" || typeof held === "function") && held !== null && !isContractToken(held) && phpType(held) === "object") {
      throw new TypeError(`${fn}(): an object's internal pointer (deprecated since PHP 8.1) is not ported; pass a Ref holding an array`);
    }
  }
  return referencedArray(fn, ref).entries;
}

/**
 * PHP's `reset(&$array)`: the first value of `array.value`, or `false` for an empty array. `array.value` is left as it
 * is: the runtime's arrays carry no internal pointer to move. Throws a JS `TypeError` for an argument that is no `Ref`
 * (DIV-9.2) and for a `Ref` holding an object (PHP 8.1 deprecated `reset` on an object; not ported), and PHP's
 * `TypeError` `reset(): Argument #1 ($array) must be of type array, int given` for a `Ref` holding a scalar or null.
 */
export function reset(array: Ref<unknown>): unknown {
  const entries = pointerEntries("reset", array);
  return entries.length === 0 ? false : (entries[0]![1] ?? null);
}

/** PHP's `end(&$array)`: the last value of `array.value`, or `false` for an empty array. Throws as `reset` does. */
export function end(array: Ref<unknown>): unknown {
  const entries = pointerEntries("end", array);
  return entries.length === 0 ? false : (entries[entries.length - 1]![1] ?? null);
}

/**
 * PHP's `array_unshift(&$array, ...$values)`: prepends `values` to `array.value`, renumbering its int keys from 0 and
 * keeping its string keys; returns the new count. Throws as `array_shift` does.
 */
export function array_unshift(array: Ref<unknown>, ...values: unknown[]): number {
  const { entries } = referencedArray("array_unshift", array);
  const result = new PhpArray<PhpKeyInput, unknown>();
  for (const value of values) {
    result.push(value ?? null);
  }
  appendRenumbered(result, entries);
  array.value = arrayFromEntries(result);
  return result.size;
}

/**
 * PHP's `array_splice(&$array, $offset, $length = null, $replacement = [])`: removes `length` entries of `array.value`
 * from position `offset` (a negative `offset` counts from the end; a negative `length` stops that many entries before
 * it; null runs to the end), puts the values of `replacement` in their place (read as PHP's `(array)` cast reads it:
 * null is `[]`, a scalar `[scalar]`; its keys are dropped), renumbers the int keys from 0 and keeps the string keys.
 * Returns the removed entries, int keys renumbered and string keys kept. Throws as `array_shift` does, and PHP's
 * `TypeError` for an `offset` that is no int and a `length` that is no int or null.
 */
export function array_splice(array: Ref<unknown>, offset: unknown, length: unknown = null, replacement: unknown = []): unknown {
  const { entries } = referencedArray("array_splice", array);
  let from = BigInt(intParameter("array_splice", 2, "offset", offset));
  const userLength = nullableIntParameter("array_splice", 3, "length", length);
  const replace = [...toPhpArray(replacement ?? null).values()];
  const count = BigInt(entries.length);
  let size = userLength === null ? count : BigInt(userLength);
  if (from > count) {
    from = count;
  } else if (from < 0n && (from = count + from) < 0n) {
    from = 0n;
  }
  if (size < 0n) {
    size = count - from + size;
  } else if (from + size > count) {
    size = count - from;
  }
  const start = Number(from);
  const end = size > 0n ? start + Number(size) : start;
  const out = new PhpArray<PhpKeyInput, unknown>();
  const removed = new PhpArray<PhpKeyInput, unknown>();
  appendRenumbered(out, entries.slice(0, start));
  appendRenumbered(removed, entries.slice(start, end));
  for (const value of replace) {
    out.push(value);
  }
  appendRenumbered(out, entries.slice(end));
  array.value = arrayFromEntries(out);
  return arrayFromEntries(removed);
}

/** A C-locale `isdigit`. */
function isDigit(byte: number): boolean {
  return byte >= 0x30 && byte <= 0x39;
}

/** A C-locale `isspace`: space, `\t`, `\n`, `\v`, `\f`, `\r`. */
function isSpace(byte: number): boolean {
  return byte === 0x20 || (byte >= 0x09 && byte <= 0x0d);
}

/** A C-locale `toupper`. */
function toUpper(byte: number): number {
  return byte >= 0x61 && byte <= 0x7a ? byte - 0x20 : byte;
}

/** The byte of `s` at `index`, or 0 past its end (a `zend_string` is NUL-terminated). */
function byteAt(s: Uint8Array, index: number): number {
  return index < s.length ? s[index]! : 0;
}

/** Two cursors into the compared strings, which `compareRight` and `compareLeft` advance. */
interface Cursors {
  a: number;
  b: number;
}

/** `compare_right`: two right-aligned digit runs; the longest run wins, else the first difference (`bias`). */
function compareRight(a: Uint8Array, b: Uint8Array, at: Cursors): number {
  let bias = 0;
  for (; ; at.a++, at.b++) {
    const aDone = at.a === a.length || !isDigit(a[at.a]!);
    const bDone = at.b === b.length || !isDigit(b[at.b]!);
    if (aDone && bDone) {
      return bias;
    }
    if (aDone) {
      return -1;
    }
    if (bDone) {
      return 1;
    }
    if (a[at.a]! < b[at.b]! && bias === 0) {
      bias = -1;
    } else if (a[at.a]! > b[at.b]! && bias === 0) {
      bias = 1;
    }
  }
}

/** `compare_left`: two left-aligned digit runs (a fraction); the first difference wins. */
function compareLeft(a: Uint8Array, b: Uint8Array, at: Cursors): number {
  for (; ; at.a++, at.b++) {
    const aDone = at.a === a.length || !isDigit(a[at.a]!);
    const bDone = at.b === b.length || !isDigit(b[at.b]!);
    if (aDone && bDone) {
      return 0;
    }
    if (aDone) {
      return -1;
    }
    if (bDone) {
      return 1;
    }
    if (a[at.a]! < b[at.b]!) {
      return -1;
    }
    if (a[at.a]! > b[at.b]!) {
      return 1;
    }
  }
}

/**
 * `strnatcmp_ex` (PHP 8.5.11's `ext/standard/strnatcmp.c`, after Martin Pool's natsort, zlib licence) over the UTF-8
 * bytes of two strings: leading zeros and whitespace skipped, digit runs compared by value (a run after a `0` as a
 * fraction), any other byte by its value, ASCII-case-folded when `foldCase`.
 */
function strnatcmpEx(a: Uint8Array, b: Uint8Array, foldCase: boolean): number {
  if (a.length === 0 || b.length === 0) {
    return a.length === b.length ? 0 : a.length > b.length ? 1 : -1;
  }
  const at: Cursors = { a: 0, b: 0 };
  let ca = byteAt(a, 0);
  let cb = byteAt(b, 0);
  while (ca === 0x30 && at.a + 1 < a.length && isDigit(a[at.a + 1]!)) {
    ca = byteAt(a, ++at.a);
  }
  while (cb === 0x30 && at.b + 1 < b.length && isDigit(b[at.b + 1]!)) {
    cb = byteAt(b, ++at.b);
  }
  for (;;) {
    while (isSpace(ca)) {
      ca = byteAt(a, ++at.a);
    }
    while (isSpace(cb)) {
      cb = byteAt(b, ++at.b);
    }
    if (isDigit(ca) && isDigit(cb)) {
      const result = ca === 0x30 || cb === 0x30 ? compareLeft(a, b, at) : compareRight(a, b, at);
      if (result !== 0) {
        return result;
      }
      if (at.a === a.length && at.b === b.length) {
        return 0;
      }
      if (at.a === a.length) {
        return -1;
      }
      if (at.b === b.length) {
        return 1;
      }
      ca = byteAt(a, at.a);
      cb = byteAt(b, at.b);
    }
    if (foldCase) {
      ca = toUpper(ca);
      cb = toUpper(cb);
    }
    if (ca < cb) {
      return -1;
    }
    if (ca > cb) {
      return 1;
    }
    at.a++;
    at.b++;
    if (at.a >= a.length && at.b >= b.length) {
      return 0;
    }
    if (at.a >= a.length) {
      return -1;
    }
    if (at.b >= b.length) {
      return 1;
    }
    ca = byteAt(a, at.a);
    cb = byteAt(b, at.b);
  }
}

/** A C-locale `tolower` (`zend_tolower_ascii`). */
function toLower(byte: number): number {
  return byte >= 0x41 && byte <= 0x5a ? byte + 0x20 : byte;
}

/** `zend_binary_strcmp` (`zend_binary_strcasecmp` when `foldCase`) over two byte strings. */
function binaryCompare(a: Uint8Array, b: Uint8Array, foldCase: boolean): number {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index++) {
    const x = foldCase ? toLower(a[index]!) : a[index]!;
    const y = foldCase ? toLower(b[index]!) : b[index]!;
    if (x !== y) {
      return x - y;
    }
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

/**
 * The UTF-8 bytes of `value` as PHP's `zval_get_tmp_string` reads it (`toPhpString`, and its `Error`); a string holding a
 * lone surrogate, which has no UTF-8 form, throws a JS `TypeError` naming `fn`.
 */
function bytesOf(fn: string, value: unknown): Uint8Array {
  const string = toPhpString(value);
  if (LONE_SURROGATE.test(string)) {
    throw new TypeError(`${fn}(): the string holds a lone surrogate, which has no UTF-8 form`);
  }
  return utf8.encode(string);
}

/**
 * `strcoll` in the C locale, which is C's `strcmp`: the difference of the first differing bytes, the terminating NUL
 * included (`"ab"` against `"a"` is 98), stopping at a NUL byte.
 */
function localeCompare(a: Uint8Array, b: Uint8Array): number {
  for (let index = 0; ; index++) {
    const x = byteAt(a, index);
    const y = byteAt(b, index);
    if (x !== y || x === 0) {
      return x - y;
    }
  }
}

/** `php_get_data_compare_func(sort_type, 0)`'s unstable comparator. */
function dataCompare(fn: string, sortType: bigint): (a: unknown, b: unknown) => number {
  const foldCase = (sortType & 8n) !== 0n;
  switch (sortType & ~8n) {
    case 1n:
      return numericCompare;
    case 2n:
      return (a, b) => (typeof a === "string" && a === b ? 0 : binaryCompare(bytesOf(fn, a), bytesOf(fn, b), foldCase));
    case 5n:
      return (a, b) => localeCompare(bytesOf(fn, a), bytesOf(fn, b));
    case 6n:
      return (a, b) => strnatcmpEx(bytesOf(fn, a), bytesOf(fn, b), foldCase);
    default:
      return regularCompare;
  }
}

/**
 * `asort` / `arsort` (`reverse`): sorts `array.value` by value, keys kept, with `zend_sort` and PHP's stable
 * comparator (`RETURN_STABLE_SORT`: equal values keep their order; `arsort` negates the unstable comparison).
 */
function sortByValue(fn: string, array: Ref<unknown>, flags: unknown, reverse: boolean): true {
  const { array: input, entries } = referencedArray(fn, array);
  const sortType = BigInt(intParameter(fn, 2, "flags", flags));
  const cmp = dataCompare(fn, sortType);
  array.value = sortedArray(input, entries, reverse ? (a, b) => -cmp(a, b) : cmp);
  return true;
}

/**
 * `input`'s `entries` sorted by value with `zend_sort` and PHP's stable fallback (`RETURN_STABLE_SORT`: values `cmp`
 * calls equal keep their order), keys kept, as the array a sort writes back (`keptArray` for a `PhpArray` input).
 */
function sortedArray(input: object, entries: readonly [PhpArrayKey, unknown][], cmp: (a: unknown, b: unknown) => number): unknown {
  const buckets = entries.map(([key, value], index) => ({ key, value, index }));
  if (buckets.length > 1) {
    zendSort(buckets, (a, b) => {
      const result = cmp(a.value, b.value);
      if (result !== 0) {
        return result;
      }
      return a.index > b.index ? 1 : a.index < b.index ? -1 : 0;
    });
  }
  const sorted = buckets.map(({ key, value }) => [key, value] as const);
  return input instanceof PhpArray ? keptArray(sorted, nextFreeIndex(input)) : arrayFromEntries(sorted);
}

/**
 * PHP's `asort(&$array, $flags = SORT_REGULAR)`: sorts `array.value` by value, ascending, keys kept and equal values
 * in their order; returns true. `SORT_REGULAR` (and any flag PHP reads as it) compares by `zend_compare` with
 * `array_unique`'s enum rule (enum cases after other values); `SORT_NUMERIC` as floats; `SORT_STRING` the strings'
 * bytes (`| SORT_FLAG_CASE` ASCII-case-folded); `SORT_NATURAL` by `strnatcmp` (`| SORT_FLAG_CASE` folded);
 * `SORT_LOCALE_STRING` by the C locale's `strcoll`, which is byte order. A `PhpArray` input stays one when its next
 * free index differs from the one its keys give. Throws as `array_shift` does, PHP's `TypeError` for a `flags` that is no int, and PHP's `Error` for a value
 * without a string form under a string comparison.
 */
export function asort(array: Ref<unknown>, flags: unknown = 0): true {
  return sortByValue("asort", array, flags, false);
}

/** PHP's `arsort(&$array, $flags = SORT_REGULAR)`: `asort` descending; equal values keep their order. */
export function arsort(array: Ref<unknown>, flags: unknown = 0): true {
  return sortByValue("arsort", array, flags, true);
}

/**
 * `php_array_user_compare_unstable`: `callback(a, b)` read as PHP reads it, its `zval_get_long` (`toInt`) and then its
 * sign; a `false` result calls `callback(b, a)` and negates that sign, and `true` is 1 (PHP's bool deprecation is not
 * reproduced). Once a call has thrown (or its result could not be read), no further call is made: PHP's
 * `zend_call_function` returns at once while an exception is pending, and the comparison is 0.
 */
function userCompare(callback: (...args: unknown[]) => unknown, failed: { error: { thrown: unknown } | null }): (a: unknown, b: unknown) => number {
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
 * PHP's `uasort(&$array, $callback)`: sorts `array.value` by value with `callback(a, b)`, keys kept, and returns true.
 * It ports `php_usort` over `zend_sort` with PHP's stable fallback (`RETURN_STABLE_SORT`: values the callback calls
 * equal keep their order). The callback's result is read as PHP reads it (`(int)`, then its sign: `0.5` is 0, `"1"`
 * 1); a `false` result calls it again with the operands swapped and negates that sign, and `true` is 1. An empty array
 * is left as it is, and the callback is not called. A `PhpArray` input keeps its next free index as `asort`'s does.
 * When the callback throws, it is not called again (each later comparison is 0), the partly sorted array is written
 * back, as PHP writes it, and the exception propagates. Throws as `asort` does for `array`, and, for `callback`, as
 * `array_any` does: PHP's `TypeError` `uasort(): Argument #2 ($callback) must be a valid callback, no array or string
 * given` for null, and the DIV-9.13 `TypeError` for a PHP callable string or array.
 */
export function uasort(array: Ref<unknown>, callback: unknown): true {
  const { array: input, entries } = referencedArray("uasort", array);
  const compare = requiredCallback("uasort", 2, callback);
  if (entries.length === 0) {
    return true;
  }
  const failed: { error: { thrown: unknown } | null } = { error: null };
  array.value = sortedArray(input, entries, userCompare(compare, failed));
  if (failed.error !== null) {
    throw failed.error.thrown;
  }
  return true;
}

/** The UTF-8 bytes of string parameter `position` (`$string1` / `$string2`) of `fn()`. */
function stringBytes(fn: string, position: number, value: unknown): Uint8Array {
  return bytesOf(fn, stringParameter(fn, position, `string${position}`, value));
}

/**
 * PHP's `strcmp($string1, $string2)` (`zend_binary_strcmp`): the difference of the first differing UTF-8 bytes
 * (`strcmp("a", "c")` is -2), else -1, 0 or 1 by length. Both are PHP `string` parameters (an int, float, bool or null
 * its string, an object its `__toString` port), and anything else throws PHP's `TypeError`; a string holding a lone
 * surrogate throws a JS `TypeError` naming the function.
 */
export function strcmp(string1: unknown, string2: unknown): number {
  return binaryCompare(stringBytes("strcmp", 1, string1), stringBytes("strcmp", 2, string2), false);
}

/**
 * PHP's `strcasecmp($string1, $string2)` (`zend_binary_strcasecmp`): `strcmp` after ASCII lower-casing
 * (`strcasecmp("A", "c")` is -2); a byte of 0x80 or more is not folded. Throws as `strcmp` does.
 */
export function strcasecmp(string1: unknown, string2: unknown): number {
  return binaryCompare(stringBytes("strcasecmp", 1, string1), stringBytes("strcasecmp", 2, string2), true);
}

/**
 * PHP's `strnatcmp($string1, $string2)` (`strnatcmp_ex`): -1, 0 or 1 in natural order (leading zeros and whitespace
 * skipped, digit runs by value, a run after a `0` as a fraction). Throws as `strcmp` does.
 */
export function strnatcmp(string1: unknown, string2: unknown): number {
  return strnatcmpEx(stringBytes("strnatcmp", 1, string1), stringBytes("strnatcmp", 2, string2), false);
}

/** PHP's `strnatcasecmp($string1, $string2)`: `strnatcmp` with ASCII case folded. Throws as `strcmp` does. */
export function strnatcasecmp(string1: unknown, string2: unknown): number {
  return strnatcmpEx(stringBytes("strnatcasecmp", 1, string1), stringBytes("strnatcasecmp", 2, string2), true);
}

/**
 * PHP's `strcoll($string1, $string2)` in the C locale, PHP's default, which is C's `strcmp`: it stops at a NUL byte,
 * and gives the difference of the first differing bytes, the terminating NUL included (`strcoll("ab", "a")` is 98,
 * `strcoll("é", "e")` 94). No other locale is ported. Throws as `strcmp` does.
 */
export function strcoll(string1: unknown, string2: unknown): number {
  return localeCompare(stringBytes("strcoll", 1, string1), stringBytes("strcoll", 2, string2));
}
