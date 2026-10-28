// Userland weak typing is distinct from builtin parameter parsing: null never coerces to a non-nullable scalar.
import { intKey } from "./phpInt";
import { isTrue } from "./casts";
import { parseNumeric } from "./numericString";
import { float, type PhpFloat } from "./PhpFloat";
import { argumentTypeError } from "./phpArguments";
import { phpType, phpTypeName } from "./phpType";
import { phpValueOf, toIntArgument, toStringArgument } from "./throwableArguments";
import { is_string, stringOf } from "./typeTests";
import { TypeError } from "./TypeError";
import { ArgumentCountError } from "./ArgumentCountError";
import { valueCopy } from "./valueCopy";
import { isClassConstructor } from "./Closure";
import { ArrayAccess } from "./ArrayAccess";

/** A PHP scalar, array or ArrayAccess declaration, including nullable declarations and unions. */
export type PhpUserlandType = string;
/** One userland parameter. An own `default` property distinguishes optional parameters, including a null default. */
export interface PhpParameter {
  readonly name: string;
  readonly type: PhpUserlandType;
  readonly default?: unknown;
}

function members(type: string): string[] {
  return (type.startsWith("?") ? `${type.slice(1)}|null` : type).split("|");
}
function declaration(type: string, parameter = false): string {
  const types = members(type);
  const order = parameter ? ["ArrayAccess", "array", "string", "int", "float", "bool", "null"] : ["array", "string", "int", "float", "bool", "null"];
  const ordered = order.filter((t) => types.includes(t));
  if (ordered.length === 2 && ordered[1] === "null") return `?${ordered[0]!}`;
  return ordered.join("|");
}
function normalizeFloat(value: unknown): number | PhpFloat {
  if (typeof value === "object" && value !== null && phpType(value) === "float") return value as PhpFloat;
  const n = Number(value);
  return Number.isSafeInteger(n) && !Object.is(n, -0) ? float(n) : n;
}
function normalizedValue(value: unknown): unknown {
  return is_string(value) || isClassConstructor(value) ? stringOf(value) : phpValueOf(value ?? null);
}
/** Returns a success flag separately: null is a valid PHP value. */
function coerce(type: string, argument: unknown, parameter = false): { value: unknown } | null {
  const value = normalizedValue(argument);
  const types = members(type);
  if (value === null) return types.includes("null") ? { value: null } : null;
  if (parameter && types.includes("ArrayAccess") && value instanceof ArrayAccess) return { value };
  let actual: string;
  try { actual = is_string(value) || isClassConstructor(value) ? "string" : phpType(value); } catch { return null; }
  if (types.includes(actual)) {
    return { value: actual === "string" ? stringOf(value) : actual === "float" ? normalizeFloat(value) : actual === "int" && typeof value === "bigint" ? intKey(value) : value };
  }
  // PHP weak union preference is int, float, string, bool regardless of declaration order. A numeric string in
  // int|float chooses its parsed numeric kind, rather than truncating a fractional numeric string to int.
  let order = ["int", "float", "string", "bool"];
  if (actual === "string" && types.includes("int") && types.includes("float")) {
    const numeric = parseNumeric(stringOf(value), false);
    if (numeric !== null && numeric.int === null) order = ["float", "int", "string", "bool"];
  }
  for (const target of order) {
    if (!types.includes(target)) continue;
    if (target === "int") {
      const int = toIntArgument(value);
      if (int !== null) return { value: int };
    } else if (target === "float") {
      if (actual === "int" || actual === "float" || actual === "bool") return { value: normalizeFloat(Number(value)) };
      if (actual === "string") {
        const numeric = parseNumeric(stringOf(value), false);
        if (numeric !== null) return { value: normalizeFloat(numeric.float) };
      }
    } else if (target === "string") {
      const string = toStringArgument(value);
      if (string !== null) return { value: string };
    } else if (["int", "float", "string", "bool"].includes(actual)) {
      return { value: isTrue(value) };
    }
  }
  return null;
}

/**
 * Bind all parameters before reading values or executing a body. Optional values use an own `default` property;
 * supplied null does not select that default. `fn` is PHP's declaring name, e.g. `Illuminate\\Support\\Arr::integer`.
 */
export function bindPhpArguments(fn: string, parameters: readonly PhpParameter[], args: readonly unknown[]): unknown[] {
  const required = parameters.findLastIndex((parameter) => !Object.hasOwn(parameter, "default")) + 1;
  return parameters.map((parameter, index) => {
    if (index >= args.length && index < required) {
      const qualifier = required === parameters.length ? "exactly" : "at least";
      throw new ArgumentCountError(`Too few arguments to function ${fn}(), ${args.length} passed and ${qualifier} ${required} expected`);
    }
    const supplied = index < args.length ? args[index] : parameter.default;
    const result = coerce(parameter.type, supplied, true);
    if (result === null) throw argumentTypeError(fn, index + 1, parameter.name, declaration(parameter.type, true), normalizedValue(supplied));
    return valueCopy(result.value);
  });
}

/** Coerce a userland return with the same weak scalar rules and normalize int, float and class-string values. */
export function phpReturn(fn: string, type: PhpUserlandType, value: unknown): unknown {
  const result = coerce(type, value);
  if (result === null) throw new TypeError(`${fn}(): Return value must be of type ${declaration(type)}, ${phpTypeName(normalizedValue(value))} returned`);
  return valueCopy(result.value);
}
