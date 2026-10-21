// PHP's scalar casts over the AD-9 value model (Story 9.6): `(int)`, `(float)`, `(string)` and `(bool)` as PHP 8.5's
// `zval_get_long`, `zval_get_double`, `zval_get_string` and `zend_is_true` give them. The internal `phpType`,
// `isTrue`, `formatFloat` and `arrayEntries` are shared with `spaceship` and `valueCopy`.
//
// Value model (AD-9): `undefined` reads as `null`; an int is a safe-integer `number` (not `-0`) or a `bigint` in the
// int64 range; a float is any other `number` or a marked `PhpFloat`; a PHP array is an `Array`, a plain object
// (prototype `Object.prototype` or `null`) or a value branded `Symbol.for('xaravel.php.array')`, read through its
// `[key, value]` iterator; any other object or a function is a PHP object. PHP's warnings and notices
// (`Array to string conversion`, `Object of class X could not be converted to int`) are not reproduced: PHP still
// returns the value, and so do the casts.
import { fqcn } from "../registry/registry";
import { parseNumeric } from "./isNumeric";
import { normalizeKey, type PhpArrayKey } from "./PhpArray";
import { capFloatToInt, floatToInt, INT_MAX, INT_MIN, intKey } from "./phpInt";

const PHP_ARRAY = Symbol.for("xaravel.php.array");
const PHP_FLOAT = Symbol.for("xaravel.php.float");

/** A PHP type, as `phpType` reads it from a JS value. */
export type PhpType = "null" | "bool" | "int" | "float" | "string" | "array" | "object";

/** The `toString` methods JS objects inherit, which are no `__toString` port. */
const INTRINSIC_TO_STRING: ReadonlySet<unknown> = new Set<unknown>(
  [Object, Function, Error, Array, Number, Boolean, String, Symbol, BigInt, Date, RegExp].map((intrinsic) => Reflect.get(intrinsic.prototype as object, "toString") as unknown),
);

/**
 * The PHP type of `v`. Throws a `TypeError` for a `bigint` outside the int64 range, which is no PHP int, and for a
 * symbol, which has no PHP counterpart.
 */
export function phpType(v: unknown): PhpType {
  switch (typeof v) {
    case "undefined":
      return "null";
    case "boolean":
      return "bool";
    case "number":
      return Number.isSafeInteger(v) && !Object.is(v, -0) ? "int" : "float";
    case "bigint":
      if (v < INT_MIN || v > INT_MAX) {
        throw new TypeError(`The bigint ${v} is outside the int64 range and no PHP int`);
      }
      return "int";
    case "string":
      return "string";
    case "function":
      return "object";
    case "symbol":
      throw new TypeError("A symbol is no PHP value");
    default:
      break;
  }
  if (v === null) {
    return "null";
  }
  const record = v as Record<symbol, unknown>;
  if (record[PHP_FLOAT] === true) {
    return "float";
  }
  if (Array.isArray(v) || record[PHP_ARRAY] === true) {
    return "array";
  }
  const prototype: unknown = Object.getPrototypeOf(v);
  return prototype === Object.prototype || prototype === null ? "array" : "object";
}

/** The `[key, value]` pairs of a PHP array (see `phpType`), in PHP order; `undefined` values read as `null`. */
export function arrayEntries(v: object): [PhpArrayKey, unknown][] {
  if (Array.isArray(v)) {
    const entries: [PhpArrayKey, unknown][] = [];
    for (let index = 0; index < v.length; index++) {
      entries.push([index, (v[index] as unknown) ?? null]);
    }
    return entries;
  }
  if ((v as Record<symbol, unknown>)[PHP_ARRAY] === true) {
    return [...(v as Iterable<readonly [PhpArrayKey, unknown]>)].map(([key, value]) => [key, value ?? null]);
  }
  return Object.keys(v).map((key) => [normalizeKey(key), ((v as Record<string, unknown>)[key] as unknown) ?? null]);
}

/** The number of entries of a PHP array (`count($a)`). */
export function arrayCount(v: object): number {
  if (Array.isArray(v)) {
    return v.length;
  }
  if ((v as Record<symbol, unknown>)[PHP_ARRAY] === true) {
    const size: unknown = (v as { size?: unknown }).size;
    if (typeof size === "number") {
      return size;
    }
    let count = 0;
    for (const _ of v as Iterable<unknown>) {
      count++;
    }
    return count;
  }
  return Object.keys(v).length;
}

/** The value of a PHP float (a `number`, or a marked `PhpFloat` unwrapped). */
export function floatValue(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

/** The object's `__toString` port (a `toString()` method other than the ones JS objects inherit), or null. */
export function stringPort(o: object): (() => unknown) | null {
  const method: unknown = (o as { toString?: unknown }).toString;
  return typeof method === "function" && !INTRINSIC_TO_STRING.has(method) ? (method as () => unknown) : null;
}

/** The class name PHP's messages give an object: its Registry FQCN, `Closure` for a function, else `object`. */
export function className(o: object): string {
  if (typeof o === "function") {
    return "Closure";
  }
  try {
    return fqcn(o);
  } catch {
    return "object";
  }
}

/** PHP's `zend_is_true`. */
export function isTrue(v: unknown): boolean {
  switch (phpType(v)) {
    case "null":
      return false;
    case "bool":
      return v as boolean;
    case "int":
      return v !== 0 && v !== 0n;
    case "float":
      // NAN is true, -0.0 is false.
      return floatValue(v) !== 0;
    case "string":
      return v !== "" && v !== "0";
    case "array":
      return arrayCount(v as object) > 0;
    default:
      return true;
  }
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

/**
 * PHP's `(int) $v`: null and false 0, true 1; an int as it is; a float truncated, modulo 2^64 out of range and 0
 * when non-finite; a string's leading numeric prefix (0 when none), a float prefix saturating at `PHP_INT_MAX` /
 * `PHP_INT_MIN`; an array 0 when empty, else 1; an object 1. An int beyond ±(2^53 − 1) is a `bigint` (AD-9.3).
 */
export function toInt(v: unknown): number | bigint {
  switch (phpType(v)) {
    case "null":
      return 0;
    case "bool":
      return v === true ? 1 : 0;
    case "int":
      return typeof v === "bigint" ? intKey(v) : (v as number);
    case "float":
      return floatToInt(floatValue(v));
    case "string": {
      const numeric = parseNumeric(v as string, true);
      if (numeric === null) {
        return 0;
      }
      return numeric.int !== null ? intKey(numeric.int) : capFloatToInt(numeric.float);
    }
    case "array":
      return arrayCount(v as object) > 0 ? 1 : 0;
    default:
      return 1;
  }
}

/**
 * PHP's `(float) $v`, as a plain `number` (AD-9.4: mark it with `float()` where the int/float distinction matters):
 * null and false 0, true 1; an int converted; a float as it is; a string's leading numeric prefix (0 when none); an
 * array 0 when empty, else 1; an object 1.
 */
export function toFloat(v: unknown): number {
  switch (phpType(v)) {
    case "null":
      return 0;
    case "bool":
      return v === true ? 1 : 0;
    case "int":
      return Number(v);
    case "float":
      return floatValue(v);
    case "string":
      return parseNumeric(v as string, true)?.float ?? 0;
    case "array":
      return arrayCount(v as object) > 0 ? 1 : 0;
    default:
      return 1;
  }
}

/**
 * PHP's `(string) $v`: null and false `""`, true `"1"`; an int in decimal; a float as `formatFloat` gives it; an array
 * `"Array"`; an object through its `toString()` port (its `__toString`). Throws PHP's `Error`
 * `Object of class <FQCN> could not be converted to string` for an object without one.
 */
export function toPhpString(v: unknown): string {
  switch (phpType(v)) {
    case "null":
      return "";
    case "bool":
      return v === true ? "1" : "";
    case "int":
      return String(v);
    case "float":
      return formatFloat(floatValue(v));
    case "string":
      return v as string;
    case "array":
      return "Array";
    default:
      break;
  }
  const object = v as object;
  const port = stringPort(object);
  if (port === null) {
    throw new Error(`Object of class ${className(object)} could not be converted to string`);
  }
  const result: unknown = port.call(object);
  if (typeof result !== "string") {
    throw new TypeError(`${className(object)}::__toString(): Return value must be of type string, ${phpType(result)} returned`);
  }
  return result;
}

/** PHP's `(bool) $v` (`zend_is_true`): false for null, false, 0, 0.0, -0.0, `""`, `"0"` and an empty array. */
export function toBool(v: unknown): boolean {
  return isTrue(v);
}
