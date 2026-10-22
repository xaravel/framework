// PHP value predicates and conversions over the AD-9 value model (Story 4.3; FR-116).
//
// Internal to the grader: the comparators, the exporter and the assertions read
// values only through these helpers and PhpComparison's, so every module agrees
// on what a PHP int, float, array, object, resource or callable is.
//
//   - int: a `bigint`, or a safe-integer `number`, `-0` included (DIV-9: an unmarked integral float reads as an int);
//   - float: any other `number` (fractional, NAN, INF, or beyond the safe range), and a value carrying the runtime's
//     float marker (a non-null object whose `[Symbol.for('xaravel.php.float')]` is `true`, read by brand only, never
//     imported: AD-2, DIV-9.4), whose value is `Number(v)` whatever it is (Story 9.11, ESC-4.1-1, ESC-9.11-2). Only
//     the marker makes an integral number a float: an unmarked `-0` is the int `0` for every reader and printer
//     here, unlike the runtime's `isFloat(-0)`;
//   - array: a list, a plain object or a `Symbol.for('xaravel.php.array')` value (PhpComparison);
//   - resource: an object branded `Symbol.for('xaravel.php.resource')`, whose value is its type;
//   - object: any other object, and a function (a PHP Closure);
//   - Countable: an object branded `Symbol.for('Countable')` with a `count()` method;
//   - Traversable: an object (not an array) with `[Symbol.iterator]`, iterating its values;
//   - ArrayAccess: an object branded `Symbol.for('ArrayAccess')` with an `offsetExists()` method.
import { arrayEntries, isBuiltIn, isPhpArray, numericValue } from "./PhpComparison";

export const PHP_RESOURCE = Symbol.for("xaravel.php.resource");
export const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
export const PHP_FLOAT = Symbol.for("xaravel.php.float");
const COUNTABLE = Symbol.for("Countable");
const ARRAY_ACCESS = Symbol.for("ArrayAccess");

/** A value carrying the runtime's float marker (Story 9.5): a non-null object whose float brand is `true`. */
export function isMarkedFloat(value: unknown): value is object {
  return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[PHP_FLOAT] === true;
}

/** A marked float as the plain `number` it stands for; any other value as it is. */
export function unmarkFloat(value: unknown): unknown {
  return isMarkedFloat(value) ? Number(value) : value;
}

/**
 * The PHP type of a number (ESC-9.11-2): `"int"` for a `bigint` and for a safe-integer `number` (`-0` included),
 * `"float"` for any other `number` and for a marked float whatever its value; null for a value that is not a number.
 */
export function phpNumberType(value: unknown): "int" | "float" | null {
  switch (typeof value) {
    case "bigint":
      return "int";
    case "number":
      return Number.isSafeInteger(value) ? "int" : "float";
    default:
      return isMarkedFloat(value) ? "float" : null;
  }
}

/** A PHP int: a `bigint`, or an unmarked safe-integer `number` (DIV-9). */
export function isInt(value: unknown): value is number | bigint {
  return phpNumberType(value) === "int";
}

/** A PHP float: a `number` that is not an int, or a marked float (read its value with `toNumber`). */
export function isFloat(value: unknown): boolean {
  return phpNumberType(value) === "float";
}

export function isResource(value: unknown): value is object {
  return typeof value === "object" && value !== null && PHP_RESOURCE in value;
}

/** The type of a resource: the brand's value when it is a string. */
export function resourceType(value: object): string {
  const type: unknown = (value as Record<symbol, unknown>)[PHP_RESOURCE];
  return typeof type === "string" ? type : "Unknown";
}

/** `is_object`: a function (Closure) or an object that is neither a PHP array nor a resource. */
export function isPhpObject(value: unknown): value is object {
  if (typeof value === "function") {
    return true;
  }
  return typeof value === "object" && value !== null && !isPhpArray(value) && !isResource(value) && !isMarkedFloat(value);
}

/** `is_scalar`. */
export function isScalar(value: unknown): boolean {
  return typeof value === "boolean" || typeof value === "string" || phpNumberType(value) !== null;
}

/** `gettype`. */
export function gettype(value: unknown): string {
  if (value === null) {
    return "NULL";
  }
  switch (typeof value) {
    case "boolean":
      return "boolean";
    case "bigint":
      return "integer";
    case "number":
      return isInt(value) ? "integer" : "double";
    case "string":
      return "string";
    case "function":
      return "object";
    case "object":
      if (isMarkedFloat(value)) {
        return "double";
      }
      if (isResource(value)) {
        return "resource";
      }
      return isPhpArray(value) ? "array" : "object";
    default:
      return "unknown type";
  }
}

/** `is_numeric`. */
export function isNumeric(value: unknown): boolean {
  if (phpNumberType(value) !== null) {
    return true;
  }
  return typeof value === "string" && numericValue(value) !== null;
}

/** A numeric value as a JS number: a number, a marked float, a bigint or a numeric string. */
export function toNumber(value: unknown): number {
  if (isMarkedFloat(value)) {
    return Number(value);
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    const parsed = numericValue(value);
    if (parsed !== null) {
      return Number(parsed.value);
    }
  }
  return Number.NaN;
}

/** The PHP class name of an object (ESC-4.3-1 item 1): its FQCN brand, else its constructor's name, for display only (AD-10). */
export function classNameOf(value: object): string {
  if (typeof value === "function") {
    return "Closure";
  }
  const own: unknown = (value as Record<symbol, unknown>)[CLASS_FQCN];
  if (typeof own === "string") {
    return own;
  }
  const prototype = Object.getPrototypeOf(value) as { constructor?: unknown } | null;
  const constructor: unknown = prototype === null ? null : prototype.constructor;
  if (typeof constructor === "function") {
    return classNameOfClass(constructor);
  }
  return "stdClass";
}

/** The PHP name of a class or interface token: its FQCN brand, else its `name`; `Object` is `stdClass`. */
export function classNameOfClass(type: unknown): string {
  if (type === Object) {
    return "stdClass";
  }
  if ((typeof type === "function" || (typeof type === "object" && type !== null)) && typeof (type as Record<symbol, unknown>)[CLASS_FQCN] === "string") {
    return (type as Record<symbol, string>)[CLASS_FQCN];
  }
  if (typeof type === "function" && type.name !== "") {
    return type.name;
  }
  return "class@anonymous";
}

/** Whether two PHP objects have the same class: the same prototype, or both functions (Closure). */
export function sameClass(a: object, b: object): boolean {
  if (typeof a === "function" || typeof b === "function") {
    return typeof a === "function" && typeof b === "function";
  }
  return Object.getPrototypeOf(a) === Object.getPrototypeOf(b);
}

export function isCountable(value: unknown): boolean {
  if (isPhpArray(value)) {
    return true;
  }
  return isPhpObject(value) && COUNTABLE in value && typeof (value as { count?: unknown }).count === "function";
}

export function isTraversable(value: unknown): value is Iterable<unknown> & object {
  return isPhpObject(value) && typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function";
}

/** `is_iterable`. */
export function isIterable(value: unknown): boolean {
  return isPhpArray(value) || isTraversable(value);
}

export function isArrayAccess(value: unknown): boolean {
  return isPhpObject(value) && ARRAY_ACCESS in value && typeof (value as { offsetExists?: unknown }).offsetExists === "function";
}

/** The values of an iterable (a PHP array or a Traversable), in order. */
export function iterableValues(value: unknown): unknown[] {
  if (isPhpArray(value)) {
    return arrayEntries(value).map(([, item]) => item);
  }
  if (isTraversable(value)) {
    return [...value];
  }
  return [];
}

/** `count()` of a Countable or array. */
export function countOf(value: unknown): number {
  if (isPhpArray(value)) {
    return arrayEntries(value).length;
  }
  return Number((value as { count: () => unknown }).count());
}

/** `__toString` (`toString()`, spine § naming): an object, not a built-in, whose `toString` is its own. */
export function isStringable(value: unknown): value is object {
  if (!isPhpObject(value) || typeof value === "function" || isBuiltIn(value)) {
    return false;
  }
  const method: unknown = (value as { toString?: unknown }).toString;
  // oxlint-disable-next-line typescript/unbound-method -- compared, never called
  return typeof method === "function" && method !== Object.prototype.toString;
}

/** A Stringable object's `toString()`, which must return a string, as `__toString` must. */
export function stringOf(value: object): string {
  const result: unknown = (value as { toString(): unknown }).toString();
  if (typeof result !== "string") {
    throw new TypeError(`${classNameOf(value)}::toString(): Return value must be of type string`);
  }
  return result;
}

/** `is_callable`: a function, or `[object|class, methodName]` naming a method (ESC-4.3-1 item 3). */
export function isCallable(value: unknown): boolean {
  if (typeof value === "function") {
    return true;
  }
  if (!Array.isArray(value) || value.length !== 2) {
    return false;
  }
  const [target, method] = value as [unknown, unknown];
  if (typeof method !== "string" || (typeof target !== "function" && !isPhpObject(target))) {
    return false;
  }
  return typeof (target as Record<string, unknown>)[method] === "function";
}

// ---------------------------------------------------------------------------
// Number formatting

/**
 * PHP's `zend_gcvt` for a finite or non-finite double: `precision` 17 is mode 0 (the shortest round-trip digits,
 * `serialize_precision` -1), any other is that many significant digits (`precision`, 14 by default).
 */
export function formatDouble(value: number, precision: number): string {
  if (Number.isNaN(value)) {
    return "NAN";
  }
  if (!Number.isFinite(value)) {
    return value > 0 ? "INF" : "-INF";
  }
  if (value === 0) {
    return Object.is(value, -0) ? "-0" : "0";
  }
  const negative = value < 0;
  const text = precision === 17 ? Math.abs(value).toExponential() : Math.abs(value).toExponential(precision - 1);
  const [mantissa, exponent] = text.split("e") as [string, string];
  const digits = mantissa.replace(".", "").replace(/0+$/, "") || "0";
  let decpt = Number(exponent) + 1;
  let out: string;
  if (decpt < 0 ? decpt < -3 : decpt > precision) {
    decpt--;
    const sign = decpt < 0 ? "-" : "+";
    out = `${digits[0]}.${digits.length > 1 ? digits.slice(1) : "0"}E${sign}${Math.abs(decpt)}`;
  } else if (decpt < 0) {
    out = `0.${"0".repeat(-decpt)}${digits}`;
  } else if (decpt === 0) {
    out = `0.${digits}`;
  } else if (digits.length <= decpt) {
    out = digits + "0".repeat(decpt - digits.length);
  } else {
    out = `${digits.slice(0, decpt)}.${digits.slice(decpt)}`;
  }
  return negative ? `-${out}` : out;
}

/** `(string)` of a PHP scalar or null (floats at `precision` 14); a Stringable object through `toString()`. */
export function phpToString(value: unknown): string {
  if (isMarkedFloat(value)) {
    return formatDouble(Number(value), 14);
  }
  if (value === null) {
    return "";
  }
  switch (typeof value) {
    case "string":
      return value;
    case "boolean":
      return value ? "1" : "";
    case "bigint":
      return value.toString();
    case "number":
      // An unmarked `-0` is the int `0` (ESC-9.11-2).
      return isInt(value) ? String(value) : formatDouble(value, 14);
    default:
      if (isStringable(value)) {
        return stringOf(value);
      }
      return isPhpArray(value) ? "Array" : "";
  }
}

// ---------------------------------------------------------------------------
// Coercive-mode parameter types (an Upstream test file without `declare(strict_types=1)`)

function given(value: unknown): string {
  if (isPhpObject(value)) {
    return classNameOf(value);
  }
  if (typeof value === "boolean") {
    // PHP 8.3+ names a bool argument by its value (`zend_zval_value_name`).
    return value ? "true" : "false";
  }
  const type = gettype(value);
  return ({ NULL: "null", integer: "int", double: "float" } as Record<string, string>)[type] ?? type;
}

/** A PHP engine TypeError for argument `position` of `method`. */
export function argumentError(method: string, position: number, name: string, type: string, value: unknown): TypeError {
  return new TypeError(`PHPUnit\\Framework\\Assert::${method}(): Argument #${position} ($${name}) must be of type ${type}, ${given(value)} given`);
}

/** A `string` parameter: a scalar converts, a Stringable object through `toString()`; anything else is a TypeError. */
export function stringParam(method: string, position: number, name: string, value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (isScalar(value) || isStringable(value)) {
    return phpToString(value);
  }
  throw argumentError(method, position, name, "string", value);
}

/** An `int` parameter: an int, a bool, an integral float, or a numeric string; a fractional value is truncated. */
export function intParam(method: string, position: number, name: string, argument: unknown): number {
  const value = unmarkFloat(argument);
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  let number: number | null = null;
  if (typeof value === "number" || typeof value === "bigint") {
    number = Number(value);
  } else if (typeof value === "string" && numericValue(value) !== null) {
    number = toNumber(value);
  }
  if (number === null || !Number.isFinite(number)) {
    throw argumentError(method, position, name, "int", argument);
  }
  return Math.trunc(number);
}

/** A `float` parameter: an int, a float, a bool or a numeric string. */
export function floatParam(method: string, position: number, name: string, argument: unknown): number {
  const value = unmarkFloat(argument);
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "number" || typeof value === "bigint" || (typeof value === "string" && numericValue(value) !== null)) {
    return toNumber(value);
  }
  throw argumentError(method, position, name, "float", argument);
}
