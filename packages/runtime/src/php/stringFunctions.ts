// PHP's string functions the Collections tests call (ESC-14.1-6; action item
// epic-14-item-2-runtime-generators-functions), under their PHP names, ports of PHP 8.5.11's `ext/standard/string.c`
// in coercive typing mode: `str_starts_with`, `substr`, and (action item epic-14-item-3-runtime-type-tests-functions,
// ESC-14.1-9) `implode` and `explode`, and (action item epic-14-item-5-runtime-array-functions, ESC-14.2-1)
// `str_contains`, `strlen` and `lcfirst`, and (action item epic-14-item-8-runtime-round-string-array-pointer,
// ESC-14.3-1) `strtoupper`, `trim` (`php_trim_int` with `php_charmask`) and `chunk_split`. A PHP string is its bytes,
// so `substr`, `trim` and `chunk_split` work on UTF-8 bytes.
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

/** `bytes` as a JS string; a JS `TypeError` naming `fn` when they split a UTF-8 sequence. */
function decodeResult(fn: string, bytes: Uint8Array): string {
  try {
    return decoder.decode(bytes);
  } catch {
    throw new TypeError(`${fn}(): the result splits a UTF-8 sequence, which JS cannot hold`);
  }
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
  return decodeResult("substr", bytes.subarray(Number(from), Number(from + count)));
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

/**
 * PHP's `strtoupper($string)` (`zend_string_toupper`): `string` with each ASCII `a`-`z` raised; every other byte, so
 * every non-ASCII character, is unchanged (`strtoupper("é ß")` is `"é ß"`). Coerced as PHP's `string` parameter;
 * anything else throws PHP's `TypeError`.
 */
export function strtoupper(string: unknown): string {
  const s = wellFormed("strtoupper", stringParameter("strtoupper", 1, "string", string));
  return s.replace(/[a-z]+/g, (run) => run.toUpperCase());
}

/**
 * PHP's `php_charmask`: the 256-byte mask of `list`, `x..y` ranges included. A malformed `..` (no character on its
 * left or right, a decreasing range, or `a..b..c`) skips its first `.` and goes on, as PHP does; PHP's warning is not
 * reproduced.
 */
function charmask(list: Uint8Array): Uint8Array {
  const mask = new Uint8Array(256);
  const end = list.length;
  for (let i = 0; i < end; i++) {
    const c = list[i]!;
    if (i + 3 < end && list[i + 1] === 0x2e && list[i + 2] === 0x2e && list[i + 3]! >= c) {
      mask.fill(1, c, list[i + 3]! + 1);
      i += 3;
    } else if (i + 1 < end && c === 0x2e && list[i + 1] === 0x2e) {
      continue;
    } else {
      mask[c] = 1;
    }
  }
  return mask;
}

/**
 * PHP's `trim($string, $characters = " \n\r\t\v\0")` (`php_trim_int`, mode 3): `string` with every leading and
 * trailing byte in `characters` removed, over UTF-8 bytes. `characters` is a byte list with PHP's `x..y` ranges
 * (`php_charmask`), a malformed `..` handled as PHP handles it, its warning not reproduced. Both are coerced as PHP's
 * `string` parameters; anything else throws PHP's `TypeError`. A result that splits a UTF-8 sequence throws a JS
 * `TypeError`.
 */
export function trim(string: unknown, characters: unknown = " \n\r\t\v\0"): string {
  const s = wellFormed("trim", stringParameter("trim", 1, "string", string));
  const list = wellFormed("trim", stringParameter("trim", 2, "characters", characters));
  const bytes = utf8.encode(s);
  const mask = charmask(utf8.encode(list));
  let start = 0;
  let end = bytes.length;
  while (start !== end && mask[bytes[start]!] === 1) {
    start++;
  }
  while (start !== end && mask[bytes[end - 1]!] === 1) {
    end--;
  }
  if (end - start === bytes.length) {
    return s;
  }
  return decodeResult("trim", bytes.subarray(start, end));
}

/**
 * PHP's `chunk_split($string, $length = 76, $separator = "\r\n")`, over UTF-8 bytes: every `length` bytes of `string`,
 * and the remainder, each followed by `separator`; a `length` above the byte length gives `string . separator` (so
 * `""` gives `separator`). Coerced as PHP's `string`, `int` and `string` parameters; anything else throws PHP's
 * `TypeError`, and a `length` below 1 PHP's `ValueError` `chunk_split(): Argument #2 ($length) must be greater than
 * 0`. A result that splits a UTF-8 sequence throws a JS `TypeError`.
 */
export function chunk_split(string: unknown, length: unknown = 76, separator: unknown = "\r\n"): string {
  const s = wellFormed("chunk_split", stringParameter("chunk_split", 1, "string", string));
  const chunk = BigInt(intParameter("chunk_split", 2, "length", length));
  const end = wellFormed("chunk_split", stringParameter("chunk_split", 3, "separator", separator));
  if (chunk <= 0n) {
    throw new ValueError("chunk_split(): Argument #2 ($length) must be greater than 0");
  }
  const bytes = utf8.encode(s);
  if (chunk > BigInt(bytes.length)) {
    return s + end;
  }
  const size = Number(chunk);
  const tail = utf8.encode(end);
  const chunks = Math.ceil(bytes.length / size);
  const out = new Uint8Array(bytes.length + chunks * tail.length);
  let q = 0;
  for (let p = 0; p < bytes.length; p += size) {
    const piece = bytes.subarray(p, Math.min(p + size, bytes.length));
    out.set(piece, q);
    q += piece.length;
    out.set(tail, q);
    q += tail.length;
  }
  return decodeResult("chunk_split", out);
}

/** PHP's `strtolower`: only ASCII letters change; multibyte UTF-8 text stays intact. */
export function strtolower(string: unknown): string {
  return wellFormed("strtolower", stringParameter("strtolower", 1, "string", string)).replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/** PHP's `strrev`, reversing bytes; a non-UTF-8 result follows the existing unsupported-byte-string policy. */
export function strrev(string: unknown): string {
  const input = wellFormed("strrev", stringParameter("strrev", 1, "string", string));
  return decodeResult("strrev", utf8.encode(input).reverse());
}
