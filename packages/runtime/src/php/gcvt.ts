// PHP's `zend_gcvt` at `serialize_precision = -1` (Stories 9.7 and 9.8), shared by `phpSerialize` (`d:` floats, upper-case
// `E`) and `jsonEncode` (lower-case `e`). It imports nothing. The package does not export this module.

/**
 * A float as `zend_gcvt(x, 17, '.', exponent)` writes it over the shortest round-trip digits (`serialize_precision =
 * -1`): `d.dddE±x` when the decimal-point position is below -3 or above 17 (`.0` after a one-digit mantissa), else
 * positional; `INF`, `-INF`, `NAN`, and `-0` for -0.0.
 */
export function gcvt(x: number, exponent: "e" | "E"): string {
  if (Number.isNaN(x)) {
    return "NAN";
  }
  if (!Number.isFinite(x)) {
    return x > 0 ? "INF" : "-INF";
  }
  if (x === 0) {
    return Object.is(x, -0) ? "-0" : "0";
  }
  const sign = x < 0 ? "-" : "";
  // toExponential() without a fraction count gives the shortest digits that round-trip, as zend_dtoa mode 0 does.
  const [mantissa, exponentText] = Math.abs(x).toExponential().split("e") as [string, string];
  const digits = mantissa.replace(".", "");
  const power = Number(exponentText);
  // |x| = 0.d1d2… * 10^decpt.
  const decpt = power + 1;
  if (decpt < -3 || decpt > 17) {
    const fraction = digits.length > 1 ? digits.slice(1) : "0";
    return `${sign}${digits[0]}.${fraction}${exponent}${power < 0 ? "-" : "+"}${Math.abs(power)}`;
  }
  if (decpt <= 0) {
    return `${sign}0.${"0".repeat(-decpt)}${digits}`;
  }
  const integer = digits.length >= decpt ? digits.slice(0, decpt) : digits + "0".repeat(decpt - digits.length);
  const fraction = digits.slice(decpt);
  return fraction === "" ? `${sign}${integer}` : `${sign}${integer}.${fraction}`;
}
