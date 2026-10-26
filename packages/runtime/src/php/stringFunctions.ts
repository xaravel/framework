// PHP's string functions the Collections tests call (ESC-14.1-6; action item
// epic-14-item-2-runtime-generators-functions), under their PHP names, ports of PHP 8.5.11's `ext/standard/string.c`
// in coercive typing mode: `str_starts_with` and `substr`. A PHP string is its bytes, so `substr` counts UTF-8 bytes.
// A result or input JS cannot hold (a result that splits a UTF-8 sequence, an input holding a lone surrogate) throws a
// JS `TypeError` naming the limit, as the codecs do.
import { LONE_SURROGATE, utf8 } from "./mangle";
import { intParameter, nullableIntParameter, stringParameter } from "./phpArguments";

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
