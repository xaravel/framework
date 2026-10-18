// `Mockery\Matcher\Type` (Mockery 1.6.15): `Mockery.type(name)`.
//
// A PHP type name runs PHP's `is_<name>` (`real` is `is_float`) over the AD-9
// value model; int and float are both a JS number, told apart by
// `Number.isInteger` (DIV-9). `Closure` and `callable` match a function that
// is not a class. Any other name matches an object of that class
// (`instanceof` by name); a class value matches its instances. Printed as
// `'<' . ucfirst(name) . '>'`.
import { classNameOf, FQCN, instanceOfName, isBrandedArray, isClass, isClosure, isPhpArray, isPhpObject } from "../../support/values";
import { MatcherAbstract } from "./MatcherAbstract";

function isNumericString(value: string): boolean {
  // PHP 8 `is_numeric`: optional leading whitespace, a decimal or float literal, optional trailing whitespace.
  return /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/.test(value);
}

function isCountable(value: unknown): boolean {
  if (isPhpArray(value)) {
    return true;
  }
  return isPhpObject(value) && typeof (value as { count?: unknown }).count === "function";
}

/** PHP's `is_<name>` for the names PHP defines, or null when there is no such function. */
function isType(name: string, actual: unknown): boolean | null {
  switch (name) {
    case "int":
    case "integer":
    case "long":
      return (typeof actual === "number" && Number.isInteger(actual)) || typeof actual === "bigint";
    case "float":
    case "double":
    case "real":
      return typeof actual === "number" && !Number.isInteger(actual);
    case "string":
      return typeof actual === "string";
    case "bool":
    case "boolean":
      return typeof actual === "boolean";
    case "array":
      return isPhpArray(actual);
    case "object":
      return isPhpObject(actual);
    case "callable":
      return isClosure(actual);
    case "numeric":
      return typeof actual === "number" || typeof actual === "bigint" || (typeof actual === "string" && isNumericString(actual));
    case "scalar":
      return typeof actual === "number" || typeof actual === "bigint" || typeof actual === "string" || typeof actual === "boolean";
    case "iterable":
      return Array.isArray(actual) || isBrandedArray(actual) || isPhpArray(actual) || (isPhpObject(actual) && typeof (actual as Record<symbol, unknown>)[Symbol.iterator] === "function");
    case "countable":
      return isCountable(actual);
    case "null":
      return actual === null;
    case "resource":
      return typeof actual === "object" && actual !== null && Symbol.for("xaravel.php.resource") in actual;
    default:
      return null;
  }
}

export class Type extends MatcherAbstract {
  static override readonly [FQCN]: string = "Mockery\\Matcher\\Type";

  match(actual: unknown): boolean {
    const expected = this._expected;
    if (isClass(expected)) {
      return isPhpObject(actual) && actual instanceof (expected as unknown as abstract new () => object);
    }
    if (typeof expected !== "string") {
      return false;
    }
    const byFunction = isType(expected.toLowerCase(), actual);
    if (byFunction !== null) {
      return byFunction;
    }
    if (expected.replace(/^\\/, "").toLowerCase() === "closure") {
      return isClosure(actual);
    }
    return isPhpObject(actual) && typeof actual !== "function" && instanceOfName(actual, expected);
  }

  toString(): string {
    const expected = this._expected;
    const name = isClass(expected) ? (classNameOf(expected) ?? "") : String(expected);
    return `<${name.charAt(0).toUpperCase()}${name.slice(1)}>`;
  }
}
