// PHP's numeric strings (AD-9, Story 9.6): `_is_numeric_string_ex` of PHP 8.5's `Zend/zend_operators.c`, and
// `is_numeric`, which reads it.
import { isFloat } from "./PhpFloat";

/** A numeric string as `_is_numeric_string_ex` reads it. */
export interface NumericString {
  /** The int value, or null when the string is a float (a fraction, an exponent, or an int overflowing int64). */
  int: bigint | null;
  /** The number read as a double (`zend_strtod`, so `"-0"` is -0.0). */
  float: number;
  /** -1 or 1 when the string is an integer that overflows int64 to that side (`oflow`), else 0. */
  overflow: -1 | 0 | 1;
}

/** Leading whitespace, sign, mantissa (`1`, `1.`, `1.5`, `.5`) and exponent; PHP's whitespace is ` \t\n\r\v\f`. */
const NUMBER = /^[ \t\n\r\v\f]*([+-]?)(?:(\d+)(\.\d*)?|(\.\d+))([eE][+-]?\d+)?/;
const TRAILING_WHITESPACE = /^[ \t\n\r\v\f]*$/;
/** The digits of `-PHP_INT_MIN`, which `_is_numeric_string_ex` compares a 19-digit integer with. */
const LONG_MIN_DIGITS = "9223372036854775808";
/** `MAX_LENGTH_OF_LONG` on a 64-bit build. */
const MAX_LENGTH_OF_LONG = 20;

/**
 * `s` read as PHP reads a numeric string, or null when it is none. Whitespace may surround the number. With
 * `allowErrors` (the casts and arithmetic), the leading numeric prefix is read and trailing data is ignored.
 */
export function parseNumeric(s: string, allowErrors: boolean): NumericString | null {
  const match = NUMBER.exec(s);
  if (match === null) {
    return null;
  }
  const rest = s.slice(match[0].length);
  if (!allowErrors && !TRAILING_WHITESPACE.test(rest)) {
    return null;
  }
  const [, sign, digits, fraction, , exponent] = match;
  const negative = sign === "-";
  const value = Number(match[0].trimStart());
  if (digits === undefined) {
    // `.5`: a float.
    return { int: null, float: value, overflow: 0 };
  }
  // PHP skips leading zeros before it counts the integer digits.
  const significant = digits.replace(/^0+/, "");
  if (significant.length >= MAX_LENGTH_OF_LONG) {
    return { int: null, float: value, overflow: negative ? -1 : 1 };
  }
  if (fraction !== undefined || exponent !== undefined) {
    return { int: null, float: value, overflow: 0 };
  }
  if (significant.length === MAX_LENGTH_OF_LONG - 1) {
    // PHP compares the digits and whatever follows them with LONG_MIN_DIGITS (`strcmp`), so trailing whitespace or
    // data after `9223372036854775808` makes even `-9223372036854775808` overflow.
    const cmp = significant < LONG_MIN_DIGITS ? -1 : significant > LONG_MIN_DIGITS || rest !== "" ? 1 : 0;
    if (!(cmp < 0 || (cmp === 0 && negative))) {
      return { int: null, float: value, overflow: negative ? -1 : 1 };
    }
  }
  const int = BigInt(negative ? `-${digits}` : digits);
  return { int, float: value, overflow: 0 };
}

/**
 * PHP's `is_numeric($v)`: true for an int or a float (`NAN` and `INF` included), and for a numeric string, which may
 * have leading and trailing whitespace; false for anything else.
 */
export function isNumeric(v: unknown): boolean {
  switch (typeof v) {
    case "number":
    case "bigint":
      return true;
    case "string":
      return parseNumeric(v, false) !== null;
    default:
      return isFloat(v);
  }
}
