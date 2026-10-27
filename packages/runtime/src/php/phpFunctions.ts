// The PHP function-name resolver (action item epic-14-item-9-runtime-set-functions-callable-names, ESC-14.4-2, under
// DIV-9.13 and DIV-9.14 as that ruling amends them): a frozen registry of every PHP global function the runtime exports
// under its PHP name, each with the counts and by-reference positions PHP 8.5.11's `ReflectionFunction` gives it, and
// `phpFunction(name)`, which resolves a PHP callable string such as `'strcasecmp'` to that export. A name resolves
// case-insensitively (ASCII, as `zend_str_tolower`), after one leading `\`, when it holds no `::`
// (`zend_is_callable_check_func`); the runtime's helpers (`arrayEntries`, `arrayUnion`, …), classes and constants
// are never in it. The resolved callback checks its argument count as PHP checks an internal function's
// (`zend_wrong_parameters_count_error`), wraps a by-reference argument that is no `Ref` in a fresh `Ref` (PHP's
// warning is not reproduced), and calls the export. `callbackParameter` (every runtime function that takes a
// callback) and `is_callable` read it. Everything is synchronous.
//
// The registry imports the exports it lists, and `arrayFunctions.ts` and `typeTests.ts` import `phpFunction`
// back: every listed export is a function declaration, initialised before any module body runs, so the cycle is safe.
import { array_chunk } from "./arrayFunctions";
import { key, ksort, krsort, uksort, sort, rsort } from "./arrayRefFunctions";
import { intdiv, floor, ceil } from "./arithmetic";
import { call_user_func_array } from "./callables";
import { setlocale } from "./locale";
import { strtolower, strrev } from "./stringFunctions";
import { is_subclass_of } from "./typeTests";
import { ArgumentCountError } from "./ArgumentCountError";
import { array_all, array_any, array_combine, array_diff, array_diff_assoc, array_diff_key, array_diff_uassoc, array_diff_ukey, array_filter, array_find_key, array_first, array_flip, array_intersect, array_intersect_assoc, array_intersect_key, array_intersect_uassoc, array_key_exists, array_key_first, array_key_last, array_keys, array_last, array_map, array_merge, array_merge_recursive, array_pad, array_replace, array_replace_recursive, array_reverse, array_search, array_slice, array_udiff, array_uintersect, array_unique, array_values, count, in_array, is_scalar, iterator_count, iterator_to_array, max, min } from "./arrayFunctions";
import { array_pop, array_shift, array_splice, array_unshift, arsort, asort, end, reset, strcasecmp, strcmp, strcoll, strnatcasecmp, strnatcmp, uasort } from "./arrayRefFunctions";
import { isNumeric } from "./isNumeric";
import { jsonLastError } from "./jsonLastError";
import { abs, round } from "./mathFunctions";
import { method_exists, property_exists } from "./objectFunctions";
import { isFloat } from "./PhpFloat";
import { getDebugType, gettype } from "./phpType";
import { range } from "./range";
import { Ref } from "./Ref";
import { sprintf } from "./sprintf";
import { chunk_split, explode, implode, lcfirst, str_contains, str_starts_with, strlen, strtoupper, substr, trim } from "./stringFunctions";
import { is_a, is_array, is_bool, is_callable, is_int, is_iterable, is_null, is_object, is_string } from "./typeTests";

/** A PHP callable as the runtime calls it. */
type PhpCallable = (...args: unknown[]) => unknown;

/** A PHP global function the runtime exports under its PHP name. */
export interface PhpFunction {
  /** PHP's canonical name, as `ReflectionFunction::getName()` gives it. */
  readonly name: string;
  /** The runtime's export of that name. */
  readonly fn: (...args: never[]) => unknown;
  /** `ReflectionFunction::getNumberOfRequiredParameters()`. */
  readonly required: number;
  /** `ReflectionFunction::getNumberOfParameters()`, a variadic parameter included. */
  readonly total: number;
  /** `ReflectionFunction::isVariadic()`. */
  readonly variadic: boolean;
  /** The 0-based positions of the parameters PHP passes by reference (`ReflectionParameter::isPassedByReference()`). */
  readonly byRef: readonly number[];
  /** The fewest arguments PHP's parameter parsing takes, where it exceeds `required` (the `"+f"` callback forms: 2). */
  readonly minimum: number;
  /** The export as a resolved callback: the argument count checked, by-reference arguments wrapped, then called. */
  readonly call: PhpCallable;
}

/** PHP's `ArgumentCountError` for `given` arguments to `fn`, or null when PHP takes that many. */
function countError(fn: PhpFunction, given: number): ArgumentCountError | null {
  const few = given < fn.minimum;
  if (!few && (fn.variadic || given <= fn.total)) {
    return null;
  }
  const expected = few ? fn.minimum : fn.total;
  const kind = !fn.variadic && fn.minimum === fn.total ? "exactly" : few ? "at least" : "at most";
  return new ArgumentCountError(`${fn.name}() expects ${kind} ${expected} argument${expected === 1 ? "" : "s"}, ${given} given`);
}

/** A registry entry for the export `fn` of PHP's function `name`. */
function entry(name: string, fn: (...args: never[]) => unknown, required: number, total: number, variadic: boolean = false, byRef: readonly number[] = [], minimum: number = required): PhpFunction {
  const described: PhpFunction = Object.freeze({
    name,
    fn,
    required,
    total,
    variadic,
    byRef: Object.freeze([...byRef]),
    minimum,
    call: (...args: unknown[]): unknown => {
      const error = countError(described, args.length);
      if (error !== null) {
        throw error;
      }
      for (const position of byRef) {
        if (position < args.length && !(args[position] instanceof Ref)) {
          args[position] = new Ref<unknown>(args[position] ?? null);
        }
      }
      return Reflect.apply(fn, undefined, args) ?? null;
    },
  });
  return described;
}

/** Every PHP global function the runtime exports under its PHP name, by lower-cased name. */
export const PHP_FUNCTIONS: Readonly<Record<string, PhpFunction>> = Object.freeze(
  Object.fromEntries(
    [
      entry("abs", abs, 1, 1),
      entry("array_chunk", array_chunk, 2, 3),
      entry("key", key, 1, 1),
      entry("ksort", ksort, 1, 2, false, [0]),
      entry("krsort", krsort, 1, 2, false, [0]),
      entry("uksort", uksort, 2, 2, false, [0]),
      entry("sort", sort, 1, 2, false, [0]),
      entry("rsort", rsort, 1, 2, false, [0]),
      entry("intdiv", intdiv, 2, 2),
      entry("floor", floor, 1, 1),
      entry("ceil", ceil, 1, 1),
      entry("call_user_func_array", call_user_func_array, 2, 2),
      entry("setlocale", setlocale, 2, 3, true),
      entry("strtolower", strtolower, 1, 1),
      entry("strrev", strrev, 1, 1),
      entry("is_subclass_of", is_subclass_of, 2, 3),
      entry("array_all", array_all, 2, 2),
      entry("array_any", array_any, 2, 2),
      entry("array_combine", array_combine, 2, 2),
      entry("array_diff", array_diff, 1, 2, true),
      entry("array_diff_assoc", array_diff_assoc, 1, 2, true),
      entry("array_diff_key", array_diff_key, 1, 2, true),
      entry("array_diff_uassoc", array_diff_uassoc, 1, 2, true, [], 2),
      entry("array_diff_ukey", array_diff_ukey, 1, 2, true, [], 2),
      entry("array_filter", array_filter, 1, 3),
      entry("array_find_key", array_find_key, 2, 2),
      entry("array_first", array_first, 1, 1),
      entry("array_flip", array_flip, 1, 1),
      entry("array_intersect", array_intersect, 1, 2, true),
      entry("array_intersect_assoc", array_intersect_assoc, 1, 2, true),
      entry("array_intersect_key", array_intersect_key, 1, 2, true),
      entry("array_intersect_uassoc", array_intersect_uassoc, 1, 2, true, [], 2),
      entry("array_key_exists", array_key_exists, 2, 2),
      entry("array_key_first", array_key_first, 1, 1),
      entry("array_key_last", array_key_last, 1, 1),
      entry("array_keys", array_keys, 1, 3),
      entry("array_last", array_last, 1, 1),
      entry("array_map", array_map, 2, 3, true),
      entry("array_merge", array_merge, 0, 1, true),
      entry("array_merge_recursive", array_merge_recursive, 0, 1, true),
      entry("array_pad", array_pad, 3, 3),
      entry("array_pop", array_pop, 1, 1, false, [0]),
      entry("array_replace", array_replace, 1, 2, true),
      entry("array_replace_recursive", array_replace_recursive, 1, 2, true),
      entry("array_reverse", array_reverse, 1, 2),
      entry("array_search", array_search, 2, 3),
      entry("array_shift", array_shift, 1, 1, false, [0]),
      entry("array_slice", array_slice, 2, 4),
      entry("array_splice", array_splice, 2, 4, false, [0]),
      entry("array_udiff", array_udiff, 1, 2, true, [], 2),
      entry("array_uintersect", array_uintersect, 1, 2, true, [], 2),
      entry("array_unique", array_unique, 1, 2),
      entry("array_unshift", array_unshift, 1, 2, true, [0]),
      entry("array_values", array_values, 1, 1),
      entry("arsort", arsort, 1, 2, false, [0]),
      entry("asort", asort, 1, 2, false, [0]),
      entry("chunk_split", chunk_split, 1, 3),
      entry("count", count, 1, 2),
      entry("end", end, 1, 1, false, [0]),
      entry("explode", explode, 2, 3),
      entry("get_debug_type", getDebugType, 1, 1),
      entry("gettype", gettype, 1, 1),
      entry("implode", implode, 1, 2),
      entry("in_array", in_array, 2, 3),
      entry("is_a", is_a, 2, 3),
      entry("is_array", is_array, 1, 1),
      entry("is_bool", is_bool, 1, 1),
      entry("is_callable", is_callable, 1, 3, false, [2]),
      entry("is_float", isFloat, 1, 1),
      entry("is_int", is_int, 1, 1),
      entry("is_iterable", is_iterable, 1, 1),
      entry("is_null", is_null, 1, 1),
      entry("is_numeric", isNumeric, 1, 1),
      entry("is_object", is_object, 1, 1),
      entry("is_scalar", is_scalar, 1, 1),
      entry("is_string", is_string, 1, 1),
      entry("iterator_count", iterator_count, 1, 1),
      entry("iterator_to_array", iterator_to_array, 1, 2),
      entry("json_last_error", jsonLastError, 0, 0),
      entry("lcfirst", lcfirst, 1, 1),
      entry("max", max, 1, 2, true),
      entry("method_exists", method_exists, 2, 2),
      entry("min", min, 1, 2, true),
      entry("property_exists", property_exists, 2, 2),
      entry("range", range, 2, 3),
      entry("reset", reset, 1, 1, false, [0]),
      entry("round", round, 1, 3),
      entry("sprintf", sprintf, 1, 2, true),
      entry("str_contains", str_contains, 2, 2),
      entry("str_starts_with", str_starts_with, 2, 2),
      entry("strcasecmp", strcasecmp, 2, 2),
      entry("strcmp", strcmp, 2, 2),
      entry("strcoll", strcoll, 2, 2),
      entry("strlen", strlen, 1, 1),
      entry("strnatcasecmp", strnatcasecmp, 2, 2),
      entry("strnatcmp", strnatcmp, 2, 2),
      entry("strtoupper", strtoupper, 1, 1),
      entry("substr", substr, 2, 3),
      entry("trim", trim, 1, 2),
      entry("uasort", uasort, 2, 2, false, [0]),
    ].map((described) => [described.name, described] as const),
  ),
);

/** `name` lower-cased as PHP's `zend_str_tolower` does: ASCII `A`-`Z` only. */
function asciiLower(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/**
 * The PHP global function a callable string names, as a callback, or null when the runtime exports none of that name
 * (or the string holds `::`, a method). One leading `\` is dropped and the name matched case-insensitively, as PHP's
 * `zend_is_callable_check_func` does. The callback checks the argument count as PHP does for an internal function
 * (`ArgumentCountError` `<name>() expects exactly|at least|at most <n> argument(s), <m> given`, `<name>` PHP's
 * canonical name), wraps a by-reference argument that is no `Ref` in a fresh `Ref`, and calls the export.
 */
export function phpFunction(name: unknown): ((...args: unknown[]) => unknown) | null {
  if (typeof name !== "string" || name.includes("::")) {
    return null;
  }
  const bare: string = name.startsWith("\\") ? name.slice(1) : name;
  const key = asciiLower(bare);
  return Object.hasOwn(PHP_FUNCTIONS, key) ? PHP_FUNCTIONS[key]!.call : null;
}
