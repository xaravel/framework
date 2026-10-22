// PHP's type names over the AD-9 value model (Story 9.6, moved here by Story 9.10): `phpType`, the class name PHP's
// messages give an object, and the type name PHP's `TypeError` messages give an argument. Shared by the casts, the
// codecs and the PHP throwables' constructor checks (`throwableArguments.ts`), so it imports only the Registry and
// `phpInt.ts`, neither of which loads a PHP throwable: an exception class may import it without an import cycle.
import { fqcn } from "../registry/registry";
import { INT_MAX, INT_MIN } from "./phpInt";

const PHP_ARRAY = Symbol.for("xaravel.php.array");
const PHP_FLOAT = Symbol.for("xaravel.php.float");

/** A PHP type, as `phpType` reads it from a JS value. */
export type PhpType = "null" | "bool" | "int" | "float" | "string" | "array" | "object";

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

/**
 * PHP's name for the type of `v` in a `TypeError` message (`zend_zval_value_name`): `null`, `true`, `false`, `int`,
 * `float`, `string`, `array`, or the object's class name. A symbol, which has no PHP counterpart, is `symbol`, and a
 * `bigint` beyond int64 is `int`, so building the message never throws.
 */
export function phpTypeName(v: unknown): string {
  if (typeof v === "symbol") {
    return "symbol";
  }
  if (typeof v === "bigint") {
    return "int";
  }
  const type = phpType(v);
  if (type === "bool") {
    return v === true ? "true" : "false";
  }
  return type === "object" ? className(v as object) : type;
}
