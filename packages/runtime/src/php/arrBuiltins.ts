// PHP array/query builtins needed by Arr (MAINT-2026-10-27-story-14-6). All array writes use PHP value separation.
import { keptArray, toPhpArray } from "./arrayFunctions";
import { arrayEntries, toPhpString } from "./casts";
import { objectProps, utf8 } from "./mangle";
import { arrayParameter, argumentTypeError, intParameter, stringParameter } from "./phpArguments";
import { nextFreeIndex } from "./PhpArray";
import { phpType } from "./phpType";
import { Ref } from "./Ref";
import { phpValueOf, toStringArgument } from "./throwableArguments";
import { isClassConstructor } from "./Closure";
import { is_string, stringOf } from "./typeTests";
import { valueCopy } from "./valueCopy";

export const PHP_QUERY_RFC1738 = 1;
export const PHP_QUERY_RFC3986 = 2;

/** PHP's array_is_list: keys must be consecutive integers, in insertion order, starting at zero. */
export function array_is_list(array: unknown): boolean {
  return arrayParameter("array_is_list", 1, "array", array).every(([key], index) => typeof key !== "string" && BigInt(key) === BigInt(index));
}

/** PHP's array_push(&$array, ...$values), separating the referenced value and preserving its next free index. */
export function array_push(array: Ref<unknown>, ...values: unknown[]): number {
  if (!(array instanceof Ref)) {
    throw new TypeError("array_push(): Argument #1 ($array) is by reference; pass a Ref holding the array (DIV-9.2)");
  }
  arrayParameter("array_push", 1, "array", array.value);
  const result = toPhpArray(array.value);
  let inserted = false;
  try {
    for (const value of values) {
      result.push(valueCopy(value));
      inserted = true;
    }
  } finally {
    // PHP retains successful insertions even when a later append overflows. Zero values leave the Ref untouched.
    if (inserted) array.value = keptArray([...result], nextFreeIndex(result));
  }
  return result.size;
}

export interface HttpBuildQueryOptions {
  readonly numericPrefix?: unknown;
  readonly argSeparator?: unknown;
  readonly encodingType?: unknown;
}

function queryValue(value: unknown): unknown {
  return is_string(value) || isClassConstructor(value) ? stringOf(value) : phpValueOf(value ?? null);
}

function encode(value: string, rfc3986: boolean): string {
  let result = "";
  for (const byte of utf8.encode(value)) {
    if (byte >= 65 && byte <= 90 || byte >= 97 && byte <= 122 || byte >= 48 && byte <= 57 || byte === 45 || byte === 46 || byte === 95 || rfc3986 && byte === 126) {
      result += String.fromCharCode(byte);
    } else if (byte === 32 && !rfc3986) {
      result += "+";
    } else {
      result += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return result;
}

/**
 * PHP's http_build_query($data, $numeric_prefix = '', $arg_separator = null, $encoding_type = PHP_QUERY_RFC1738).
 * Optional parameters also accept an AD-26 options object. Null separator uses PHP's default '&'; recursive edges
 * and null values contribute no pair. Object data uses public properties, excluding PHP's mangled private names.
 */
export function http_build_query(data: unknown, numeric_prefix?: unknown, arg_separator?: unknown, encoding_type?: unknown): string;
export function http_build_query(data: unknown, options?: HttpBuildQueryOptions): string;
export function http_build_query(data: unknown, prefixOrOptions: unknown = "", separator: unknown = null, encoding: unknown = PHP_QUERY_RFC1738): string {
  let prefix = prefixOrOptions;
  if (prefixOrOptions !== null && typeof prefixOrOptions === "object" && (Object.getPrototypeOf(prefixOrOptions) === Object.prototype || Object.getPrototypeOf(prefixOrOptions) === null)) {
    const options = prefixOrOptions as HttpBuildQueryOptions;
    prefix = options.numericPrefix ?? "";
    separator = options.argSeparator ?? null;
    encoding = options.encodingType ?? PHP_QUERY_RFC1738;
  }
  const input = queryValue(data);
  const inputType = phpType(input);
  if (inputType !== "array" && inputType !== "object") {
    throw argumentTypeError("http_build_query", 1, "data", "array", input);
  }
  const numericPrefix = stringParameter("http_build_query", 2, "numeric_prefix", prefix);
  let glue = "&";
  if (separator !== null && separator !== undefined) {
    const converted = toStringArgument(separator);
    if (converted === null) throw argumentTypeError("http_build_query", 3, "arg_separator", "?string", separator);
    glue = converted;
  }
  const rfc3986 = BigInt(intParameter("http_build_query", 4, "encoding_type", encoding)) === 2n;
  const pairs: string[] = [];
  const active = new Set<object>();
  const walk = (container: object, parent: string | null): void => {
    if (active.has(container)) return;
    active.add(container);
    const entries = phpType(container) === "array" ? arrayEntries(container) : objectProps(container).filter(([key]) => !key.startsWith("\0"));
    for (const [key, item] of entries) {
      const path = parent === null ? (typeof key === "string" ? key : numericPrefix + String(key)) : `${parent}[${key}]`;
      const value = queryValue(item);
      const type = phpType(value);
      if (type === "array" || type === "object") {
        walk(value as object, path);
      } else if (type !== "null") {
        pairs.push(`${encode(path, rfc3986)}=${encode(typeof value === "boolean" ? value ? "1" : "0" : toPhpString(value), rfc3986)}`);
      }
    }
    active.delete(container);
  };
  walk(input as object, null);
  return pairs.join(glue);
}
