// PHP's `sprintf` (action item epic-14-item-3-runtime-type-tests-functions, ESC-14.1-9), a line-for-line port of PHP
// 8.5.11's `php_formatted_print` (`ext/standard/formatted_print.c`) with `php_conv_fp` and `zend_gcvt`
// (`main/snprintf.c`, `Zend/zend_strtod.c`) for the floats. A PHP string is its bytes: the format and every `%s`
// argument are read as UTF-8 bytes, widths and precisions count bytes, and the result is decoded back. A result JS
// cannot hold (a precision that splits a UTF-8 sequence, a `%c` byte of 0x80 or more on its own) and a string holding
// a lone surrogate throw a JS `TypeError` naming the limit, as `substr` does. The float digits are exact: `%e`, `%f`
// and `%g` round the double's exact decimal value half to even, as `zend_dtoa` does. The decimal point is `.`, PHP's
// default C locale; `setlocale` is not ported. Everything is synchronous.
import { ArgumentCountError } from "./ArgumentCountError";
import { toFloat, toInt, toPhpString } from "./casts";
import { LONE_SURROGATE, utf8 } from "./mangle";
import { stringParameter } from "./phpArguments";
import { ValueError } from "./ValueError";

/** C's `INT_MAX`. */
const INT_MAX = 2147483647;
const ALIGN_LEFT = 0;
const ALIGN_RIGHT = 1;
const ADJ_PRECISION = 2;
const FLOAT_PRECISION = 6;
const MAX_FLOAT_PRECISION = 53;
const ARG_NUM_NEXT = -1;
const TWO_64 = 1n << 64n;

const PERCENT = 0x25;
const DOLLAR = 0x24;

/** A UTF-8 decoder that refuses a split sequence and keeps a leading BOM. */
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** The UTF-8 bytes of `s`; throws a JS `TypeError` for a lone surrogate, which has no UTF-8 form. */
function bytesOf(s: string): Uint8Array {
  if (LONE_SURROGATE.test(s)) {
    throw new TypeError("sprintf(): the string holds a lone surrogate, which has no UTF-8 form");
  }
  return utf8.encode(s);
}

/** The ASCII bytes of `s`. */
function ascii(s: string): number[] {
  return Array.from(s, (c) => c.charCodeAt(0));
}

function isDigit(c: number): boolean {
  return c >= 0x30 && c <= 0x39;
}

function isAlpha(c: number): boolean {
  return (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
}

/** A `zend_long` as a `bigint`. */
function longOf(value: unknown): bigint {
  return BigInt(toInt(value));
}

/** The `ValueError` `php_formatted_print` throws; `goto fail`. */
class Fail {
  constructor(readonly error: Error) {}
}

/** The format cursor: the bytes, the position and PHP's `format_len` (which may run past the end). */
interface Cursor {
  readonly bytes: Uint8Array;
  pos: number;
  len: number;
}

/** `*format`: the byte at the cursor, or the NUL past the end. */
function at(cursor: Cursor): number {
  return cursor.bytes[cursor.pos] ?? 0;
}

function advance(cursor: Cursor): void {
  cursor.pos++;
  cursor.len--;
}

/** `php_sprintf_getnumber`: `strtol` from the cursor, -1 when it is `INT_MAX` or more. */
function getNumber(cursor: Cursor): number {
  let value = 0n;
  while (isDigit(at(cursor))) {
    value = value * 10n + BigInt(at(cursor) - 0x30);
    advance(cursor);
  }
  return value >= BigInt(INT_MAX) ? -1 : Number(value);
}

/** `php_sprintf_get_argnum`. */
function getArgnum(cursor: Cursor): number {
  let probe = cursor.pos;
  while (isDigit(cursor.bytes[probe] ?? 0)) {
    probe++;
  }
  if ((cursor.bytes[probe] ?? 0) !== DOLLAR) {
    return ARG_NUM_NEXT;
  }
  const argnum = getNumber(cursor);
  if (argnum <= 0) {
    throw new Fail(new ValueError(`Argument number specifier must be greater than zero and less than ${INT_MAX}`));
  }
  advance(cursor);
  return argnum - 1;
}

/** `php_sprintf_appendstring`. */
function appendString(out: number[], add: readonly number[], minWidth: number, maxWidth: number, padding: number, alignment: number, neg: boolean, expprec: boolean, alwaysSign: boolean): void {
  let copyLen = expprec ? Math.min(maxWidth, add.length) : add.length;
  let npad = minWidth < copyLen ? 0 : minWidth - copyLen;
  let start = 0;
  if (alignment === ALIGN_RIGHT) {
    if ((neg || alwaysSign) && padding === 0x30) {
      out.push(neg ? 0x2d : 0x2b);
      start++;
      copyLen--;
    }
    while (npad-- > 0) {
      out.push(padding);
    }
  }
  for (let index = 0; index < copyLen; index++) {
    out.push(add[start + index]!);
  }
  if (alignment === ALIGN_LEFT) {
    while (npad-- > 0) {
      out.push(padding);
    }
  }
}

/** `php_sprintf_appendint`. */
function appendInt(out: number[], number: bigint, width: number, padding: number, alignment: number, alwaysSign: boolean): void {
  const neg = number < 0n;
  const digits = (neg ? -number : number).toString();
  const sign = neg ? "-" : alwaysSign ? "+" : "";
  appendString(out, ascii(sign + digits), width, 0, alignment === ALIGN_LEFT && padding === 0x30 ? 0x20 : padding, alignment, neg, false, alwaysSign);
}

/** `php_sprintf_appenduint`: the long as a `zend_ulong`. */
function appendUint(out: number[], number: bigint, width: number, padding: number, alignment: number): void {
  const magnitude = number < 0n ? number + TWO_64 : number;
  appendString(out, ascii(magnitude.toString()), width, 0, alignment === ALIGN_LEFT && padding === 0x30 ? 0x20 : padding, alignment, false, false, false);
}

/**
 * `php_sprintf_append2n`: the long as a `zend_ulong` in base 2^n. PHP passes a maximum width of 0, so an explicit
 * precision (`%.2x`) prints no digits, only the padding.
 */
function append2n(out: number[], number: bigint, width: number, padding: number, alignment: number, radix: number, upper: boolean, expprec: boolean): void {
  const magnitude = number < 0n ? number + TWO_64 : number;
  const digits = magnitude.toString(radix);
  appendString(out, ascii(upper ? digits.toUpperCase() : digits), width, 0, padding, alignment, false, expprec, false);
}

/** The exact decimal value of the finite `|x|`: `digits / 10^scale`. */
function exactDecimal(x: number): { digits: bigint; scale: number } {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(x));
  const bits = view.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  const mantissa = exponent === 0 ? fraction : fraction | (1n << 52n);
  const power = (exponent === 0 ? 1 : exponent) - 1075;
  if (power >= 0) {
    return { digits: mantissa << BigInt(power), scale: 0 };
  }
  return { digits: mantissa * 5n ** BigInt(-power), scale: -power };
}

/** `n / 10^drop`, rounded half to even. */
function roundHalfEven(n: bigint, drop: number): bigint {
  if (drop <= 0) {
    return n * 10n ** BigInt(-drop);
  }
  const divisor = 10n ** BigInt(drop);
  const quotient = n / divisor;
  const twice = (n % divisor) * 2n;
  if (twice > divisor || (twice === divisor && quotient % 2n === 1n)) {
    return quotient + 1n;
  }
  return quotient;
}

/**
 * `zend_dtoa(|x|, 2, ndigit)` for a finite, non-zero `x`: the significant digits rounded half to even to `ndigit`,
 * trailing zeros stripped, and the decimal point position (`|x| = 0.digits × 10^decpt`).
 */
function dtoaMode2(x: number, ndigit: number): { digits: string; decpt: number } {
  const { digits, scale } = exactDecimal(x);
  const length = digits.toString().length;
  let decpt = length - scale;
  let rounded = roundHalfEven(digits, length - ndigit);
  if (rounded.toString().length > ndigit) {
    rounded /= 10n;
    decpt++;
  }
  return { digits: rounded.toString().replace(/0+$/, ""), decpt };
}

/** `zend_dtoa(|x|, 0)` for a finite, non-zero `x`: the shortest round-trip digits and the decimal point position. */
function dtoaMode0(x: number): { digits: string; decpt: number } {
  const [mantissa, exponent] = Math.abs(x).toExponential().split("e") as [string, string];
  return { digits: mantissa.replace(".", ""), decpt: Number(exponent) + 1 };
}

/** `php_conv_fp` for `F` (`precision` digits after the point) and `e` / `E` (`precision + 1` significant digits). */
function convFp(format: "F" | "e" | "E", x: number, precision: number): string {
  if (format === "F") {
    if (x === 0) {
      return precision > 0 ? `0.${"0".repeat(precision)}` : "0";
    }
    const { digits, scale } = exactDecimal(x);
    const text = roundHalfEven(digits, scale - precision).toString().padStart(precision + 1, "0");
    const integer = text.slice(0, text.length - precision);
    return precision > 0 ? `${integer}.${text.slice(text.length - precision)}` : integer;
  }
  let digits: string;
  let decpt: number;
  if (x === 0) {
    digits = "0".repeat(precision + 1);
    decpt = 1;
  } else {
    const converted = dtoaMode2(x, precision + 1);
    digits = converted.digits.padEnd(precision + 1, "0");
    decpt = converted.decpt;
  }
  const exponent = decpt - 1;
  const mantissa = precision > 0 ? `${digits[0]}.${digits.slice(1)}` : digits[0]!;
  return `${mantissa}${format}${exponent < 0 ? "-" : "+"}${Math.abs(exponent)}`;
}

/** `zend_gcvt(value, ndigit, '.', exponent)`; `ndigit` -1 is mode 0 (17 digits for the exponent rule). */
function gcvt(x: number, ndigit: number, exponent: string): string {
  const mode0 = ndigit < 0;
  const limit = mode0 ? 17 : ndigit;
  const sign = x < 0 || Object.is(x, -0) ? "-" : "";
  let { digits, decpt } = x === 0 ? { digits: "0", decpt: 1 } : mode0 ? dtoaMode0(x) : dtoaMode2(x, ndigit);
  if ((decpt >= 0 && decpt > limit) || decpt < -3) {
    decpt--;
    const fraction = digits.length > 1 ? digits.slice(1) : "0";
    return `${sign}${digits[0]}.${fraction}${exponent}${decpt < 0 ? "-" : "+"}${Math.abs(decpt)}`;
  }
  if (decpt < 0) {
    return `${sign}0.${"0".repeat(-decpt)}${digits}`;
  }
  const integer = digits.length >= decpt ? digits.slice(0, decpt) : digits + "0".repeat(decpt - digits.length);
  const rest = digits.slice(decpt);
  if (rest === "") {
    return sign + integer;
  }
  return `${sign}${decpt === 0 ? "0" : integer}.${rest}`;
}

/** `php_sprintf_appenddouble`. */
function appendDouble(out: number[], number: number, width: number, padding: number, alignment: number, precision: number, adjust: number, fmt: string, alwaysSign: boolean): void {
  if ((adjust & ADJ_PRECISION) === 0) {
    precision = FLOAT_PRECISION;
  } else if (precision > MAX_FLOAT_PRECISION) {
    precision = MAX_FLOAT_PRECISION;
  }
  if (Number.isNaN(number)) {
    appendString(out, ascii("NaN"), 3, 0, padding, alignment, false, false, alwaysSign);
    return;
  }
  if (!Number.isFinite(number)) {
    const text = number < 0 ? "-INF" : "INF";
    appendString(out, ascii(text), text.length, 0, padding, alignment, number < 0, false, alwaysSign);
    return;
  }
  let text: string;
  let negative: boolean;
  if (fmt === "e" || fmt === "E" || fmt === "f" || fmt === "F") {
    negative = number < 0;
    text = convFp(fmt === "f" ? "F" : (fmt as "F" | "e" | "E"), Math.abs(number), precision);
    if (negative) {
      text = `-${text}`;
    } else if (alwaysSign) {
      text = `+${text}`;
    }
  } else {
    if (precision === 0) {
      precision = 1;
    }
    text = gcvt(number, precision, fmt === "G" || fmt === "H" ? "E" : "e");
    negative = text.startsWith("-");
    if (!negative && alwaysSign) {
      text = `+${text}`;
    }
  }
  appendString(out, ascii(text), width, 0, padding, alignment, negative, false, alwaysSign);
}

/**
 * PHP's `sprintf($format, ...$values)`: `format` with each `%` conversion replaced, as PHP 8.5's
 * `php_formatted_print` gives it: `%%`, and `%[argnum$][flags][width][.precision]specifier` with the flags `-`, `+`,
 * ` `, `0` and `'<char>`, a width or precision of `*` (PHP 8's argument form, an int), and the specifiers `b c d e E f
 * F g G h H o s u x X`. `%d` and the integer forms read a value as `(int)`, the float forms as `(float)`, `%s` as
 * `(string)`. Throws PHP's `ArgumentCountError` `N arguments are required, M given` when a conversion has no value,
 * PHP's `ValueError` for a bad specifier, argument number, width or precision, and PHP's `Error` for an object
 * without a `__toString` port under `%s`.
 */
export function sprintf(format: unknown, ...values: unknown[]): string {
  const formatString = stringParameter("sprintf", 1, "format", format);
  const cursor: Cursor = { bytes: bytesOf(formatString), pos: 0, len: 0 };
  cursor.len = cursor.bytes.length;
  const args = values.map((value) => value ?? null);
  const out: number[] = [];
  let currarg = 0;
  let maxMissing = -1;
  try {
    while (cursor.len > 0) {
      const next = cursor.bytes.indexOf(PERCENT, cursor.pos);
      if (next < 0 || next >= cursor.pos + cursor.len) {
        for (let index = 0; index < cursor.len; index++) {
          out.push(cursor.bytes[cursor.pos + index]!);
        }
        break;
      }
      for (; cursor.pos < next; advance(cursor)) {
        out.push(at(cursor));
      }
      advance(cursor);
      if (at(cursor) === PERCENT) {
        out.push(PERCENT);
        advance(cursor);
        continue;
      }
      let alignment = ALIGN_RIGHT;
      let adjusting = 0;
      let padding = 0x20;
      let alwaysSign = false;
      let expprec = false;
      let width = 0;
      let precision = 0;
      let argnum: number;
      let missing = false;
      if (isAlpha(at(cursor))) {
        argnum = ARG_NUM_NEXT;
      } else {
        argnum = getArgnum(cursor);
        for (;; advance(cursor)) {
          const c = at(cursor);
          if (c === 0x20 || c === 0x30) {
            padding = c;
          } else if (c === 0x2d) {
            alignment = ALIGN_LEFT;
          } else if (c === 0x2b) {
            alwaysSign = true;
          } else if (c === 0x27) {
            if (cursor.len > 1) {
              advance(cursor);
              padding = at(cursor);
            } else {
              throw new Fail(new ValueError("Missing padding character"));
            }
          } else {
            break;
          }
        }
        if (at(cursor) === 0x2a) {
          advance(cursor);
          let widthArgnum = getArgnum(cursor);
          if (widthArgnum === ARG_NUM_NEXT) {
            widthArgnum = currarg++;
          }
          if (widthArgnum >= args.length) {
            maxMissing = Math.max(maxMissing, widthArgnum);
            continue;
          }
          width = intOperand(args[widthArgnum], "Width must be an integer", 0, `Width must be between 0 and ${INT_MAX}`);
        } else if (isDigit(at(cursor))) {
          width = getNumber(cursor);
          if (width < 0) {
            throw new Fail(new ValueError(`Width must be between 0 and ${INT_MAX}`));
          }
        }
        if (at(cursor) === 0x2e) {
          advance(cursor);
          adjusting |= ADJ_PRECISION;
          if (at(cursor) === 0x2a) {
            advance(cursor);
            let precisionArgnum = getArgnum(cursor);
            if (precisionArgnum === ARG_NUM_NEXT) {
              precisionArgnum = currarg++;
            }
            if (precisionArgnum >= args.length) {
              maxMissing = Math.max(maxMissing, precisionArgnum);
              missing = true;
            } else {
              precision = intOperand(args[precisionArgnum], "Precision must be an integer", -1, `Precision must be between -1 and ${INT_MAX}`);
              expprec = true;
            }
          } else if (isDigit(at(cursor))) {
            precision = getNumber(cursor);
            if (precision < 0) {
              throw new Fail(new ValueError(`Precision must be between 0 and ${INT_MAX}`));
            }
            expprec = true;
          }
        }
      }
      if (missing) {
        continue;
      }
      if (at(cursor) === 0x6c) {
        advance(cursor);
      }
      if (argnum === ARG_NUM_NEXT) {
        argnum = currarg++;
      }
      if (argnum >= args.length) {
        maxMissing = Math.max(maxMissing, argnum);
        continue;
      }
      const specifier = at(cursor);
      if (expprec && precision === -1 && specifier !== 0x67 && specifier !== 0x47 && specifier !== 0x68 && specifier !== 0x48) {
        throw new Fail(new ValueError("Precision -1 is only supported for %g, %G, %h and %H"));
      }
      const arg = args[argnum];
      const fmt = String.fromCharCode(specifier);
      switch (fmt) {
        case "s":
          appendString(out, Array.from(bytesOf(toPhpString(arg))), width, precision, padding, alignment, false, expprec, false);
          break;
        case "d":
          appendInt(out, longOf(arg), width, padding, alignment, alwaysSign);
          break;
        case "u":
          appendUint(out, longOf(arg), width, padding, alignment);
          break;
        case "e":
        case "E":
        case "f":
        case "F":
        case "g":
        case "G":
        case "h":
        case "H":
          appendDouble(out, toFloat(arg), width, padding, alignment, precision, adjusting, fmt, alwaysSign);
          break;
        case "c":
          out.push(Number(BigInt.asUintN(8, longOf(arg))));
          break;
        case "o":
          append2n(out, longOf(arg), width, padding, alignment, 8, false, expprec);
          break;
        case "x":
          append2n(out, longOf(arg), width, padding, alignment, 16, false, expprec);
          break;
        case "X":
          append2n(out, longOf(arg), width, padding, alignment, 16, true, expprec);
          break;
        case "b":
          append2n(out, longOf(arg), width, padding, alignment, 2, false, expprec);
          break;
        case "%":
          out.push(PERCENT);
          break;
        default:
          if (specifier === 0 && cursor.len <= 0) {
            throw new Fail(new ValueError("Missing format specifier at end of string"));
          }
          throw new Fail(new ValueError(`Unknown format specifier "${unknownSpecifier(cursor)}"`));
      }
      advance(cursor);
    }
  } catch (error) {
    if (error instanceof Fail) {
      throw error.error;
    }
    throw error;
  }
  if (maxMissing >= 0) {
    throw new ArgumentCountError(`${maxMissing + 2} arguments are required, ${args.length + 1} given`);
  }
  try {
    return decoder.decode(Uint8Array.from(out));
  } catch {
    throw new TypeError("sprintf(): the result is not valid UTF-8, which JS cannot hold");
  }
}

/** The specifier byte PHP's message prints as `%c`: the whole UTF-8 character when it starts one, which JS can hold. */
function unknownSpecifier(cursor: Cursor): string {
  const c = at(cursor);
  if (c < 0x80) {
    return String.fromCharCode(c);
  }
  const length = c >= 0xf0 ? 4 : c >= 0xe0 ? 3 : 2;
  try {
    return decoder.decode(cursor.bytes.subarray(cursor.pos, cursor.pos + length));
  } catch {
    return "�";
  }
}

/** A `*` width or precision argument: a PHP int in `[min, INT_MAX]`, else PHP's `ValueError`. */
function intOperand(value: unknown, notInt: string, min: number, range: string): number {
  const isInt = (typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0)) || typeof value === "bigint";
  if (!isInt) {
    throw new Fail(new ValueError(notInt));
  }
  const number = BigInt(value as number | bigint);
  if (number < BigInt(min) || number > BigInt(INT_MAX)) {
    throw new Fail(new ValueError(range));
  }
  return Number(number);
}
