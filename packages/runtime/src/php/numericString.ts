// PHP's numeric strings (AD-9, Stories 9.6 and 9.8): `_is_numeric_string_ex` of PHP 8.5's `Zend/zend_operators.c`. It
// imports nothing; `jsonEncode` reads it for `JSON_NUMERIC_CHECK`, and `isNumeric.ts` re-exports it for the casts and
// `looseEquals`. The package does not export this module.

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
 * Whether the decimal integer `digits` (no sign, no leading zeros) with the sign `negative` lies outside int64, as
 * `_is_numeric_string_ex` and `json_scanner.re` decide it: more than 19 digits, or 19 digits that `strcmp` puts at or
 * above `LONG_MIN_DIGITS` (only `-9223372036854775808` itself fits), where `trailing` (more text after the digits,
 * which `strcmp` also reads) makes them compare above it.
 */
export function exceedsInt64(digits: string, negative: boolean, trailing: boolean = false): boolean {
  if (digits.length !== MAX_LENGTH_OF_LONG - 1) {
    return digits.length >= MAX_LENGTH_OF_LONG;
  }
  const cmp = digits < LONG_MIN_DIGITS ? -1 : digits > LONG_MIN_DIGITS || trailing ? 1 : 0;
  return !(cmp < 0 || (cmp === 0 && negative));
}

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
  // PHP compares the digits and whatever follows them with LONG_MIN_DIGITS (`strcmp`), so trailing whitespace or data
  // after `9223372036854775808` makes even `-9223372036854775808` overflow.
  if (exceedsInt64(significant, negative, rest !== "")) {
    return { int: null, float: value, overflow: negative ? -1 : 1 };
  }
  const int = BigInt(negative ? `-${digits}` : digits);
  return { int, float: value, overflow: 0 };
}
