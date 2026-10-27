// PHP's math functions the Collections core calls (action item epic-14-item-3-runtime-type-tests-functions,
// ESC-14.1-9), under their PHP names, ports of PHP 8.5.11's `ext/standard/math.c` in coercive typing mode: `abs`, and
// (action item epic-14-item-8-runtime-round-string-array-pointer, ESC-14.3-1) `round` with the `PHP_ROUND_*`
// constants and the `RoundingMode` enum as its `mode` (`PHP_FUNCTION(round)`, `_php_math_round`, `php_round_helper`,
// `php_math_round_mode_from_enum`, `php_intpow10`).
import { argumentTypeError, intParameter, numberParameter } from "./phpArguments";
import { float, type PhpFloat } from "./PhpFloat";
import { INT_MIN, intKey } from "./phpInt";
import { RoundingMode } from "./RoundingMode";
import { toIntArgument } from "./throwableArguments";
import { ValueError } from "./ValueError";

/** A float result: a `number`, marked `float()` when it is integral (AD-9.4). */
function floatResult(value: number): number | PhpFloat {
  return Number.isInteger(value) ? float(value) : value;
}

/**
 * PHP's `abs($num)`: the absolute value of an int or a float, a numeric string read as its number. An int stays an
 * int, except `PHP_INT_MIN`, whose absolute value is no int and is a float; a float result is a `number`, marked
 * `float()` when integral (`abs(-0.0)` is `float(0)`). Throws PHP's `TypeError` `abs(): Argument #1 ($num) must be of
 * type int|float, <type> given` for any other value.
 */
export function abs(num: unknown): number | bigint | PhpFloat {
  const value = numberParameter("abs", 1, "num", num);
  if ("float" in value) {
    return floatResult(Math.abs(value.float));
  }
  const int = BigInt(value.int);
  if (int === INT_MIN) {
    return float(-Number(INT_MIN));
  }
  return intKey(int < 0n ? -int : int);
}

/** `PHP_ROUND_HALF_UP`: halves away from zero (`RoundingMode::HalfAwayFromZero`). */
export const PHP_ROUND_HALF_UP = 1;
/** `PHP_ROUND_HALF_DOWN`: halves towards zero (`RoundingMode::HalfTowardsZero`). */
export const PHP_ROUND_HALF_DOWN = 2;
/** `PHP_ROUND_HALF_EVEN`: halves to the even neighbour (`RoundingMode::HalfEven`). */
export const PHP_ROUND_HALF_EVEN = 3;
/** `PHP_ROUND_HALF_ODD`: halves to the odd neighbour (`RoundingMode::HalfOdd`). */
export const PHP_ROUND_HALF_ODD = 4;

/**
 * PHP's internal modes with no PHP constant (`ext/standard/php_math_round_mode.h`): `PHP_ROUND_CEILING` (5),
 * `PHP_ROUND_FLOOR` (6), `PHP_ROUND_TOWARD_ZERO` (7) and `PHP_ROUND_AWAY_FROM_ZERO` (8).
 */
const ROUND_CEILING = 5;
const ROUND_FLOOR = 6;
const ROUND_TOWARD_ZERO = 7;
const ROUND_AWAY_FROM_ZERO = 8;

/** C's `INT_MAX` and `INT_MIN`, the range of `round`'s `places`. */
const C_INT_MAX = 2147483647;
const C_INT_MIN = -2147483648;

/** `php_math_round_mode_from_enum`: the mode of each `RoundingMode` case. */
const ENUM_MODES: ReadonlyMap<RoundingMode, number> = new Map([
  [RoundingMode.HalfAwayFromZero, PHP_ROUND_HALF_UP],
  [RoundingMode.HalfTowardsZero, PHP_ROUND_HALF_DOWN],
  [RoundingMode.HalfEven, PHP_ROUND_HALF_EVEN],
  [RoundingMode.HalfOdd, PHP_ROUND_HALF_ODD],
  [RoundingMode.TowardsZero, ROUND_TOWARD_ZERO],
  [RoundingMode.AwayFromZero, ROUND_AWAY_FROM_ZERO],
  [RoundingMode.NegativeInfinity, ROUND_FLOOR],
  [RoundingMode.PositiveInfinity, ROUND_CEILING],
]);

/** The exact powers of ten `php_intpow10` reads from its table. */
const POWERS_OF_TEN = [1e0, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15, 1e16, 1e17, 1e18, 1e19, 1e20, 1e21, 1e22];

/** `php_intpow10(power)` for `power >= 0`: the table up to 22, else the correctly rounded `10^power`. */
function intpow10(power: number): number {
  return power <= 22 ? POWERS_OF_TEN[power]! : Number(`1e${power}`);
}

/** C's `copysign(magnitude, sign)`: `-0` counts as negative. */
function copysign(magnitude: number, sign: number): number {
  return sign < 0 || Object.is(sign, -0) ? -magnitude : magnitude;
}

/** `php_round_get_basic_edge_case`. */
function basicEdgeCase(integral: number, exponent: number, places: number): number {
  return places > 0 ? Math.abs((integral + copysign(0.5, integral)) / exponent) : Math.abs((integral + copysign(0.5, integral)) * exponent);
}

/** `php_round_get_zero_edge_case`. */
function zeroEdgeCase(integral: number, exponent: number, places: number): number {
  return places > 0 ? Math.abs(integral / exponent) : Math.abs(integral * exponent);
}

/** `php_round_helper`: `integral`, the truncated scaled value, rounded in `mode`. */
function roundHelper(integral: number, value: number, exponent: number, places: number, mode: number): number {
  const valueAbs = Math.abs(value);
  switch (mode) {
    case PHP_ROUND_HALF_UP:
      return valueAbs >= basicEdgeCase(integral, exponent, places) ? integral + copysign(1, integral) : integral;
    case PHP_ROUND_HALF_DOWN:
      return valueAbs > basicEdgeCase(integral, exponent, places) ? integral + copysign(1, integral) : integral;
    case ROUND_CEILING:
      return value > 0 && valueAbs > zeroEdgeCase(integral, exponent, places) ? integral + 1 : integral;
    case ROUND_FLOOR:
      return value < 0 && valueAbs > zeroEdgeCase(integral, exponent, places) ? integral - 1 : integral;
    case ROUND_TOWARD_ZERO:
      return integral;
    case ROUND_AWAY_FROM_ZERO:
      return valueAbs > zeroEdgeCase(integral, exponent, places) ? integral + copysign(1, integral) : integral;
    case PHP_ROUND_HALF_EVEN:
    case PHP_ROUND_HALF_ODD: {
      const edge = basicEdgeCase(integral, exponent, places);
      if (valueAbs > edge) {
        return integral + copysign(1, integral);
      }
      if (valueAbs === edge && (integral % 2 === 0) === (mode === PHP_ROUND_HALF_ODD)) {
        return integral + copysign(1, integral);
      }
      return integral;
    }
    default:
      throw new globalThis.Error(`round(): unknown mode ${mode}`);
  }
}

/** `_php_math_round(value, places, mode)`. */
function mathRound(value: number, places: number, mode: number): number {
  if (!Number.isFinite(value) || value === 0) {
    return value;
  }
  if (places === 0 && value === Math.trunc(value)) {
    return value;
  }
  const clamped = places < C_INT_MIN + 1 ? C_INT_MIN + 1 : places;
  const exponent = intpow10(Math.abs(clamped));
  let tmp: number;
  let tmp2: number;
  if (value >= 0) {
    tmp = Math.floor(clamped > 0 ? value * exponent : value / exponent);
    tmp2 = tmp + 1;
  } else {
    tmp = Math.ceil(clamped > 0 ? value * exponent : value / exponent);
    tmp2 = tmp - 1;
  }
  if ((clamped > 0 ? tmp2 / exponent : tmp2 * exponent) === value) {
    tmp = tmp2;
  }
  // Beyond the double's precision, so rounding is pointless.
  if (Math.abs(tmp) >= 1e16) {
    return value;
  }
  tmp = roundHelper(tmp, value, exponent, clamped, mode);
  if (Math.abs(clamped) < 23) {
    return clamped > 0 ? tmp / exponent : tmp * exponent;
  }
  // PHP's `snprintf(buf, 39, "%15fe%d", tmp, -places)` read back by `zend_strtod`, a correctly rounded parse; the
  // leading padding is whitespace both skip. PHP's own `snprintf` (`php_conv_fp`) writes no sign for -0, so a -0 here
  // reads back as 0 (`round(-1.5, -30)` is `0.0`).
  const text = `${tmp < 0 ? "-" : ""}${Math.abs(tmp).toFixed(6)}e${-clamped}`;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : value;
}

/**
 * PHP's `round($num, $precision = 0, $mode = PHP_ROUND_HALF_UP)`: `num` (`int|float`, a numeric string its number,
 * `null` and `false` 0, `true` 1) rounded to `precision` decimal digits (an `int`; negative rounds to tens, hundreds,
 * …), by PHP 8.5's `_php_math_round`. `mode` is a `RoundingMode` case or an int: 1 to 4 the `PHP_ROUND_*` constants, 5
 * to 8 PHP's internal ceiling, floor, toward-zero and away-from-zero. The result is always a float: a `number`, marked
 * `float()` when integral (`round(75.0, 2)` is `float(75)`, `-0` kept). Throws PHP's `TypeError` for an argument of
 * another type (`round(): Argument #3 ($mode) must be of type RoundingMode|int, string given`) and PHP's `ValueError`
 * `round(): Argument #3 ($mode) must be a valid rounding mode (RoundingMode::*)` for an int outside 1 to 8.
 */
export function round(num: unknown, precision: unknown = 0, mode: unknown = PHP_ROUND_HALF_UP): number | PhpFloat {
  const value = numberParameter("round", 1, "num", num);
  const wide = BigInt(intParameter("round", 2, "precision", precision));
  const places = wide > BigInt(C_INT_MAX) ? C_INT_MAX : wide < BigInt(C_INT_MIN) ? C_INT_MIN : Number(wide);
  let roundingMode: number;
  if (mode instanceof RoundingMode) {
    roundingMode = ENUM_MODES.get(mode) ?? 0;
  } else {
    const int = toIntArgument(mode);
    if (int === null) {
      throw argumentTypeError("round", 3, "mode", "RoundingMode|int", mode);
    }
    roundingMode = int >= 1 && int <= 8 ? Number(int) : 0;
  }
  if (roundingMode === 0) {
    throw new ValueError("round(): Argument #3 ($mode) must be a valid rounding mode (RoundingMode::*)");
  }
  if ("int" in value) {
    const asFloat = Number(value.int);
    return floatResult(places >= 0 ? asFloat : mathRound(asFloat, places, roundingMode));
  }
  return floatResult(mathRound(value.float, places, roundingMode));
}
