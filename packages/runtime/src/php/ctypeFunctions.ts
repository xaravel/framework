// PHP's `ctype_space` and `ctype_digit` (ESC-15.2-1 part b; action item epic-15-item-1-runtime-phpdotenv-builtins),
// ports of PHP 8.5.11's `ext/ctype/ctype.c` (`ctype_impl`) in the C locale, the locale the Oracle's PHP runs in:
//
// - A string is tested byte by byte over its UTF-8 bytes: true when it is not empty and every byte is in the class
//   (`isspace`: space, `\t`, `\n`, `\v`, `\f`, `\r`; `isdigit`: `0`-`9`). A byte of 0x80 or more is in neither class,
//   so a multi-byte character never is. A contract token is its class-string.
// - An int from -128 to 255 is that character (a negative one plus 256); any other int is its decimal string, so it
//   is all digits when it is positive and never all spaces.
// - Any other value (null, a bool, a float, an array, an object, a `__toString` object included) is false.
//
// PHP's deprecation notice for a non-string argument is not raised (DIV-9.17). A string holding a lone surrogate
// throws a JS `TypeError`, as the string functions do.
import { fqcn, isContractToken } from "../registry/registry";
import { LONE_SURROGATE, utf8 } from "./mangle";
import { phpType } from "./phpType";
import { phpValueOf } from "./throwableArguments";

/** C's `isspace` in the C locale. */
function isSpace(byte: number): boolean {
  return byte === 0x20 || (byte >= 0x09 && byte <= 0x0d);
}

/** C's `isdigit`. */
function isDigit(byte: number): boolean {
  return byte >= 0x30 && byte <= 0x39;
}

/** `ctype_impl`: `text` tested by `is`, an int outside -128..255 read as its decimal string. */
function ctype(fn: string, text: unknown, is: (byte: number) => boolean): boolean {
  const value = phpValueOf(text);
  let type: string;
  try {
    type = phpType(value);
  } catch {
    return false;
  }
  if (type === "string") {
    const s = isContractToken(value) ? fqcn(value) : (value as string);
    if (LONE_SURROGATE.test(s)) {
      throw new TypeError(`${fn}(): the string holds a lone surrogate, which has no UTF-8 form`);
    }
    const bytes = utf8.encode(s);
    return bytes.length > 0 && bytes.every(is);
  }
  if (type !== "int") {
    return false;
  }
  const int = BigInt(value as number | bigint);
  if (int >= -128n && int <= 255n) {
    return is(Number(int < 0n ? int + 256n : int));
  }
  return utf8.encode(int.toString()).every(is);
}

/**
 * PHP's `ctype_space($text)`: whether `text` is a non-empty string of C-locale whitespace bytes (space, `\t`, `\n`,
 * `\v`, `\f`, `\r`), or an int from -128 to 255 naming one; any other value is false.
 */
export function ctype_space(text: unknown): boolean {
  return ctype("ctype_space", text, isSpace);
}

/**
 * PHP's `ctype_digit($text)`: whether `text` is a non-empty string of the bytes `0`-`9`, an int from -128 to 255
 * naming one (`53` is `"5"`), or an int above 255; any other value is false (`5` is the character 5, not a digit).
 */
export function ctype_digit(text: unknown): boolean {
  return ctype("ctype_digit", text, isDigit);
}
