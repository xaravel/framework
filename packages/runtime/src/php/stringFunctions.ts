// PHP's string functions the Collections tests call (ESC-14.1-6; action item
// epic-14-item-2-runtime-generators-functions), under their PHP names, ports of PHP 8.5.11's `ext/standard/string.c`
// in coercive typing mode: `str_starts_with`, `substr`, and (action item epic-14-item-3-runtime-type-tests-functions,
// ESC-14.1-9) `implode` and `explode`, and (action item epic-14-item-5-runtime-array-functions, ESC-14.2-1)
// `str_contains`, `strlen` and `lcfirst`, and (action item epic-14-item-8-runtime-round-string-array-pointer,
// ESC-14.3-1) `strtoupper`, `trim` (`php_trim_int` with `php_charmask`) and `chunk_split`. A PHP string is its bytes,
// so `substr`, `trim` and `chunk_split` work on UTF-8 bytes.
// And (action item epic-15-item-1-runtime-phpdotenv-builtins, ESC-15.2-1 part a) `strpos`, `str_replace`, `ltrim`,
// `rtrim`, `ord`, `strtok`, `addcslashes` and `stripcslashes`, over UTF-8 bytes too; `strtok`'s remembered string and
// position live in a Scope Frame slot (AD-5).
// A result or input JS cannot hold (a result that splits a UTF-8 sequence, an input holding a lone surrogate) throws a
// JS `TypeError` naming the limit, as the codecs do.
import { LONE_SURROGATE, utf8 } from "./mangle";
import { isContractToken } from "../registry/registry";
import { currentFrame, frameSlot } from "../scope/scope";
import { ScopeFrameException } from "../scope/ScopeFrameException";
import { arrayEntries, toPhpString } from "./casts";
import { arrayFromEntries, type PhpArrayKey } from "./PhpArray";
import { argumentTypeError, intParameter, nullableIntParameter, stringParameter } from "./phpArguments";
import { Ref } from "./Ref";
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

/** PHP's default trim list, `" \n\r\t\v\0"`. */
const TRIM_DEFAULT = " \n\r\t\v\0";

/**
 * `php_trim_int`: `string` (argument 1 of `fn`) with its leading (mode 1), trailing (mode 2) or both (mode 3) bytes in
 * `characters` removed, over UTF-8 bytes.
 */
function trimBytes(fn: string, string: unknown, characters: unknown, mode: 1 | 2 | 3): string {
  const s = wellFormed(fn, stringParameter(fn, 1, "string", string));
  const list = wellFormed(fn, stringParameter(fn, 2, "characters", characters));
  const bytes = utf8.encode(s);
  const mask = charmask(utf8.encode(list));
  let start = 0;
  let end = bytes.length;
  if ((mode & 1) !== 0) {
    while (start !== end && mask[bytes[start]!] === 1) {
      start++;
    }
  }
  if ((mode & 2) !== 0) {
    while (start !== end && mask[bytes[end - 1]!] === 1) {
      end--;
    }
  }
  if (end - start === bytes.length) {
    return s;
  }
  return decodeResult(fn, bytes.subarray(start, end));
}

/**
 * PHP's `trim($string, $characters = " \n\r\t\v\0")` (`php_trim_int`, mode 3): `string` with every leading and
 * trailing byte in `characters` removed, over UTF-8 bytes. `characters` is a byte list with PHP's `x..y` ranges
 * (`php_charmask`), a malformed `..` handled as PHP handles it, its warning not reproduced. Both are coerced as PHP's
 * `string` parameters; anything else throws PHP's `TypeError`. A result that splits a UTF-8 sequence throws a JS
 * `TypeError`.
 */
export function trim(string: unknown, characters: unknown = TRIM_DEFAULT): string {
  return trimBytes("trim", string, characters, 3);
}

/**
 * PHP's `ltrim($string, $characters = " \n\r\t\v\0")` (`php_trim_int`, mode 1): `trim`'s rules for the leading
 * bytes only.
 */
export function ltrim(string: unknown, characters: unknown = TRIM_DEFAULT): string {
  return trimBytes("ltrim", string, characters, 1);
}

/**
 * PHP's `rtrim($string, $characters = " \n\r\t\v\0")` (`php_trim_int`, mode 2): `trim`'s rules for the trailing
 * bytes only.
 */
export function rtrim(string: unknown, characters: unknown = TRIM_DEFAULT): string {
  return trimBytes("rtrim", string, characters, 2);
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

/** The first position of `needle` in `haystack` at or after `from`, by bytes, or -1 (`php_memnstr`). */
function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, from: number): number {
  const last = haystack.length - needle.length;
  outer: for (let i = from; i <= last; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        continue outer;
      }
    }
    return i;
  }
  return -1;
}

/**
 * PHP's `strpos($haystack, $needle, $offset = 0)`: the byte position of the first `needle` in `haystack` at or after
 * `offset` (a negative one counts from the end), or `false`; an empty `needle` is found at `offset`. An `offset`
 * beyond either end throws PHP's `ValueError` `strpos(): Argument #3 ($offset) must be contained in argument #1
 * ($haystack)`. Coerced as PHP's `string`, `string` and `int` parameters; anything else throws PHP's `TypeError`.
 */
export function strpos(haystack: unknown, needle: unknown, offset: unknown = 0): number | false {
  const h = utf8.encode(wellFormed("strpos", stringParameter("strpos", 1, "haystack", haystack)));
  const n = utf8.encode(wellFormed("strpos", stringParameter("strpos", 2, "needle", needle)));
  let at = BigInt(intParameter("strpos", 3, "offset", offset));
  if (at < 0n) {
    at += BigInt(h.length);
  }
  if (at < 0n || at > BigInt(h.length)) {
    throw new ValueError("strpos(): Argument #3 ($offset) must be contained in argument #1 ($haystack)");
  }
  const found = indexOfBytes(h, n, Number(at));
  return found === -1 ? false : found;
}

/** A `str_replace` argument: a PHP array's entries, or a string. */
type Replacement = { readonly entries: [PhpArrayKey, unknown][] } | { readonly string: string };

/** An `array|string` parameter (`Z_PARAM_ARRAY_HT_OR_STR`): an array's entries, else its string. */
function arrayOrString(fn: string, position: number, name: string, value: unknown): Replacement {
  if (is_array(value)) {
    return { entries: arrayEntries(value as object) };
  }
  const string = toStringArgument(value);
  if (string === null) {
    throw argumentTypeError(fn, position, name, "array|string", value);
  }
  return { string: wellFormed(fn, string) };
}

/**
 * `php_str_replace_in_subject` for one subject string: each search string in turn (an array search's values as PHP's
 * `(string)` gives them, an empty one skipped), replaced by the matching replacement (an array replace's values in
 * order, `""` once they run out; a string replace for every search). Returns the result and the replacement count.
 */
function replaceInSubject(search: Replacement, replace: Replacement, subject: string): [string, number] {
  if (subject === "") {
    return ["", 0];
  }
  if ("string" in search) {
    if (search.string === "") {
      return [subject, 0];
    }
    const parts = subject.split(search.string);
    return [parts.join((replace as { string: string }).string), parts.length - 1];
  }
  let result = subject;
  let count = 0;
  let next = 0;
  for (const [, entry] of search.entries) {
    const needle = wellFormed("str_replace", toPhpString(entry));
    let replacement: string;
    if ("entries" in replace) {
      replacement = next < replace.entries.length ? wellFormed("str_replace", toPhpString(replace.entries[next]![1])) : "";
      next++;
    } else {
      replacement = replace.string;
    }
    if (needle === "") {
      continue;
    }
    const parts = result.split(needle);
    count += parts.length - 1;
    result = parts.join(replacement);
    if (result === "") {
      return ["", count];
    }
  }
  return [result, count];
}

/**
 * PHP's `str_replace($search, $replace, $subject, &$count = null)` (`php_str_replace_common`, case-sensitive), over the
 * strings' bytes (a well-formed UTF-8 needle matches only whole characters, so this is the JS strings' match).
 *
 * - `search` and `replace` are strings or arrays: an array `search` replaces each of its values in turn by the
 *   matching value of an array `replace` (`""` once it runs out) or by a string `replace`; an empty search string is
 *   skipped. A string `search` with an array `replace` throws PHP's `TypeError` `str_replace(): Argument #2
 *   ($replace) must be of type string when argument #1 ($search) is a string`.
 * - An array `subject` gives an array with the same keys (through `arrayFromEntries`), each value replaced as its
 *   `(string)` (PHP 8.5.11 converts every element, an array to `"Array"`; an object without a `__toString` port throws
 *   PHP's `Error`, as do array values of `search` and `replace`).
 * - `count`, a `Ref` (DIV-9.2), receives the number of replacements; null or omitted is no count. A `count` that is
 *   no `Ref` throws a JS `TypeError`.
 *
 * Coerced as PHP's `array|string` parameters; anything else throws PHP's `TypeError`.
 */
export function str_replace(search: unknown, replace: unknown, subject: unknown, count: Ref<unknown> | null = null): unknown {
  const fn = "str_replace";
  if (count !== null && count !== undefined && !(count instanceof Ref)) {
    throw new TypeError("str_replace(): Argument #4 ($count) is by reference; pass a Ref (DIV-9.2)");
  }
  const needles = arrayOrString(fn, 1, "search", search);
  const replacements = arrayOrString(fn, 2, "replace", replace);
  const subjects = arrayOrString(fn, 3, "subject", subject);
  if ("string" in needles && "entries" in replacements) {
    throw new PhpTypeError("str_replace(): Argument #2 ($replace) must be of type string when argument #1 ($search) is a string");
  }
  let total = 0;
  let result: unknown;
  if ("string" in subjects) {
    const [replaced, n] = replaceInSubject(needles, replacements, subjects.string);
    total = n;
    result = replaced;
  } else {
    const out: [PhpArrayKey, unknown][] = [];
    for (const [key, value] of subjects.entries) {
      const [replaced, n] = replaceInSubject(needles, replacements, wellFormed(fn, toPhpString(value)));
      total += n;
      out.push([key, replaced]);
    }
    result = arrayFromEntries(out);
  }
  if (count instanceof Ref) {
    count.value = total;
  }
  return result;
}

/**
 * PHP's `ord($character)`: the first byte of `character`'s UTF-8 form (`ord("é")` is 195), 0 for `""`. Coerced as
 * PHP's `string` parameter; anything else throws PHP's `TypeError`.
 */
export function ord(character: unknown): number {
  const bytes = utf8.encode(wellFormed("ord", stringParameter("ord", 1, "character", character)));
  return bytes.length === 0 ? 0 : bytes[0]!;
}

/** `strtok`'s state (`BG(strtok_string)`, `BG(strtok_last)`): the string's bytes and the next byte to read. */
interface StrtokState {
  readonly bytes: Uint8Array;
  readonly last: number;
}

const STRTOK = frameSlot<StrtokState | null>(Symbol.for("xaravel.php.strtok"), () => null);

/** Records `state` in the active frame; outside a frame (or in a narrow frame no unit encloses) nothing is recorded. */
function recordStrtok(state: StrtokState | null): void {
  if (currentFrame() === null) {
    return;
  }
  try {
    STRTOK.set(state);
  } catch (error) {
    if (!(error instanceof ScopeFrameException)) {
      throw error;
    }
  }
}

/**
 * PHP's `strtok($string, $token = null)`, over UTF-8 bytes. `strtok(string, token)` starts tokenizing `string` and
 * `strtok(token)` (or `strtok(token, null)`) goes on with the string last started; each returns the next run of bytes
 * not in `token`, skipping leading delimiters, or `false` once none is left (also when nothing was started; PHP's
 * warning is not raised). The started string and position are held in a Scope Frame slot (AD-5), so each frame has its
 * own; outside a frame a two-argument call returns its first token but records nothing, so a later one-argument call
 * returns `false`. Coerced as PHP's `string` and `?string` parameters; anything else throws PHP's `TypeError`. A
 * token that splits a UTF-8 sequence throws a JS `TypeError`.
 */
export function strtok(string: unknown, token: unknown = null): string | false {
  const first = wellFormed("strtok", stringParameter("strtok", 1, "string", string));
  let tok: string;
  let state: StrtokState | null;
  if (token === null || token === undefined) {
    tok = first;
    state = STRTOK.get();
  } else {
    const coerced = toStringArgument(token);
    if (coerced === null) {
      throw argumentTypeError("strtok", 2, "token", "?string", token);
    }
    tok = wellFormed("strtok", coerced);
    state = { bytes: utf8.encode(first), last: 0 };
  }
  if (state === null) {
    return false;
  }
  const { bytes } = state;
  const end = bytes.length;
  let p = state.last;
  if (p >= end) {
    recordStrtok(state);
    return false;
  }
  const delimiters = new Uint8Array(256);
  for (const byte of utf8.encode(tok)) {
    delimiters[byte] = 1;
  }
  while (delimiters[bytes[p]!] === 1) {
    if (++p >= end) {
      recordStrtok(null);
      return false;
    }
  }
  const from = p;
  while (++p < end && delimiters[bytes[p]!] !== 1) {
    // Scan to the next delimiter or the end.
  }
  const result = decodeResult("strtok", bytes.subarray(from, p));
  recordStrtok({ bytes, last: p + 1 });
  return result;
}

/** `addcslashes`'s escapes for the C control characters it names by letter. */
const C_ESCAPES: Readonly<Record<number, string>> = { 0x0a: "n", 0x09: "t", 0x0d: "r", 0x07: "a", 0x0b: "v", 0x08: "b", 0x0c: "f" };

/**
 * PHP's `addcslashes($string, $characters)` (`php_addcslashes_str`), over UTF-8 bytes: each byte of `string` in
 * `characters` (a byte list with `php_charmask`'s `x..y` ranges, as `trim` reads it) gets a backslash; one below 32
 * or above 126 is written as `\n`, `\t`, `\r`, `\a`, `\v`, `\b`, `\f`, or else as three octal digits (`"\0"` is
 * `\000`). Coerced as PHP's `string` parameters; anything else throws PHP's `TypeError`. A result that leaves part of
 * a UTF-8 sequence unescaped throws a JS `TypeError`.
 */
export function addcslashes(string: unknown, characters: unknown): string {
  const bytes = utf8.encode(wellFormed("addcslashes", stringParameter("addcslashes", 1, "string", string)));
  const mask = charmask(utf8.encode(wellFormed("addcslashes", stringParameter("addcslashes", 2, "characters", characters))));
  const out: number[] = [];
  for (const c of bytes) {
    if (mask[c] === 1) {
      out.push(0x5c);
      if (c < 32 || c > 126) {
        const letter = C_ESCAPES[c];
        const text = letter ?? c.toString(8).padStart(3, "0");
        for (const ch of text) {
          out.push(ch.charCodeAt(0));
        }
        continue;
      }
    }
    out.push(c);
  }
  return decodeResult("addcslashes", Uint8Array.from(out));
}

/** C's `isxdigit`. */
function isHexDigit(byte: number | undefined): boolean {
  return byte !== undefined && ((byte >= 0x30 && byte <= 0x39) || (byte >= 0x41 && byte <= 0x46) || (byte >= 0x61 && byte <= 0x66));
}

/** `stripcslashes`'s escapes by letter. */
const C_UNESCAPES: Readonly<Record<number, number>> = { 0x6e: 0x0a, 0x72: 0x0d, 0x61: 0x07, 0x74: 0x09, 0x76: 0x0b, 0x62: 0x08, 0x66: 0x0c, 0x5c: 0x5c };

/**
 * PHP's `stripcslashes($string)` (`php_stripcslashes`), over UTF-8 bytes: `\n`, `\r`, `\a`, `\t`, `\v`, `\b`, `\f` and
 * `\\` are their bytes, `\x` with one or two hex digits and `\` with one to three octal digits the byte they spell (an
 * octal above `\377` wraps, as C's `char` does), and a backslash before any other byte is dropped; a trailing
 * backslash is kept. Coerced as PHP's `string` parameter; anything else throws PHP's `TypeError`. A result that is no
 * valid UTF-8 (`'\xff'`) throws a JS `TypeError`.
 */
export function stripcslashes(string: unknown): string {
  const s = wellFormed("stripcslashes", stringParameter("stripcslashes", 1, "string", string));
  const bytes = utf8.encode(s);
  const end = bytes.length;
  const out: number[] = [];
  for (let i = 0; i < end; i++) {
    if (bytes[i] !== 0x5c || i + 1 >= end) {
      out.push(bytes[i]!);
      continue;
    }
    i++;
    const c = bytes[i]!;
    const letter = C_UNESCAPES[c];
    if (letter !== undefined) {
      out.push(letter);
      continue;
    }
    if (c === 0x78 && i + 1 < end && isHexDigit(bytes[i + 1])) {
      let digits = String.fromCharCode(bytes[++i]!);
      if (i + 1 < end && isHexDigit(bytes[i + 1])) {
        digits += String.fromCharCode(bytes[++i]!);
      }
      out.push(Number.parseInt(digits, 16));
      continue;
    }
    let octal = "";
    while (i < end && bytes[i]! >= 0x30 && bytes[i]! <= 0x37 && octal.length < 3) {
      octal += String.fromCharCode(bytes[i++]!);
    }
    if (octal !== "") {
      out.push(Number.parseInt(octal, 8) & 0xff);
      i--;
    } else {
      out.push(c);
    }
  }
  return decodeResult("stripcslashes", Uint8Array.from(out));
}
