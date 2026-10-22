// PHP's `(string)` of a float and the `__toString` port lookup (Story 9.6, moved here by Story 9.10): `formatFloat`
// and `stringPort`, shared by the casts, `looseEquals` and the PHP throwables' constructor coercions
// (`throwableArguments.ts`). It imports nothing, so an exception class may load it without an import cycle; `casts.ts`
// re-exports both. The package does not export this module.

/** The `toString` methods JS objects inherit, which are no `__toString` port. */
const INTRINSIC_TO_STRING: ReadonlySet<unknown> = new Set<unknown>(
  [Object, Function, Error, Array, Number, Boolean, String, Symbol, BigInt, Date, RegExp].map((intrinsic) => Reflect.get(intrinsic.prototype as object, "toString") as unknown),
);

/** The object's `__toString` port (a `toString()` method other than the ones JS objects inherit), or null. */
export function stringPort(o: object): (() => unknown) | null {
  const method: unknown = (o as { toString?: unknown }).toString;
  return typeof method === "function" && !INTRINSIC_TO_STRING.has(method) ? (method as () => unknown) : null;
}

/** The 14 significant decimal digits of a finite, nonzero `|x|`, rounded half-even from its exact binary value. */
function significantDigits(x: number): { digits: string; decpt: number } {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(x));
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
  // |x| = mantissa * 2^exponent = all * 10^power, exactly.
  const all = exponent >= 0 ? (mantissa << BigInt(exponent)).toString() : (mantissa * 5n ** BigInt(-exponent)).toString();
  const power = exponent >= 0 ? 0 : exponent;
  // The position of the decimal point: |x| = 0.d1d2… * 10^decpt.
  let decpt = all.length + power;
  let kept = all.slice(0, 14);
  if (all.length > 14) {
    const rest = all.slice(14);
    const first = rest.charCodeAt(0) - 48;
    const tie = first === 5 && /^0*$/.test(rest.slice(1));
    const up = first > 5 || (first === 5 && !tie) || (tie && (kept.charCodeAt(13) - 48) % 2 === 1);
    if (up) {
      kept = (BigInt(kept) + 1n).toString();
      if (kept.length > 14) {
        kept = kept.slice(0, 14);
        decpt++;
      }
    }
  }
  return { digits: kept.replace(/0+$/, ""), decpt };
}

/**
 * A float as PHP's `(string)` gives it (`zend_double_to_str` at `precision` = 14, `zend_gcvt`): 14 significant
 * digits rounded half-even, trailing zeros dropped, `d.dddE±x` when the exponent is below -4 or at least 14 (`.0`
 * when one digit), `INF`, `-INF`, `NAN`, and `-0` for -0.0.
 */
export function formatFloat(x: number): string {
  if (Number.isNaN(x)) {
    return "NAN";
  }
  if (!Number.isFinite(x)) {
    return x > 0 ? "INF" : "-INF";
  }
  const sign = x < 0 || Object.is(x, -0) ? "-" : "";
  if (x === 0) {
    return `${sign}0`;
  }
  const { digits, decpt } = significantDigits(x);
  if (decpt < 0 ? decpt < -3 : decpt > 14) {
    const exponent = decpt - 1;
    const fraction = digits.length > 1 ? digits.slice(1) : "0";
    return `${sign}${digits[0]}.${fraction}E${exponent < 0 ? "-" : "+"}${Math.abs(exponent)}`;
  }
  if (decpt <= 0) {
    return `${sign}0.${"0".repeat(-decpt)}${digits}`;
  }
  const integer = digits.length >= decpt ? digits.slice(0, decpt) : digits + "0".repeat(decpt - digits.length);
  const fraction = digits.slice(decpt);
  return fraction === "" ? `${sign}${integer}` : `${sign}${integer}.${fraction}`;
}
