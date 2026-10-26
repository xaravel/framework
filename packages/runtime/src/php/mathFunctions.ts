// PHP's math functions the Collections core calls (action item epic-14-item-3-runtime-type-tests-functions,
// ESC-14.1-9), under their PHP names, ports of PHP 8.5.11's `ext/standard/math.c` in coercive typing mode: `abs`.
import { numberParameter } from "./phpArguments";
import { float, type PhpFloat } from "./PhpFloat";
import { INT_MIN, intKey } from "./phpInt";

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
