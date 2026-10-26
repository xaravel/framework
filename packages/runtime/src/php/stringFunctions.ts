// PHP's string functions the Collections tests call (ESC-14.1-6; action item
// epic-14-item-2-runtime-generators-functions), under their PHP names, ports of PHP 8.5.11's `ext/standard/string.c`
// in coercive typing mode: `str_starts_with`, `substr`, and (action item epic-14-item-3-runtime-type-tests-functions,
// ESC-14.1-9) `implode` and `explode`, and (action item epic-14-item-5-runtime-array-functions, ESC-14.2-1)
// `str_contains`, `strlen` and `lcfirst`. A PHP string is its bytes, so `substr` counts UTF-8 bytes.
// A result or input JS cannot hold (a result that splits a UTF-8 sequence, an input holding a lone surrogate) throws a
// JS `TypeError` naming the limit, as the codecs do.
import { LONE_SURROGATE, utf8 } from "./mangle";
import { isContractToken } from "../registry/registry";
import { arrayEntries, toPhpString } from "./casts";
import { intParameter, nullableIntParameter, stringParameter } from "./phpArguments";
import { phpType, phpTypeName } from "./phpType";
import { phpValueOf, toStringArgument } from "./throwableArguments";
import { TypeError as PhpTypeError } from "./TypeError";
import { ValueError } from "./ValueError";

/** A UTF-8 decoder that refuses a split sequence and keeps a leading BOM. */
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** `s`, refused with a JS `TypeError` when it holds a lone surrogate, which has no UTF-8 form. */
function wellFormed(fn: string, s: string): string {
  if (LONE_SURROGATE.test(s)) {
    throw new TypeError(`${fn}(): the string holds a lone surrogate, which has no UTF-8 form`);
  }
  return s;
}

/**
 * PHP's `str_starts_with($haystack, $needle)`: whether `haystack` begins with `needle` (`""` always). Both are coerced
 * as PHP's `string` parameters (an int, a float, a bool or null its string; an object through its `__toString`
 * port); anything else throws PHP's `TypeError`.
 */
export function str_starts_with(haystack: unknown, needle: unknown): boolean {
  const h = wellFormed("str_starts_with", stringParameter("str_starts_with", 1, "haystack", haystack));
  const n = wellFormed("str_starts_with", stringParameter("str_starts_with", 2, "needle", needle));
  return h.startsWith(n);
}

/**
 * PHP's `str_contains($haystack, $needle)`: whether `needle` occurs in `haystack` (`""` always). Both are coerced as
 * `str_starts_with`'s are; anything else throws PHP's `TypeError`.
 */
export function str_contains(haystack: unknown, needle: unknown): boolean {
  const h = wellFormed("str_contains", stringParameter("str_contains", 1, "haystack", haystack));
  const n = wellFormed("str_contains", stringParameter("str_contains", 2, "needle", needle));
  return h.includes(n);
}

/**
 * PHP's `strlen($string)`: the number of UTF-8 bytes of `string`, coerced as PHP's `string` parameter (`12.5` is
 * `"12.5"`, true `"1"`); anything else throws PHP's `TypeError`.
 */
export function strlen(string: unknown): number {
  return utf8.encode(wellFormed("strlen", stringParameter("strlen", 1, "string", string))).length;
}

/**
 * PHP's `lcfirst($string)`: `string` with its first byte lowered when it is an ASCII `A`-`Z` (`zend_tolower_ascii`), so
 * a multi-byte first character is unchanged. Coerced as PHP's `string` parameter; anything else throws PHP's
 * `TypeError`.
 */
export function lcfirst(string: unknown): string {
  const s = wellFormed("lcfirst", stringParameter("lcfirst", 1, "string", string));
  const first = s.charCodeAt(0);
  return first >= 0x41 && first <= 0x5a ? String.fromCharCode(first + 0x20) + s.slice(1) : s;
}

/**
 * PHP's `substr($string, $offset, $length = null)`, over the string's UTF-8 bytes: a negative `offset` counts from the
 * end, a negative `length` stops that many bytes before it, and null runs to the end. The arguments are coerced as
 * PHP's `string`, `int` and `?int` parameters, and anything else throws PHP's `TypeError`. A result that splits a
 * UTF-8 sequence throws a JS `TypeError`.
 */
export function substr(string: unknown, offset: unknown, length: unknown = null): string {
  const s = wellFormed("substr", stringParameter("substr", 1, "string", string));
  let from = BigInt(intParameter("substr", 2, "offset", offset));
  const userLength = nullableIntParameter("substr", 3, "length", length);
  const bytes = utf8.encode(s);
  const size = BigInt(bytes.length);
  if (from < 0n) {
    from = -from > size ? 0n : size + from;
  } else if (from > size) {
    return "";
  }
  let count: bigint;
  if (userLength !== null) {
    count = BigInt(userLength);
    if (count < 0n) {
      count = -count > size - from ? 0n : size - from + count;
    } else if (count > size - from) {
      count = size - from;
    }
  } else {
    count = size - from;
  }
  if (count === size) {
    return s;
  }
  try {
    return decoder.decode(bytes.subarray(Number(from), Number(from + count)));
  } catch {
    throw new TypeError("substr(): the result splits a UTF-8 sequence, which JS cannot hold");
  }
}

/**
 * PHP's `implode($separator, $array)` and its one-argument form `implode($array)`, as PHP 8.5 compiles a direct call
 * (its frameless forms): the values of `array`, each as PHP's `(string)` gives it (an int in decimal, a float as
 * `(string)`, true `"1"`, false and null `""`, an array `"Array"`, an object through its `__toString` port), joined by
 * `separator` (`""` in the one-argument form, decided by argument count: an explicit `undefined` is PHP's null). Throws PHP's `TypeError` for
 * a one-argument form that is no array, a `separator` that is no string, and an `array` that is null or no array, and
 * PHP's `Error` for an element object without a `__toString` port.
 */
export function implode(separator: unknown, ...rest: [array?: unknown]): string {
  const nullGiven = "implode(): If argument #1 ($separator) is of type string, argument #2 ($array) must be of type array, null given";
  if (rest.length === 0) {
    if (!is_array(separator)) {
      throw new PhpTypeError(nullGiven);
    }
    return arrayValues(separator as object).map((piece) => toPhpString(piece)).join("");
  }
  const glue = toStringArgument(separator);
  if (glue === null) {
    throw new PhpTypeError(`implode(): Argument #1 ($separator) must be of type string, ${is_array(separator) ? "array" : phpTypeName(phpValueOf(separator))} given`);
  }
  const array = rest[0] ?? null;
  if (array === null) {
    throw new PhpTypeError(nullGiven);
  }
  if (!is_array(array)) {
    throw new PhpTypeError(`implode(): Argument #2 ($array) must be of type ?array, ${phpTypeName(phpValueOf(array))} given`);
  }
  return arrayValues(array as object).map((piece) => toPhpString(piece)).join(glue);
}

/** PHP's `is_array`: a PHP array in the AD-9 forms; a contract token is a string. */
function is_array(value: unknown): boolean {
  return !isContractToken(value) && phpType(value) === "array";
}

/** The values of a PHP array, in order. */
function arrayValues(array: object): unknown[] {
  return arrayEntries(array).map(([, value]) => value);
}

/**
 * PHP's `explode($separator, $string, $limit = PHP_INT_MAX)`: `string` split on each `separator`. A positive `limit`
 * keeps at most that many parts, the last holding the rest; a negative one drops that many parts from the end (none
 * left when `separator` is not found); 0 is 1. An empty `string` gives `[""]` (`[]` for a negative `limit`). Throws
 * PHP's `ValueError` `explode(): Argument #1 ($separator) must not be empty`, and PHP's `TypeError` for an argument of
 * another type.
 */
export function explode(separator: unknown, string: unknown, limit: unknown = 9223372036854775807n): string[] {
  const delimiter = wellFormed("explode", stringParameter("explode", 1, "separator", separator));
  const subject = wellFormed("explode", stringParameter("explode", 2, "string", string));
  const max = BigInt(intParameter("explode", 3, "limit", limit));
  if (delimiter === "") {
    throw new ValueError("explode(): Argument #1 ($separator) must not be empty");
  }
  if (subject === "") {
    return max >= 0n ? [""] : [];
  }
  const parts = subject.split(delimiter);
  if (max > 1n) {
    if (BigInt(parts.length) <= max) {
      return parts;
    }
    const kept = Number(max) - 1;
    return [...parts.slice(0, kept), parts.slice(kept).join(delimiter)];
  }
  if (max < 0n) {
    const keep = BigInt(parts.length) + max;
    return parts.length === 1 || keep <= 0n ? [] : parts.slice(0, Number(keep));
  }
  return [subject];
}
