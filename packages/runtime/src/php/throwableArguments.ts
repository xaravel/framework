// The constructor arguments PHP's throwables share (Story 9.10, AD-19): `Exception`, `Error` and `ErrorException`
// take their arguments as PHP's `__construct` does in coercive mode, the mode Laravel's files and the Oracle run in
// (`decisions/ESC-9.10-2.md`), and throw PHP's `TypeError` naming the declaring root for what PHP rejects
// (`Exception::__construct(): Argument #2 ($code) must be of type int, string given`).
//
// - A `string` parameter takes a string as it is, `null` as `""` (`?string`: null stays null), a bool, an int or a
//   float as PHP's `(string)` gives it, and an object with a `__toString` port through it; an array, a closure or
//   another object is rejected.
// - An `int` parameter takes an int as it is, `null` as 0 (`?int`: null stays null), a bool as 0 / 1, a float or a
//   numeric string (whitespace around it allowed, `"1e3"` included) truncated toward zero when it is finite and
//   inside int64; a leading-numeric (`"5abc"`), non-numeric or out-of-range string or float, an array and an object
//   are rejected.
// - A `?Throwable` parameter takes null or a JS `Error`.
// - A `bigint` outside int64 is no PHP int: it stands for the float PHP makes of such an integer literal
//   (`2n ** 70n` for `1180591620717411303424`), so it is read, coerced and named (`float given`) as that float.
// PHP's deprecation notices for a coerced `null` or a fractional float are not reproduced.
//
// Load safety: the exception classes import this file, so it imports only the Registry and modules that import
// nothing that loads a PHP throwable (`phpType.ts`, `phpInt.ts`, `numericString.ts`, `scalarString.ts`), and builds
// the `TypeError` from the class the Registry's base map holds under that name (`php/TypeError.ts` registers it),
// falling back to the JS `TypeError` only when nothing registered it. The package does not export this module;
// `phpArguments.ts` reads the same coercions for PHP's functions.
import { fqcn, isContractToken, registeredBaseClass } from "../registry/registry";
import { parseNumeric } from "./numericString";
import { INT_MAX, INT_MIN, intKey } from "./phpInt";
import { className, phpType, phpTypeName } from "./phpType";
import { formatFloat, stringPort } from "./scalarString";

/** 2^63: the first double above `PHP_INT_MAX`; `-2^63` is `PHP_INT_MIN` itself (`ZEND_DOUBLE_FITS_LONG`). */
const TWO_63 = 2 ** 63;

/** PHP's `TypeError` built with `message`: the registered class, else the JS one. */
function phpTypeError(message: string): globalThis.Error {
  const php = registeredBaseClass("TypeError") as (new (message: string) => globalThis.Error) | null;
  return php === null ? new TypeError(message) : new php(message);
}

/**
 * `value` as the PHP value it stands for: a `bigint` outside int64 as the float PHP makes of that integer literal
 * (`Number(value)`, which rounds as PHP's parser does), any other value unchanged.
 */
export function phpValueOf(value: unknown): unknown {
  return typeof value === "bigint" && (value < INT_MIN || value > INT_MAX) ? Number(value) : value;
}

/** PHP's `TypeError` for argument `position` (`$name`) of `<root>::__construct()`, declared as `type`. */
function argumentError(root: string, position: number, name: string, type: string, value: unknown): globalThis.Error {
  return phpTypeError(`${root}::__construct(): Argument #${position} ($${name}) must be of type ${type}, ${phpTypeName(phpValueOf(value))} given`);
}

/** `phpType(value)`, or null for a value it throws for (a symbol), which no parameter takes. */
function typeOf(value: unknown): ReturnType<typeof phpType> | null {
  try {
    return phpType(value);
  } catch {
    return null;
  }
}

/** A float as an int parameter takes it: truncated when finite and inside int64, else null (rejected). */
function floatToIntArgument(value: number): number | bigint | null {
  if (!Number.isFinite(value) || value >= TWO_63 || value < -TWO_63) {
    return null;
  }
  const truncated = Math.trunc(value);
  if (Number.isSafeInteger(truncated)) {
    return truncated === 0 ? 0 : truncated;
  }
  return BigInt(truncated);
}

/** `value` as PHP's coercive `int` parameter takes it (`zend_parse_arg_long_weak`), or null when it rejects it. */
export function toIntArgument(argument: unknown): number | bigint | null {
  const value = phpValueOf(argument);
  switch (typeOf(value)) {
    case "null":
      return 0;
    case "bool":
      return value === true ? 1 : 0;
    case "int":
      return value as number | bigint;
    case "float":
      return floatToIntArgument(typeof value === "number" ? value : Number(value));
    case "string": {
      const numeric = parseNumeric(isContractToken(value) ? fqcn(value) : value as string, false);
      if (numeric === null) {
        return null;
      }
      return numeric.int !== null ? intKey(numeric.int) : floatToIntArgument(numeric.float);
    }
    default:
      return null;
  }
}

/** `value` as PHP's coercive `string` parameter takes it (`zend_parse_arg_str_weak`), or null when it rejects it. */
export function toStringArgument(argument: unknown): string | null {
  const value = phpValueOf(argument);
  switch (typeOf(value)) {
    case "null":
      return "";
    case "bool":
      return value === true ? "1" : "";
    case "int":
      return String(value);
    case "float":
      return formatFloat(typeof value === "number" ? value : Number(value));
    case "string":
      return isContractToken(value) ? fqcn(value) : value as string;
    case "object":
      break;
    default:
      return null;
  }
  const object = value as object;
  const port = typeof object === "function" ? null : stringPort(object);
  if (port === null) {
    return null;
  }
  // `__toString`'s `string` return type coerces as an argument does: a bool, an int, a float or another port's
  // object gives its string, and null, an array or another object is PHP's `TypeError`.
  const result: unknown = port.call(object);
  const coerced = result === null || result === undefined ? null : toStringArgument(result);
  if (coerced === null) {
    throw phpTypeError(`${className(object)}::__toString(): Return value must be of type string, ${phpTypeName(result)} returned`);
  }
  return coerced;
}

/** Argument `position` (`$name`, declared `string`, or `?string` when `nullable`) of `<root>::__construct()`. */
export function stringArgument(root: string, position: number, name: string, value: unknown): string;
export function stringArgument(root: string, position: number, name: string, value: unknown, nullable: true): string | null;
export function stringArgument(root: string, position: number, name: string, value: unknown, nullable: boolean = false): string | null {
  if (nullable && (value === null || value === undefined)) {
    return null;
  }
  const coerced = toStringArgument(value);
  if (coerced === null) {
    throw argumentError(root, position, name, nullable ? "?string" : "string", value);
  }
  return coerced;
}

/** Argument `position` (`$name`, declared `int`, or `?int` when `nullable`) of `<root>::__construct()`. */
export function intArgument(root: string, position: number, name: string, value: unknown): number | bigint;
export function intArgument(root: string, position: number, name: string, value: unknown, nullable: true): number | bigint | null;
export function intArgument(root: string, position: number, name: string, value: unknown, nullable: boolean = false): number | bigint | null {
  if (nullable && (value === null || value === undefined)) {
    return null;
  }
  const coerced = toIntArgument(value);
  if (coerced === null) {
    throw argumentError(root, position, name, nullable ? "?int" : "int", value);
  }
  return coerced;
}

/** Argument `position` (`$previous`, declared `?Throwable`) of `<root>::__construct()`: null or a JS `Error`. */
export function previousArgument(root: string, position: number, value: unknown): globalThis.Error | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!(value instanceof globalThis.Error)) {
    throw argumentError(root, position, "previous", "?Throwable", value);
  }
  return value;
}

/** The class-name brand `registerClass` sets (ESC-4.3-1 item 1); a subclass inherits its parent's. */
const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

/**
 * Sets the own, non-enumerable `name` (the brand of the class being constructed, else `fallback`) and `code` of a new
 * PHP throwable.
 */
export function initThrowable(self: globalThis.Error, newTarget: object, fallback: string, code: number | bigint): void {
  const brand: unknown = (newTarget as Record<symbol, unknown>)[CLASS_FQCN];
  Object.defineProperty(self, "name", { value: typeof brand === "string" ? brand : fallback, writable: true, enumerable: false, configurable: true });
  Object.defineProperty(self, "code", { value: code, writable: true, enumerable: false, configurable: true });
}

/** The JS `Error` options that make a non-null `previous` the `cause` (none for null). */
export function causeOf(previous: globalThis.Error | null): ErrorOptions {
  return previous === null ? {} : { cause: previous };
}
