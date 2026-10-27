// PHP 8.5 arithmetic (ESC-14.5-1/2), using exact int64 arithmetic until PHP promotes to double.
import { arrayUnion } from "./arrayFunctions";
import { ArithmeticError } from "./ArithmeticError";
import { DivisionByZeroError } from "./DivisionByZeroError";
import { parseNumeric } from "./numericString";
import { intParameter, numberParameter, type PhpNumber } from "./phpArguments";
import { float, type PhpFloat } from "./PhpFloat";
import { INT_MAX, INT_MIN, intKey } from "./phpInt";
import { phpType, phpTypeName } from "./phpType";
import { phpValueOf } from "./throwableArguments";
import { TypeError as PhpTypeError } from "./TypeError";

/** PHP's 64-bit integer limits, kept exact. */
export const PHP_INT_MAX = INT_MAX;
export const PHP_INT_MIN = INT_MIN;

function numeric(value: unknown): PhpNumber | null {
  const php = phpValueOf(value ?? null);
  switch (phpType(php)) {
    case "null": return { int: 0 };
    case "bool": return { int: php === true ? 1 : 0 };
    case "int": return { int: php as number | bigint };
    case "float": return { float: Number(php) };
    case "string": {
      const parsed = parseNumeric(php as string, true);
      return parsed === null ? null : parsed.int === null ? { float: parsed.float } : { int: intKey(parsed.int) };
    }
    default: return null;
  }
}

function operands(a: unknown, b: unknown, operator: string): [PhpNumber, PhpNumber] {
  const left = numeric(a);
  const right = numeric(b);
  if (left === null || right === null) {
    const name = (value: unknown): string => typeof value === "boolean" ? "bool" : phpTypeName(phpValueOf(value ?? null));
    throw new PhpTypeError(`Unsupported operand types: ${name(a)} ${operator} ${name(b)}`);
  }
  return [left, right];
}

function double(value: PhpNumber): number {
  return "int" in value ? Number(value.int) : value.float;
}

/** PHP's `$a + $b`: numeric addition or array union, preserving int64 and float identity. */
export function plus(a: unknown, b: unknown): unknown {
  if (phpType(phpValueOf(a)) === "array" && phpType(phpValueOf(b)) === "array") {
    return arrayUnion(a, b);
  }
  const [left, right] = operands(a, b, "+");
  if ("int" in left && "int" in right) {
    const sum = BigInt(left.int) + BigInt(right.int);
    return sum >= INT_MIN && sum <= INT_MAX ? intKey(sum) : float(Number(left.int) + Number(right.int));
  }
  return float(double(left) + double(right));
}

/** PHP's `$a / $b`: an exact divisible int pair stays int; every other result is float. */
export function divide(a: unknown, b: unknown): number | bigint | PhpFloat {
  const [left, right] = operands(a, b, "/");
  if (double(right) === 0) throw new DivisionByZeroError("Division by zero");
  if ("int" in left && "int" in right) {
    const x = BigInt(left.int);
    const y = BigInt(right.int);
    if (!(x === INT_MIN && y === -1n) && x % y === 0n) return intKey(x / y);
  }
  return float(double(left) / double(right));
}

/** PHP's `intdiv`: coercive int parameters and truncation toward zero. */
export function intdiv(num1: unknown, num2: unknown): number | bigint {
  const left = BigInt(intParameter("intdiv", 1, "num1", num1));
  const right = BigInt(intParameter("intdiv", 2, "num2", num2));
  if (right === 0n) throw new DivisionByZeroError("Division by zero");
  if (left === INT_MIN && right === -1n) throw new ArithmeticError("Division of PHP_INT_MIN by -1 is not an integer");
  return intKey(left / right);
}

/** PHP's `floor`, always a float. */
export function floor(num: unknown): PhpFloat {
  return float(Math.floor(double(numberParameter("floor", 1, "num", num))));
}

/** PHP's `ceil`, always a float. */
export function ceil(num: unknown): PhpFloat {
  return float(Math.ceil(double(numberParameter("ceil", 1, "num", num))));
}
