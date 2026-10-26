// PHP's `range()` (ESC-14.1-6; action item epic-14-item-2-runtime-generators-functions), a port of PHP 8.5.11's
// `PHP_FUNCTION(range)` and `php_range_process_input` (`ext/standard/array.c`), PHP 8.3's rules: ints, floats,
// numeric strings and single-byte characters, with PHP's `ValueError` and `TypeError` messages, the two size-limit
// messages (`HT_MAX_SIZE` is 2^30) included. A float result is a `number`, marked `float()` when it is integral
// (AD-9.4). PHP's warnings (an empty string read as 0, a multi-byte string read by its first byte, a character mixed
// with a number) are not reproduced; PHP's value is. A character range holding a byte of 0x80 or more is no string
// JS can hold, and throws a JS `TypeError` naming that limit, as the codecs do.
import { LONE_SURROGATE, utf8 } from "./mangle";
import { parseNumeric } from "./numericString";
import { numberOrStringParameter, numberParameter } from "./phpArguments";
import { float, type PhpFloat } from "./PhpFloat";
import { floatToInt, INT_MIN, intKey } from "./phpInt";
import { ValueError } from "./ValueError";

/** `HT_MAX_SIZE` on a 64-bit build. */
const HT_MAX_SIZE = 0x40000000;
const TWO_64 = 1n << 64n;

/** How `php_range_process_input` reads an input: `IS_LONG`, `IS_DOUBLE`, `IS_STRING`, or `IS_ARRAY` (a digit). */
const InputType = { Long: 4, Double: 5, String: 6, Digit: 7 } as const;
type InputType = (typeof InputType)[keyof typeof InputType];

interface RangeInput {
  type: InputType;
  readonly long: bigint;
  readonly double: number;
  /** The string, for a string or a digit. */
  readonly string: string | null;
}

/** The UTF-8 bytes of `s`; a lone surrogate, which has no UTF-8 form, throws a JS `TypeError`. */
function bytesOf(s: string): Uint8Array {
  if (LONE_SURROGATE.test(s)) {
    throw new TypeError("range(): the string holds a lone surrogate, which has no UTF-8 form");
  }
  return utf8.encode(s);
}

/** The `ValueError` of argument `position` (`$name`) of `range()`. */
function argumentValueError(position: number, message: string): ValueError {
  const name = position === 1 ? "start" : position === 2 ? "end" : "step";
  return new ValueError(`range(): Argument #${position} ($${name}) ${message}`);
}

/** `check_dval_value`: a finite float, else PHP's `ValueError`. */
function finite(position: number, value: number): number {
  if (value === Infinity || value === -Infinity) {
    throw argumentValueError(position, "must be a finite number, INF provided");
  }
  if (Number.isNaN(value)) {
    throw argumentValueError(position, "must be a finite number, NAN provided");
  }
  return value;
}

/** `php_range_process_input`. */
function processInput(position: number, input: ReturnType<typeof numberOrStringParameter>): RangeInput {
  if ("int" in input) {
    const long = BigInt(input.int);
    return { type: InputType.Long, long, double: Number(long), string: null };
  }
  if ("float" in input) {
    return { type: InputType.Double, long: 0n, double: finite(position, input.float), string: null };
  }
  const string = input.string;
  if (string === "") {
    return { type: InputType.Long, long: 0n, double: 0, string: null };
  }
  const numeric = parseNumeric(string, false);
  if (numeric !== null) {
    if (numeric.int === null) {
      return { type: InputType.Double, long: 0n, double: finite(position, numeric.float), string: null };
    }
    const single = bytesOf(string).length === 1;
    return { type: single ? InputType.Digit : InputType.Long, long: numeric.int, double: Number(numeric.int), string };
  }
  return { type: InputType.String, long: 0n, double: 0, string };
}

/** A double as PHP's `%.<digits>f` prints it (`zend_dtoa` mode 3: correctly rounded, ties to even). */
function fixed(value: number, digits: number): string {
  if (Number.isNaN(value)) {
    return "NAN";
  }
  if (!Number.isFinite(value)) {
    return value > 0 ? "INF" : "-INF";
  }
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(value));
  const high = view.getUint32(0);
  const low = view.getUint32(4);
  const exponentBits = (high >>> 20) & 0x7ff;
  let mantissa = (BigInt(high & 0xfffff) << 32n) | BigInt(low);
  let exponent: number;
  if (exponentBits === 0) {
    exponent = -1074;
  } else {
    mantissa |= 1n << 52n;
    exponent = exponentBits - 1075;
  }
  // |value| * 10^digits = numerator / denominator, exactly.
  const scale = 10n ** BigInt(digits);
  const numerator = exponent >= 0 ? (mantissa << BigInt(exponent)) * scale : mantissa * scale;
  const denominator = exponent >= 0 ? 1n : 1n << BigInt(-exponent);
  let rounded = numerator / denominator;
  const remainder = (numerator % denominator) * 2n;
  if (remainder > denominator || (remainder === denominator && rounded % 2n === 1n)) {
    rounded += 1n;
  }
  const text = rounded.toString().padStart(digits + 1, "0");
  const sign = value < 0 || Object.is(value, -0) ? "-" : "";
  return digits === 0 ? `${sign}${text}` : `${sign}${text.slice(0, -digits)}.${text.slice(-digits)}`;
}

/** `RANGE_CHECK_DOUBLE_INIT_ARRAY(start, end, step)`: the element count, or PHP's size `ValueError`. */
function doubleSize(start: number, end: number, step: number): number {
  const size = (start - end) / step + 1;
  if (size >= HT_MAX_SIZE) {
    // PHP prints the macro's `end` as start and its `start` as end.
    throw new ValueError(
      `The supplied range exceeds the maximum array size by ${fixed(size - HT_MAX_SIZE, 1)} elements: start=${fixed(end, 1)}, end=${fixed(start, 1)}, step=${fixed(step, 1)}. Max size: ${fixed(HT_MAX_SIZE, 0)}`,
    );
  }
  // _php_math_round(size, 0, PHP_ROUND_HALF_UP) of a size of at least 1.
  return Math.floor(size + 0.5);
}

/** `RANGE_CHECK_LONG_INIT_ARRAY(start, end, step)`: the element count, or PHP's size `ValueError`. */
function longSize(start: bigint, end: bigint, step: bigint): number {
  const size = (((start - end) % TWO_64) + TWO_64) % TWO_64 / step;
  if (size >= BigInt(HT_MAX_SIZE - 1)) {
    throw new ValueError(
      `The supplied range exceeds the maximum array size by ${size - BigInt(HT_MAX_SIZE - 1)} elements: start=${end}, end=${start}, step=${step}. Calculated size: ${size}. Maximum size: ${HT_MAX_SIZE}.`,
    );
  }
  return Number(size) + 1;
}

function boundaryError(): ValueError {
  return argumentValueError(3, "must be less than the range spanned by argument #1 ($start) and argument #2 ($end)");
}

function negativeStepError(): ValueError {
  return argumentValueError(3, "must be greater than 0 for increasing ranges");
}

/** A float element: a `number`, marked `float()` when integral. */
function floatElement(value: number): number | PhpFloat {
  return Number.isInteger(value) ? float(value) : value;
}

/** A one-byte string; a byte of 0x80 or more is no string JS can hold. */
function character(byte: number): string {
  if (byte >= 0x80) {
    throw new TypeError(`range(): the character range holds the byte 0x${byte.toString(16).toUpperCase()}, which is no UTF-8 string JS can hold`);
  }
  return String.fromCharCode(byte);
}

/**
 * PHP's `range($start, $end, $step = 1)`: the list from `start` to `end` inclusive, stepping by `|step|`. Two ints
 * give ints; a float (or a fractional step) gives floats; a numeric string is its number; two strings, one of which is
 * not a single digit, give the single-byte characters between their first bytes (two single digits too); a string
 * mixed with a number reads as 0 (a digit as its value); `""`, null and false read as 0, true as 1. Throws PHP's
 * `ValueError` for a zero, `PHP_INT_MIN`, non-finite or too large step, a negative step on an increasing range, a
 * non-finite bound and a range beyond PHP's maximum array size, and PHP's `TypeError` for an argument of another type.
 */
export function range(start: unknown, end: unknown, step?: unknown): unknown[] {
  const userStart = numberOrStringParameter("range", 1, "start", start);
  const userEnd = numberOrStringParameter("range", 2, "end", end);
  let isStepDouble = false;
  let isStepNegative = false;
  let stepDouble = 1;
  let stepLong = 1n;
  if (step !== undefined) {
    const userStep = numberParameter("range", 3, "step", step);
    if ("float" in userStep) {
      stepDouble = finite(3, userStep.float);
      if (stepDouble < 0) {
        isStepNegative = true;
        stepDouble *= -1;
      }
      stepLong = BigInt(floatToInt(stepDouble));
      if (Number(stepLong) !== stepDouble) {
        isStepDouble = true;
      }
    } else {
      stepLong = BigInt(userStep.int);
      if (stepLong < 0n) {
        if (stepLong === INT_MIN) {
          throw argumentValueError(3, `must be greater than ${INT_MIN}`);
        }
        isStepNegative = true;
        stepLong = -stepLong;
      }
      stepDouble = Number(stepLong);
    }
    if (stepDouble === 0) {
      throw argumentValueError(3, "cannot be 0");
    }
  }

  const first = processInput(1, userStart);
  const last = processInput(2, userEnd);

  numeric: if (first.type >= InputType.String || last.type >= InputType.String) {
    if (first.type < InputType.String || last.type < InputType.String) {
      if (first.type < InputType.String) {
        last.type = InputType.Long;
      } else {
        first.type = InputType.Long;
      }
      break numeric;
    }
    if (isStepDouble) {
      first.type = InputType.Long;
      last.type = InputType.Long;
      break numeric;
    }
    return characters(bytesOf(first.string!)[0]!, bytesOf(last.string!)[0]!, stepLong, isStepNegative);
  }

  if (first.type === InputType.Double || last.type === InputType.Double || isStepDouble) {
    const from = first.double;
    const to = last.double;
    const result: unknown[] = [];
    if (from > to) {
      if (from - to < stepDouble) {
        throw boundaryError();
      }
      const size = doubleSize(from, to, stepDouble);
      for (let i = 0, element = from; i < size && element >= to; ++i, element = from - i * stepDouble) {
        result.push(floatElement(element));
      }
    } else if (to > from) {
      if (isStepNegative) {
        throw negativeStepError();
      }
      if (to - from < stepDouble) {
        throw boundaryError();
      }
      const size = doubleSize(to, from, stepDouble);
      for (let i = 0, element = from; i < size && element <= to; ++i, element = from + i * stepDouble) {
        result.push(floatElement(element));
      }
    } else {
      result.push(floatElement(from));
    }
    return result;
  }

  const from = first.long;
  const to = last.long;
  const result: unknown[] = [];
  if (from > to) {
    if (from - to < stepLong) {
      throw boundaryError();
    }
    const size = longSize(from, to, stepLong);
    for (let i = 0n; i < BigInt(size); i++) {
      result.push(intKey(from - i * stepLong));
    }
  } else if (to > from) {
    if (isStepNegative) {
      throw negativeStepError();
    }
    if (to - from < stepLong) {
      throw boundaryError();
    }
    const size = longSize(to, from, stepLong);
    for (let i = 0n; i < BigInt(size); i++) {
      result.push(intKey(from + i * stepLong));
    }
  } else {
    result.push(intKey(from));
  }
  return result;
}

/** The character form of `range()`, between the bytes `low` and `high`. */
function characters(low: number, high: number, step: bigint, isStepNegative: boolean): string[] {
  const result: string[] = [];
  if (low > high) {
    if (BigInt(low - high) < step) {
      throw boundaryError();
    }
    const by = Number(step);
    for (let byte = low; byte >= high; byte -= by) {
      result.push(character(byte));
      if (byte - by < 0) {
        break;
      }
    }
  } else if (high > low) {
    if (isStepNegative) {
      throw negativeStepError();
    }
    if (BigInt(high - low) < step) {
      throw boundaryError();
    }
    const by = Number(step);
    for (let byte = low; byte <= high; byte += by) {
      result.push(character(byte));
      if (byte + by > 255) {
        break;
      }
    }
  } else {
    result.push(character(low));
  }
  return result;
}
