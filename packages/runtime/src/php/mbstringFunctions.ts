// PHP's mbstring functions phpdotenv calls (ESC-15.2-1 part c; action item
// epic-15-item-1-runtime-phpdotenv-builtins), under their PHP names, ports of PHP 8.5.11's `ext/mbstring/mbstring.c`
// in coercive typing mode: `mb_strlen`, `mb_substr`, `mb_strpos`, `mb_convert_encoding`, `mb_list_encodings` and
// `mb_encoding_aliases`. A runtime string is always well-formed UTF-8, so only UTF-8 is ported:
//
// - An `$encoding` of null, `UTF-8` or any name mbstring resolves to UTF-8 (`utf8`, in any ASCII case) is UTF-8, and
//   the `mb_*` functions count code points.
// - A name mbstring does not know throws PHP's `ValueError` (`<fn>(): Argument #<n> ($encoding) must be a valid
//   encoding, "<name>" given`). A name it knows that is not UTF-8 throws a JS `TypeError` naming the limit: no string
//   in another encoding exists in the runtime.
// - Names resolve as `mbfl_name2encoding_ex` resolves them: an encoding's name, else its MIME name, else one of its
//   aliases, each ASCII case-insensitively, in `ENCODINGS` order.
//
// `ENCODINGS` is data, not logic: PHP 8.5.11's `mb_list_encodings()` with each encoding's `mb_preferred_mime_name()`
// (null for none) and `mb_encoding_aliases()`, generated from PHP and re-checked in full by
// `tests/xaravel/php-phpdotenv-builtins.probe.php`. A string holding a lone surrogate throws a JS `TypeError`.
//
// To regenerate the table's rows (the lines between `([` and `] satisfies`), run with PHP 8.5.11:
//
//   php -d error_reporting=0 -r 'foreach (mb_list_encodings() as $e) echo "    ", str_replace([",\"", ",[", ",null"], [", \"", ", [", ", null"], json_encode([$e, mb_preferred_mime_name($e) ?: null, mb_encoding_aliases($e)], JSON_UNESCAPED_SLASHES)), ",\n";'
import { arrayEntries, toPhpString } from "./casts";
import { arrayFromEntries, type PhpArrayKey } from "./PhpArray";
import { argumentTypeError, intParameter, nullableIntParameter, stringParameter } from "./phpArguments";
import { toStringArgument } from "./throwableArguments";
import { phpType } from "./phpType";
import { isContractToken } from "../registry/registry";
import { LONE_SURROGATE } from "./mangle";
import { ValueError } from "./ValueError";

/** An mbstring encoding: its name, its MIME name (null for none) and its aliases, as PHP 8.5.11 lists them. */
type EncodingRow = readonly [name: string, mime: string | null, aliases: readonly string[]];

/** PHP 8.5.11's 79 mbstring encodings, in `mb_list_encodings()` order (generated from PHP; see the header). */
const ENCODINGS: readonly EncodingRow[] = Object.freeze(
  ([
    ["BASE64", "BASE64", []],
    ["UUENCODE", "x-uuencode", []],
    ["HTML-ENTITIES", "HTML-ENTITIES", ["HTML", "html"]],
    ["Quoted-Printable", "Quoted-Printable", ["qprint"]],
    ["7bit", "7bit", []],
    ["8bit", "8bit", ["binary"]],
    ["UCS-4", "UCS-4", ["ISO-10646-UCS-4", "UCS4"]],
    ["UCS-4BE", "UCS-4BE", ["byte4be"]],
    ["UCS-4LE", "UCS-4LE", ["byte4le"]],
    ["UCS-2", "UCS-2", ["ISO-10646-UCS-2", "UCS2", "UNICODE"]],
    ["UCS-2BE", "UCS-2BE", ["byte2be"]],
    ["UCS-2LE", "UCS-2LE", ["byte2le"]],
    ["UTF-32", "UTF-32", ["utf32"]],
    ["UTF-32BE", "UTF-32BE", []],
    ["UTF-32LE", "UTF-32LE", []],
    ["UTF-16", "UTF-16", ["utf16"]],
    ["UTF-16BE", "UTF-16BE", []],
    ["UTF-16LE", "UTF-16LE", []],
    ["UTF-8", "UTF-8", ["utf8"]],
    ["UTF-7", "UTF-7", ["utf7"]],
    ["UTF7-IMAP", null, ["mUTF-7"]],
    ["ASCII", "US-ASCII", ["ANSI_X3.4-1968", "iso-ir-6", "ANSI_X3.4-1986", "ISO_646.irv:1991", "US-ASCII", "ISO646-US", "us", "IBM367", "IBM-367", "cp367", "csASCII"]],
    ["EUC-JP", "EUC-JP", ["EUC", "EUC_JP", "eucJP", "x-euc-jp"]],
    ["SJIS", "Shift_JIS", ["x-sjis", "SHIFT-JIS"]],
    ["eucJP-win", "EUC-JP", ["eucJP-open", "eucJP-ms"]],
    ["EUC-JP-2004", "EUC-JP", ["EUC_JP-2004"]],
    ["SJIS-Mobile#DOCOMO", "Shift_JIS", ["SJIS-DOCOMO", "shift_jis-imode", "x-sjis-emoji-docomo"]],
    ["SJIS-Mobile#KDDI", "Shift_JIS", ["SJIS-KDDI", "shift_jis-kddi", "x-sjis-emoji-kddi"]],
    ["SJIS-Mobile#SOFTBANK", "Shift_JIS", ["SJIS-SOFTBANK", "shift_jis-softbank", "x-sjis-emoji-softbank"]],
    ["SJIS-mac", "Shift_JIS", ["MacJapanese", "x-Mac-Japanese"]],
    ["SJIS-2004", "Shift_JIS", ["SJIS2004", "Shift_JIS-2004"]],
    ["UTF-8-Mobile#DOCOMO", "UTF-8", ["UTF-8-DOCOMO", "UTF8-DOCOMO"]],
    ["UTF-8-Mobile#KDDI-A", "UTF-8", []],
    ["UTF-8-Mobile#KDDI-B", "UTF-8", ["UTF-8-Mobile#KDDI", "UTF-8-KDDI", "UTF8-KDDI"]],
    ["UTF-8-Mobile#SOFTBANK", "UTF-8", ["UTF-8-SOFTBANK", "UTF8-SOFTBANK"]],
    ["CP932", "Shift_JIS", ["MS932", "Windows-31J", "MS_Kanji"]],
    ["SJIS-win", "Shift_JIS", ["SJIS-ms", "SJIS-open"]],
    ["CP51932", "CP51932", ["cp51932"]],
    ["JIS", "ISO-2022-JP", []],
    ["ISO-2022-JP", "ISO-2022-JP", []],
    ["ISO-2022-JP-MS", "ISO-2022-JP", ["ISO2022JPMS"]],
    ["GB18030", "GB18030", ["gb-18030", "gb-18030-2000"]],
    ["GB18030-2022", "GB18030-2022", []],
    ["Windows-1252", "Windows-1252", ["cp1252"]],
    ["Windows-1254", "Windows-1254", ["CP1254", "CP-1254", "WINDOWS-1254"]],
    ["ISO-8859-1", "ISO-8859-1", ["ISO8859-1", "latin1"]],
    ["ISO-8859-2", "ISO-8859-2", ["ISO8859-2", "latin2"]],
    ["ISO-8859-3", "ISO-8859-3", ["ISO8859-3", "latin3"]],
    ["ISO-8859-4", "ISO-8859-4", ["ISO8859-4", "latin4"]],
    ["ISO-8859-5", "ISO-8859-5", ["ISO8859-5", "cyrillic"]],
    ["ISO-8859-6", "ISO-8859-6", ["ISO8859-6", "arabic"]],
    ["ISO-8859-7", "ISO-8859-7", ["ISO8859-7", "greek"]],
    ["ISO-8859-8", "ISO-8859-8", ["ISO8859-8", "hebrew"]],
    ["ISO-8859-9", "ISO-8859-9", ["ISO8859-9", "latin5"]],
    ["ISO-8859-10", "ISO-8859-10", ["ISO8859-10", "latin6"]],
    ["ISO-8859-13", "ISO-8859-13", ["ISO8859-13"]],
    ["ISO-8859-14", "ISO-8859-14", ["ISO8859-14", "latin8"]],
    ["ISO-8859-15", "ISO-8859-15", ["ISO8859-15"]],
    ["ISO-8859-16", "ISO-8859-16", ["ISO8859-16"]],
    ["EUC-CN", "CN-GB", ["CN-GB", "EUC_CN", "eucCN", "x-euc-cn", "gb2312"]],
    ["CP936", "CP936", ["CP-936", "GBK"]],
    ["HZ", "HZ-GB-2312", []],
    ["EUC-TW", "EUC-TW", ["EUC_TW", "eucTW", "x-euc-tw"]],
    ["BIG-5", "BIG5", ["CN-BIG5", "BIG-FIVE", "BIGFIVE"]],
    ["CP950", "BIG5", []],
    ["EUC-KR", "EUC-KR", ["EUC_KR", "eucKR", "x-euc-kr"]],
    ["UHC", "UHC", ["CP949"]],
    ["ISO-2022-KR", "ISO-2022-KR", []],
    ["Windows-1251", "Windows-1251", ["CP1251", "CP-1251", "WINDOWS-1251"]],
    ["CP866", "CP866", ["CP-866", "IBM866", "IBM-866"]],
    ["KOI8-R", "KOI8-R", ["KOI8R"]],
    ["KOI8-U", "KOI8-U", ["KOI8U"]],
    ["ArmSCII-8", "ArmSCII-8", ["ArmSCII8", "ARMSCII-8", "ARMSCII8"]],
    ["CP850", "CP850", ["CP-850", "IBM850", "IBM-850"]],
    ["ISO-2022-JP-2004", "ISO-2022-JP-2004", []],
    ["ISO-2022-JP-MOBILE#KDDI", "ISO-2022-JP", ["ISO-2022-JP-KDDI"]],
    ["CP50220", "ISO-2022-JP", ["cp50220raw", "cp50220-raw", "JIS-ms"]],
    ["CP50221", "ISO-2022-JP", []],
    ["CP50222", "ISO-2022-JP", []],
  ] satisfies [string, string | null, string[]][]).map(([name, mime, aliases]): EncodingRow => Object.freeze([name, mime, Object.freeze(aliases)] as const)),
);

/** The canonical name of UTF-8. */
const UTF8 = "UTF-8";

/** `name` lower-cased as `strcasecmp` compares it: ASCII `A`-`Z` only. */
function asciiLower(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/** Each lower-cased lookup key to its encoding's row, first match winning, in `mbfl_name2encoding_ex`'s three passes. */
const BY_NAME: ReadonlyMap<string, EncodingRow> = (() => {
  const map = new Map<string, EncodingRow>();
  const add = (key: string, row: EncodingRow): void => {
    const lower = asciiLower(key);
    if (!map.has(lower)) {
      map.set(lower, row);
    }
  };
  for (const row of ENCODINGS) add(row[0], row);
  for (const row of ENCODINGS) if (row[1] !== null) add(row[1], row);
  for (const row of ENCODINGS) for (const alias of row[2]) add(alias, row);
  return map;
})();

/**
 * The canonical name of the mbstring encoding `name` names (its name, MIME name or an alias, ASCII
 * case-insensitively), or null when mbstring knows none. Internal: the probe test reads it.
 */
export function encodingName(name: string): string | null {
  return BY_NAME.get(asciiLower(name))?.[0] ?? null;
}

/** `s`, refused with a JS `TypeError` when it holds a lone surrogate, which has no UTF-8 form. */
function wellFormed(fn: string, s: string): string {
  if (LONE_SURROGATE.test(s)) {
    throw new TypeError(`${fn}(): the string holds a lone surrogate, which has no UTF-8 form`);
  }
  return s;
}

/** The JS `TypeError` for an encoding mbstring knows that is not UTF-8. */
function notUtf8(fn: string, canonical: string): TypeError {
  return new TypeError(`${fn}(): the ${canonical} encoding is not ported; a runtime string is UTF-8, so only UTF-8 and its aliases are`);
}

/** A union-typed string parameter (`?string`, `array|string`, …) read as its string, else PHP's `TypeError` naming `type`. */
function typedString(fn: string, position: number, name: string, type: string, value: unknown): string {
  const coerced = toStringArgument(value);
  if (coerced === null) {
    throw argumentTypeError(fn, position, name, type, value);
  }
  return coerced;
}

/**
 * The `?string $encoding` argument `position` of `fn`, checked to be UTF-8: null (or undefined) is UTF-8; a name
 * mbstring does not know throws PHP's `ValueError`, one it knows that is not UTF-8 a JS `TypeError`.
 */
function utf8Encoding(fn: string, position: number, value: unknown): void {
  if (value === null || value === undefined) {
    return;
  }
  const name = typedString(fn, position, "encoding", "?string", value);
  const canonical = encodingName(name);
  if (canonical === null) {
    throw new ValueError(`${fn}(): Argument #${position} ($encoding) must be a valid encoding, "${name}" given`);
  }
  if (canonical !== UTF8) {
    throw notUtf8(fn, canonical);
  }
}

/** The code points of `s`. */
function codePoints(s: string): string[] {
  return Array.from(s);
}

/**
 * PHP's `mb_strlen($string, $encoding = null)`: the number of code points of `string` (`mb_strlen("héllo")` is 5).
 * Coerced as PHP's `string` and `?string` parameters; anything else throws PHP's `TypeError`. The encoding is checked
 * as the header says.
 */
export function mb_strlen(string: unknown, encoding: unknown = null): number {
  const s = wellFormed("mb_strlen", stringParameter("mb_strlen", 1, "string", string));
  utf8Encoding("mb_strlen", 2, encoding);
  return codePoints(s).length;
}

/**
 * PHP's `mb_substr($string, $start, $length = null, $encoding = null)`, over code points: a negative `start` counts
 * from the end, a negative `length` stops that many code points before it, and null runs to the end, clamped as PHP
 * clamps them. Coerced as PHP's `string`, `int`, `?int` and `?string` parameters; anything else throws PHP's
 * `TypeError`.
 */
export function mb_substr(string: unknown, start: unknown, length: unknown = null, encoding: unknown = null): string {
  const s = wellFormed("mb_substr", stringParameter("mb_substr", 1, "string", string));
  const from = BigInt(intParameter("mb_substr", 2, "start", start));
  const userLength = nullableIntParameter("mb_substr", 3, "length", length);
  utf8Encoding("mb_substr", 4, encoding);
  const chars = codePoints(s);
  const size = BigInt(chars.length);
  let realFrom: bigint;
  if (from >= 0n) {
    realFrom = from;
  } else if (-from < size) {
    realFrom = size + from;
  } else {
    realFrom = 0n;
  }
  let realLength: bigint;
  if (userLength === null) {
    realLength = size;
  } else {
    const len = BigInt(userLength);
    if (len >= 0n) {
      realLength = len;
    } else if (realFrom < size && -len < size - realFrom) {
      realLength = size - realFrom + len;
    } else {
      realLength = 0n;
    }
  }
  if (realFrom >= size) {
    return "";
  }
  const end = realFrom + realLength > size ? size : realFrom + realLength;
  return chars.slice(Number(realFrom), Number(end)).join("");
}

/**
 * PHP's `mb_strpos($haystack, $needle, $offset = 0, $encoding = null)`: the code-point position of the first `needle`
 * in `haystack` at or after `offset` (a negative one counts from the end), or `false`. An empty `needle` is found at
 * `offset`. An `offset` beyond either end throws PHP's `ValueError` `mb_strpos(): Argument #3 ($offset) must be
 * contained in argument #1 ($haystack)`; an argument of another type PHP's `TypeError`.
 */
export function mb_strpos(haystack: unknown, needle: unknown, offset: unknown = 0, encoding: unknown = null): number | false {
  const h = wellFormed("mb_strpos", stringParameter("mb_strpos", 1, "haystack", haystack));
  const n = wellFormed("mb_strpos", stringParameter("mb_strpos", 2, "needle", needle));
  const at = BigInt(intParameter("mb_strpos", 3, "offset", offset));
  utf8Encoding("mb_strpos", 4, encoding);
  const chars = codePoints(h);
  const size = BigInt(chars.length);
  if (at > size || -at > size) {
    throw new ValueError("mb_strpos(): Argument #3 ($offset) must be contained in argument #1 ($haystack)");
  }
  const start = Number(at < 0n ? size + at : at);
  const rest = chars.slice(start).join("");
  const found = rest.indexOf(n);
  return found === -1 ? false : start + codePoints(rest.slice(0, found)).length;
}

/** Whether `value` is a PHP array in the AD-9 forms (a contract token is a string). */
function isArray(value: unknown): value is object {
  return !isContractToken(value) && phpType(value) === "array";
}

/**
 * `mb_convert_encoding`'s `$from_encoding` checked to name UTF-8 only: a list string (`"UTF-8, utf8"`: comma-separated,
 * each name trimmed of spaces and tabs, an empty one skipped) or an array of names. A name mbstring does not know throws
 * PHP's `ValueError` `contains invalid encoding "<name>"`; an empty string or array `must specify at least one
 * encoding`; `auto` or a known non-UTF-8 name a JS `TypeError`.
 */
function utf8FromEncodings(from: string | object): void {
  const fn = "mb_convert_encoding";
  let names: string[];
  if (typeof from !== "string") {
    names = arrayEntries(from).map(([, value]) => toPhpString(value));
    if (names.length === 0) {
      throw new ValueError(`${fn}(): Argument #3 ($from_encoding) must specify at least one encoding`);
    }
  } else {
    const list = from;
    if (list === "") {
      throw new ValueError(`${fn}(): Argument #3 ($from_encoding) must specify at least one encoding`);
    }
    names = list.split(",").map((name) => name.replace(/^[ \t]+|[ \t]+$/g, "")).filter((name) => name !== "");
  }
  for (const name of names) {
    if (asciiLower(name) === "auto") {
      throw new TypeError(`${fn}(): the "auto" encoding list is not ported; it depends on mbstring.language`);
    }
    const canonical = encodingName(name);
    if (canonical === null) {
      throw new ValueError(`${fn}(): Argument #3 ($from_encoding) contains invalid encoding "${name}"`);
    }
    if (canonical !== UTF8) {
      throw notUtf8(fn, canonical);
    }
  }
}

/** A copy of `array` as `php_mb_convert_encoding_recursive` gives it from UTF-8 to UTF-8; `seen` guards a cycle. */
function convertArray(array: object, seen: Set<object>): unknown {
  if (seen.has(array)) {
    return [];
  }
  seen.add(array);
  const out: [PhpArrayKey, unknown][] = [];
  for (const [key, value] of arrayEntries(array)) {
    if (typeof value === "string" || isContractToken(value)) {
      out.push([key, wellFormed("mb_convert_encoding", toPhpString(value))]);
    } else if (isArray(value)) {
      out.push([key, convertArray(value, seen)]);
    } else if (value === null || value === undefined || typeof value === "boolean" || phpType(value) === "int" || phpType(value) === "float") {
      out.push([key, value ?? null]);
    }
    // An object is dropped, as PHP drops it (its warning "Object is not supported" is not raised).
  }
  seen.delete(array);
  return arrayFromEntries(out);
}

/**
 * PHP's `mb_convert_encoding($string, $to_encoding, $from_encoding = null)` from UTF-8 to UTF-8, the one conversion a
 * runtime string can take: a string is returned unchanged, an array copied (keys kept, strings unchanged, nested
 * arrays copied, null, bool, int and float values kept, an object dropped as PHP drops it, a cycle an empty array).
 * `to_encoding` and `from_encoding` (null, a name, a comma-separated list or an array of names) must name UTF-8: an
 * unknown name throws PHP's `ValueError`, a known non-UTF-8 name or `auto` a JS `TypeError`. Coerced as PHP's
 * `array|string`, `string` and `array|string|null` parameters; anything else throws PHP's `TypeError`.
 */
export function mb_convert_encoding(string: unknown, to_encoding: unknown, from_encoding: unknown = null): unknown {
  const fn = "mb_convert_encoding";
  const input: string | object = isArray(string) ? string : wellFormed(fn, typedString(fn, 1, "string", "array|string", string));
  const to = stringParameter(fn, 2, "to_encoding", to_encoding);
  const from: string | object | null =
    from_encoding === null || from_encoding === undefined ? null : isArray(from_encoding) ? from_encoding : typedString(fn, 3, "from_encoding", "array|string|null", from_encoding);
  const canonical = encodingName(to);
  if (canonical === null) {
    throw new ValueError(`${fn}(): Argument #2 ($to_encoding) must be a valid encoding, "${to}" given`);
  }
  if (from !== null) {
    utf8FromEncodings(from);
  }
  if (canonical !== UTF8) {
    throw notUtf8(fn, canonical);
  }
  return typeof input === "string" ? input : convertArray(input, new Set());
}

/** PHP's `mb_list_encodings()`: the names of PHP 8.5.11's 79 mbstring encodings, in its order, as a new list. */
export function mb_list_encodings(): string[] {
  return ENCODINGS.map(([name]) => name);
}

/**
 * PHP's `mb_encoding_aliases($encoding)`: the aliases of the encoding `encoding` names, as PHP 8.5.11 lists them (a
 * new list, `[]` for none). A name mbstring does not know throws PHP's `ValueError` `mb_encoding_aliases(): Argument
 * #1 ($encoding) must be a valid encoding, "<name>" given`; a non-string PHP's `TypeError`. Every encoding is
 * answered, not only UTF-8: this reads the table and converts no string.
 */
export function mb_encoding_aliases(encoding: unknown): string[] {
  const name = stringParameter("mb_encoding_aliases", 1, "encoding", encoding);
  const row = BY_NAME.get(asciiLower(name));
  if (row === undefined) {
    throw new ValueError(`mb_encoding_aliases(): Argument #1 ($encoding) must be a valid encoding, "${name}" given`);
  }
  return [...row[2]];
}

/** The MIME name of each encoding, as `mb_preferred_mime_name` gives it (null for none). Internal: the probe test reads it. */
export function encodingMimeNames(): [string, string | null][] {
  return ENCODINGS.map(([name, mime]) => [name, mime]);
}
