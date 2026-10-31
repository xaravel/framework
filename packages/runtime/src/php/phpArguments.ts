// The coercive parameters of PHP's functions (action item epic-14-item-2-runtime-generators-functions): what
// `ZEND_PARSE_PARAMETERS` gives a function declared in a file without `strict_types`, as Laravel's are
// (`Zend/zend_API.c`: `zend_parse_arg_str_weak`, `zend_parse_arg_long_weak`, `zend_parse_arg_bool_weak`,
// `zend_parse_arg_number_slow`, `zend_parse_arg_number_or_str_slow`, `Z_PARAM_ARRAY`). Each throws PHP's `TypeError`
// `<fn>(): Argument #<n> ($<name>) must be of type <type>, <type> given` for what PHP rejects. PHP's deprecation for a
// coerced `null` or a fractional float is not reproduced. `undefined` reads as null (AD-9); an omitted optional
// argument is the caller's default. Internal: the package does not export this module.
import { arrayEntries, isTrue } from "./casts";
import { parseNumeric } from "./numericString";
import type { PhpArrayKey } from "./PhpArray";
import { intKey } from "./phpInt";
import { phpType, phpTypeName } from "./phpType";
import { phpValueOf, toIntArgument, toStringArgument } from "./throwableArguments";
import { TypeError as PhpTypeError } from "./TypeError";
import { fqcn, isContractToken } from "../registry/registry";

/** A PHP number: an int or a float. */
export type PhpNumber = { readonly int: number | bigint } | { readonly float: number };

/** PHP's `TypeError` for argument `position` (`$name`) of `fn()`, declared as `type`. */
export function argumentTypeError(fn: string, position: number, name: string, type: string, value: unknown): PhpTypeError {
  return new PhpTypeError(`${fn}(): Argument #${position} ($${name}) must be of type ${type}, ${phpTypeName(phpValueOf(value ?? null))} given`);
}

/** The PHP type of `value`, or null for a value it throws for (a symbol), which no parameter takes. */
function typeOf(value: unknown): ReturnType<typeof phpType> | null {
  try {
    return phpType(value);
  } catch {
    return null;
  }
}

/** A `string` parameter (`zend_parse_arg_str_weak`). */
export function stringParameter(fn: string, position: number, name: string, value: unknown): string {
  const coerced = toStringArgument(value);
  if (coerced === null) {
    throw argumentTypeError(fn, position, name, "string", value);
  }
  return coerced;
}

/** An `int` parameter (`zend_parse_arg_long_weak`). */
export function intParameter(fn: string, position: number, name: string, value: unknown): number | bigint {
  const coerced = toIntArgument(value);
  if (coerced === null) {
    throw argumentTypeError(fn, position, name, "int", value);
  }
  return coerced;
}

/** A `?int` parameter: null stays null, anything else as `intParameter` takes it. */
export function nullableIntParameter(fn: string, position: number, name: string, value: unknown): number | bigint | null {
  if (value === null || value === undefined) {
    return null;
  }
  const coerced = toIntArgument(value);
  if (coerced === null) {
    throw argumentTypeError(fn, position, name, "?int", value);
  }
  return coerced;
}

/** A `bool` parameter (`zend_parse_arg_bool_weak`): null, a bool, an int, a float or a string by `zend_is_true`. */
export function boolParameter(fn: string, position: number, name: string, value: unknown): boolean {
  switch (typeOf(phpValueOf(value))) {
    case "null":
    case "bool":
    case "int":
    case "float":
    case "string":
      return isTrue(phpValueOf(value));
    default:
      throw argumentTypeError(fn, position, name, "bool", value);
  }
}

/** An `int|float` parameter (`Z_PARAM_NUMBER`): a numeric string is its number, null and false 0, true 1. */
export function numberParameter(fn: string, position: number, name: string, value: unknown): PhpNumber {
  const number = toNumber(phpValueOf(value));
  if (number === null) {
    throw argumentTypeError(fn, position, name, "int|float", value);
  }
  return number;
}

/** `value` as `Z_PARAM_NUMBER` reads it, or null when it rejects it. */
function toNumber(value: unknown): PhpNumber | null {
  switch (typeOf(value)) {
    case "null":
      return { int: 0 };
    case "bool":
      return { int: value === true ? 1 : 0 };
    case "int":
      return { int: value as number | bigint };
    case "float":
      return { float: Number(value) };
    case "string": {
      const numeric = parseNumeric(isContractToken(value) ? fqcn(value) : value as string, false);
      if (numeric === null) {
        return null;
      }
      return numeric.int !== null ? { int: intKey(numeric.int) } : { float: numeric.float };
    }
    default:
      return null;
  }
}

/**
 * A `string|int|float` parameter (`Z_PARAM_NUMBER_OR_STR`): an int, a float or a string as it is, null and false 0,
 * true 1, an object with a `__toString` port its string.
 */
export function numberOrStringParameter(fn: string, position: number, name: string, value: unknown): PhpNumber | { readonly string: string } {
  const php = phpValueOf(value);
  switch (typeOf(php)) {
    case "null":
      return { int: 0 };
    case "bool":
      return { int: php === true ? 1 : 0 };
    case "int":
      return { int: php as number | bigint };
    case "float":
      return { float: Number(php) };
    case "string":
      return { string: isContractToken(php) ? fqcn(php) : php as string };
    case "object": {
      const string = typeof php === "function" ? null : toStringArgument(php);
      if (string !== null) {
        return { string };
      }
      break;
    }
    default:
      break;
  }
  throw argumentTypeError(fn, position, name, "string|int|float", value);
}

/**
 * A `string|int|null` parameter (`Z_PARAM_STR_OR_LONG_OR_NULL`, `zend_parse_arg_str_or_long_slow`): null stays null,
 * an int and a string as they are; anything else is tried as an int (`zend_parse_arg_long_weak`: a bool 0 or 1, a
 * finite float in range truncated) and then as a string (`zend_parse_arg_str_weak`: a NaN or out-of-range float its
 * string, an object with a `__toString` port its string).
 */
export function nullableStringOrIntParameter(fn: string, position: number, name: string, value: unknown): { readonly int: number | bigint } | { readonly string: string } | null {
  if (value === null || value === undefined) {
    return null;
  }
  const php = phpValueOf(value);
  switch (typeOf(php)) {
    case "int":
      return { int: php as number | bigint };
    case "string":
      return { string: isContractToken(php) ? fqcn(php) : php as string };
    case "bool":
    case "float": {
      const int = toIntArgument(php);
      if (int !== null) {
        return { int };
      }
      const string = toStringArgument(php);
      if (string !== null) {
        return { string };
      }
      break;
    }
    case "object": {
      const string = typeof php === "function" ? null : toStringArgument(php);
      if (string !== null) {
        return { string };
      }
      break;
    }
    default:
      break;
  }
  throw argumentTypeError(fn, position, name, "string|int|null", value);
}

/** An `array` parameter (`Z_PARAM_ARRAY`): its `[key, value]` entries. */
export function arrayParameter(fn: string, position: number, name: string, value: unknown): [PhpArrayKey, unknown][] {
  if (typeof value === "object" && value !== null && phpType(value) === "array") {
    return arrayEntries(value);
  }
  throw argumentTypeError(fn, position, name, "array", value);
}
