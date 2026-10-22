// The constructor checks PHP's throwables share (Story 9.10, AD-19): `Exception`, `Error` and `ErrorException` check
// their arguments as PHP's `__construct` does under strict typing, and throw PHP's `TypeError` naming the declaring
// root (`Exception::__construct(): Argument #2 ($code) must be of type int, string given`). PHP's coercions of
// constructor arguments (a numeric-string or float code, a `null` message) are not ported: such an argument throws.
//
// Load safety: the exception classes import this file, so it imports only the Registry and `phpType.ts`, and builds
// the `TypeError` from the class the Registry's base map holds under that name (`php/TypeError.ts` registers it),
// falling back to the JS `TypeError` only when nothing registered it. The package does not export this module.
import { registeredBaseClass } from "../registry/registry";
import { phpType, phpTypeName } from "./phpType";

/** The PHP type a constructor parameter declares. */
export type ParameterType = "string" | "int" | "?string" | "?int" | "?Throwable";

/** Whether `value` is of the PHP `type` (an int is what `phpType` reads as one, AD-9.3; a `Throwable` is any JS `Error`). */
function accepts(type: ParameterType, value: unknown): boolean {
  if (type.startsWith("?") && value === null) {
    return true;
  }
  switch (type) {
    case "string":
    case "?string":
      return typeof value === "string";
    case "int":
    case "?int":
      return isPhpInt(value);
    default:
      return value instanceof globalThis.Error;
  }
}

/** Whether `phpType` reads `value` as an int; a symbol or a `bigint` beyond int64 (which it throws for) is none. */
function isPhpInt(value: unknown): boolean {
  try {
    return phpType(value) === "int";
  } catch {
    return false;
  }
}

/**
 * Throws PHP's `TypeError` `<root>::__construct(): Argument #<position> ($<name>) must be of type <type>, <given>
 * given` when `value` is not of `type`.
 */
export function checkArgument(root: string, position: number, name: string, type: ParameterType, value: unknown): void {
  if (accepts(type, value)) {
    return;
  }
  const message = `${root}::__construct(): Argument #${position} ($${name}) must be of type ${type}, ${phpTypeName(value)} given`;
  const php = registeredBaseClass("TypeError") as (new (message: string) => globalThis.Error) | null;
  throw php === null ? new TypeError(message) : new php(message);
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
