// PHP's `filter_var` with the filters phpdotenv's `Validator.php` uses (ESC-15.2-1 part e; action item
// epic-15-item-1-runtime-phpdotenv-builtins), a port of PHP 8.5.11's `ext/filter/filter.c` (`PHP_FUNCTION(filter_var)`,
// `php_filter_call`, `php_zval_filter`) and `ext/filter/logical_filters.c` (`php_filter_boolean`, `php_filter_int`,
// `php_filter_parse_int`) in coercive typing mode. Ported: `FILTER_DEFAULT` (`FILTER_UNSAFE_RAW` without flags),
// `FILTER_VALIDATE_BOOLEAN` (alias `FILTER_VALIDATE_BOOL`) and `FILTER_VALIDATE_INT`, the flag
// `FILTER_NULL_ON_FAILURE`, and the options `default` and, for `FILTER_VALIDATE_INT`, `min_range` and `max_range`. Any
// other filter, flag or option throws a JS `TypeError` naming the limit, so none is silently ignored.
import { arrayEntries, toInt, toPhpString } from "./casts";
import { argumentTypeError, intParameter } from "./phpArguments";
import { intKey } from "./phpInt";
import { phpType } from "./phpType";
import { isContractToken } from "../registry/registry";
import { stringPort } from "./scalarString";
import { phpValueOf, toIntArgument } from "./throwableArguments";
import { valueCopy } from "./valueCopy";

/** PHP's `FILTER_VALIDATE_INT`. */
export const FILTER_VALIDATE_INT = 257;
/** PHP's `FILTER_VALIDATE_BOOLEAN`. */
export const FILTER_VALIDATE_BOOLEAN = 258;
/** PHP's `FILTER_VALIDATE_BOOL`, an alias of `FILTER_VALIDATE_BOOLEAN`. */
export const FILTER_VALIDATE_BOOL = 258;
/** PHP's `FILTER_DEFAULT` (`FILTER_UNSAFE_RAW`). */
export const FILTER_DEFAULT = 516;
/** PHP's `FILTER_NULL_ON_FAILURE`: a failure gives null, not false. */
export const FILTER_NULL_ON_FAILURE = 134217728;

/** The flags the port reads; any other bit is a limit. */
const PORTED_FLAGS = BigInt(FILTER_NULL_ON_FAILURE);

/** The JS `TypeError` for a filter, flag or option the port does not carry. */
function limit(what: string): TypeError {
  return new TypeError(`filter_var(): ${what} is not ported; only FILTER_DEFAULT, FILTER_VALIDATE_BOOLEAN and FILTER_VALIDATE_INT with FILTER_NULL_ON_FAILURE, and the options default, min_range and max_range, are`);
}

/** Whether `value` is a PHP array in the AD-9 forms (a contract token is a string). */
function isArray(value: unknown): value is object {
  return !isContractToken(value) && phpType(value) === "array";
}

/** `PHP_FILTER_TRIM_DEFAULT`'s bytes: space, `\t`, `\r`, `\v` and `\n` (not `\f` and not NUL). */
function trimDefault(s: string): string {
  return s.replace(/^[ \t\r\v\n]+|[ \t\r\v\n]+$/g, "");
}

/** `php_filter_boolean`: true, false, or null when `s` is no boolean word. */
function filterBoolean(s: string): boolean | null {
  const word = trimDefault(s).replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  switch (word) {
    case "":
    case "0":
    case "no":
    case "off":
    case "false":
      return false;
    case "1":
    case "on":
    case "yes":
    case "true":
      return true;
    default:
      return null;
  }
}

/** `php_filter_parse_int`: the decimal int64 `s` spells (an optional sign, then 1-9 and digits; `+0` and `-0`), or null. */
function parseInt64(s: string): bigint | null {
  const match = /^([+-]?)([1-9][0-9]*|0)$/.exec(s);
  if (match === null || (match[2] === "0" && match[1] === "")) {
    return null;
  }
  const value = BigInt(`${match[1]}${match[2]}`);
  return value > 9223372036854775807n || value < -9223372036854775808n ? null : value;
}

/** `php_filter_int` without the octal and hex flags: the int `s` spells, inside the range, or null. */
function filterInt(s: string, min: bigint | null, max: bigint | null): bigint | null {
  if (s === "") {
    return null;
  }
  const trimmed = trimDefault(s);
  if (trimmed === "") {
    return null;
  }
  // A leading `0` is the int 0 only when it is the whole string (`php_filter_int`'s `*p == '0'` branch).
  const value = trimmed.startsWith("0") ? (trimmed === "0" ? 0n : null) : parseInt64(trimmed);
  if (value === null || (min !== null && value < min) || (max !== null && value > max)) {
    return null;
  }
  return value;
}

/** The parsed `$options` argument: its flags and its `options` array's entries (null when it has none). */
interface FilterOptions {
  readonly flags: bigint;
  readonly options: Map<string, unknown> | null;
}

/** `php_filter_call`'s reading of `$options` for `filter`: an int of flags, or an array with `flags` and `options`. */
function readOptions(filter: number, options: unknown): FilterOptions {
  if (!isArray(options)) {
    const flags = toIntArgument(options);
    if (flags === null) {
      throw argumentTypeError("filter_var", 3, "options", "array|int", options);
    }
    return { flags: BigInt(flags), options: null };
  }
  let flags = 0n;
  let inner: Map<string, unknown> | null = null;
  for (const [key, value] of arrayEntries(options)) {
    if (key === "flags") {
      flags = BigInt(toInt(value));
    } else if (key === "options") {
      // A non-array `options` is ignored, as PHP ignores it for every filter but FILTER_CALLBACK.
      if (isArray(value)) {
        inner = new Map(arrayEntries(value).map(([k, v]) => [String(k), v] as const));
      }
    } else {
      throw limit(`the $options key "${String(key)}"`);
    }
  }
  if (inner !== null) {
    for (const key of inner.keys()) {
      if (key !== "default" && !(filter === FILTER_VALIDATE_INT && (key === "min_range" || key === "max_range"))) {
        throw limit(`the option "${key}" for filter ${filter}`);
      }
    }
  }
  return { flags, options: inner };
}

/**
 * PHP's `filter_var($value, $filter = FILTER_DEFAULT, $options = 0)`, for `FILTER_DEFAULT`, `FILTER_VALIDATE_BOOLEAN`
 * (`FILTER_VALIDATE_BOOL`) and `FILTER_VALIDATE_INT`. `$options` is an int of flags, or an array with `flags` and
 * `options` (`default`; for `FILTER_VALIDATE_INT` also `min_range` and `max_range`, read as PHP's `(int)`).
 *
 * - An array value fails at once (PHP's implicit `FILTER_REQUIRE_SCALAR`), and its `default` is not applied.
 * - An object without a `__toString` port fails. Any other value is filtered as its `(string)` (`null` `""`, `true`
 *   `"1"`, a float as `(string)` writes it).
 * - `FILTER_DEFAULT` gives that string. `FILTER_VALIDATE_BOOLEAN` gives true for `1`, `true`, `on`, `yes` and false for
 *   `0`, `false`, `off`, `no` and `""` (ASCII case-insensitive, after trimming space, `\t`, `\r`, `\v` and `\n`), so
 *   `filter_var(null, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE)` is false. `FILTER_VALIDATE_INT` gives the
 *   decimal int64 the trimmed string spells (`"012"` and `"1e3"` fail), inside `min_range`/`max_range`.
 * - A failure is false, or null under `FILTER_NULL_ON_FAILURE`; then an `options` `default` replaces it, as PHP's
 *   `handle_default` does (also over a validated false, as PHP does).
 *
 * `$filter` is an `int` parameter and `$options` an `array|int` one: PHP's `TypeError` for another type. Any other
 * filter, flag or option throws a JS `TypeError` naming the limit.
 */
export function filter_var(value: unknown, filter: unknown = FILTER_DEFAULT, options: unknown = 0): unknown {
  const id = intParameter("filter_var", 2, "filter", filter);
  if (id !== FILTER_DEFAULT && id !== FILTER_VALIDATE_BOOLEAN && id !== FILTER_VALIDATE_INT) {
    throw limit(`the filter ${String(id)}`);
  }
  const read = readOptions(id, options);
  if ((read.flags & ~PORTED_FLAGS) !== 0n) {
    throw limit(`the flags ${String(read.flags)}`);
  }
  const nullOnFailure = (read.flags & PORTED_FLAGS) !== 0n;
  const failure = nullOnFailure ? null : false;
  const subject = phpValueOf(value);
  if (isArray(subject)) {
    return failure;
  }
  let result: unknown;
  if (phpType(subject) === "object" && (typeof subject === "function" || stringPort(subject as object) === null)) {
    result = failure;
  } else {
    const s = toPhpString(subject);
    if (id === FILTER_DEFAULT) {
      result = s;
    } else if (id === FILTER_VALIDATE_BOOLEAN) {
      result = filterBoolean(s) ?? failure;
    } else {
      const min = read.options?.has("min_range") === true ? BigInt(toInt(read.options.get("min_range"))) : null;
      const max = read.options?.has("max_range") === true ? BigInt(toInt(read.options.get("max_range"))) : null;
      const int = filterInt(s, min, max);
      result = int === null ? failure : intKey(int);
    }
  }
  if (read.options?.has("default") === true && result === failure) {
    return valueCopy(read.options.get("default") ?? null);
  }
  return result;
}
