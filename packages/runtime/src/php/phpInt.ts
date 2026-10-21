// PHP's int conversions over the AD-9.3 value model, shared by `PhpArray`'s key normalisation and the casts (one
// implementation; Story 9.6). An int is a safe-integer `number`, or a `bigint` beyond ±(2^53 − 1).

/** `PHP_INT_MAX`. */
export const INT_MAX = 9223372036854775807n;
/** `PHP_INT_MIN`. */
export const INT_MIN = -9223372036854775808n;

const SAFE_MAX = BigInt(Number.MAX_SAFE_INTEGER);
const SAFE_MIN = BigInt(Number.MIN_SAFE_INTEGER);
const TWO_64 = 1n << 64n;
const TWO_63 = 1n << 63n;

/** An int as AD-9.3 holds it: a `number` when safe, else a `bigint`. */
export function intKey(value: bigint): number | bigint {
  return value >= SAFE_MIN && value <= SAFE_MAX ? Number(value) : value;
}

/**
 * PHP's float to int conversion of `zend_dval_to_lval` (an array key, the `(int)` cast of a float): truncation, 0 for
 * a non-finite float, modulo 2^64 out of range.
 */
export function floatToInt(value: number): number | bigint {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const truncated = Math.trunc(value);
  if (Number.isSafeInteger(truncated)) {
    return truncated === 0 ? 0 : truncated;
  }
  let wrapped = BigInt(truncated) % TWO_64;
  if (wrapped < 0n) {
    wrapped += TWO_64;
  }
  return intKey(wrapped >= TWO_63 ? wrapped - TWO_64 : wrapped);
}

/**
 * PHP's `zend_dval_to_lval_cap`, the float to int conversion of a numeric string (`(int) "1e30"`): truncation, 0 for
 * a non-finite float, saturating at `PHP_INT_MAX` / `PHP_INT_MIN` out of range.
 */
export function capFloatToInt(value: number): number | bigint {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const truncated = Math.trunc(value);
  if (Number.isSafeInteger(truncated)) {
    return truncated === 0 ? 0 : truncated;
  }
  // 2^63 is the first double above PHP_INT_MAX; -2^63 is PHP_INT_MIN itself.
  if (truncated >= 2 ** 63) {
    return INT_MAX;
  }
  if (truncated <= -(2 ** 63)) {
    return INT_MIN;
  }
  return intKey(BigInt(truncated));
}
