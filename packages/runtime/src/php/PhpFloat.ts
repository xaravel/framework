// The float marker (AD-9.4, DIV-9.4). PHP's int and float are both a JS `number`, so a float with an integral value
// (`1.0`) is indistinguishable from the int `1`. Where Upstream depends on the distinction, `float(n)` marks the value:
// it returns a frozen `PhpFloat`, a `Number` subclass branded `Symbol.for('xaravel.php.float')` on the prototype
// (AD-9.5), so arithmetic, `+v`, `Number(v)` and comparisons still see the plain number. `isFloat(v)` reads the brand.
import { registerClass } from "../registry/registry";

const PHP_FLOAT = Symbol.for("xaravel.php.float");


function isMarked(value: unknown): value is PhpFloat {
  return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[PHP_FLOAT] === true;
}

/** The PHP type name `float()` reports for a value that is not a number. */
function typeName(value: unknown): string {
  switch (typeof value) {
    case "bigint":
      return "int";
    case "boolean":
      return "bool";
    case "object":
      return value === null ? "null" : "object";
    default:
      return typeof value;
  }
}

/**
 * `n` marked as a PHP float: a frozen `PhpFloat`. A value already marked is returned as it is. Throws a `TypeError`
 * for anything that is not a `number`.
 */
export function float(n: number | PhpFloat): PhpFloat {
  if (isMarked(n)) {
    return n;
  }
  if (typeof n !== "number") {
    throw new TypeError(`float(): Argument #1 ($n) must be of type float, ${typeName(n)} given`);
  }
  return Object.freeze(new PhpFloat(n));
}

/**
 * PHP's `is_float($v)`: true for a marked value, and for a `number` that is not an int (a fraction, a non-finite
 * value, `-0`, or anything beyond ±(2^53 − 1), which AD-9.3 makes a `bigint` when it is an int).
 */
export function isFloat(v: unknown): boolean {
  if (typeof v === "number") {
    return !Number.isSafeInteger(v) || Object.is(v, -0);
  }
  return isMarked(v);
}

export class PhpFloat extends Number {
  get [PHP_FLOAT](): true {
    return true;
  }
}

registerClass("Xaravel\\Runtime\\Php\\PhpFloat", PhpFloat);
