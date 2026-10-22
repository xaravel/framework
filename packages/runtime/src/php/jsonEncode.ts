// PHP's `json_encode($value, $flags, $depth)` over the AD-9 value model (AD-23.1; Story 9.4's default-flags core,
// decisions/ESC-9.4-1.md part 2, grown by Story 9.8), mirroring PHP 8.5's `ext/json/json_encoder.c` byte for byte.
//
// - Scalars: `null` (and `undefined`), `true`/`false`, an int (a safe-integer `number`, or a `bigint` in exact digits,
//   int64 or beyond), a float (any other `number`, or a marked `PhpFloat`) as `php_gcvt(d, 17, '.', 'e')` at
//   `serialize_precision = -1` (`1.0e+25`, `-0`), `.0` appended under `JSON_PRESERVE_ZERO_FRACTION`.
// - Strings: PHP's escapes (`\/`, `\"`, `\\`, the short escapes, `\u00xx` for other control characters, lower-case
//   `\uXXXX` with surrogate pairs for non-ASCII), the `JSON_HEX_*`, `JSON_UNESCAPED_*` and `JSON_NUMERIC_CHECK` flags.
//   A lone surrogate is PHP's malformed UTF-8: `JSON_INVALID_UTF8_IGNORE` drops it, `_SUBSTITUTE` writes U+FFFD.
// - Arrays (AD-9.2): an `Array` is a list (a hole reads as `null`), a `PhpArray` (its `Symbol.for('xaravel.php.array')`
//   brand) is a list when its keys are exactly `0..n-1` in order and an object otherwise, a plain object is an object.
//   `JSON_FORCE_OBJECT` makes every array an object.
// - Objects: `JsonSerializable` (its `Symbol.for('JsonSerializable')` brand) encodes `jsonSerialize()`'s result, or its
//   properties when the result is the object itself; any other object is a JSON object of its public properties, read
//   as `phpSerialize` reads them (`objectProps`), mangled `\0` names skipped. A function is a `Closure`: `{}`. At the
//   top level only, as Laravel's `Js::encode` and `JsonResponse::setData` do before they call `json_encode`, an
//   `Illuminate\Contracts\Support\Jsonable` returns its `toJson(flags)`, and an `Arrayable` that is not
//   `JsonSerializable` encodes its `toArray()`.
// - Errors, in PHP's order: a symbol (unsupported type), a lone surrogate, `INF`/`NAN`, recursion and nesting deeper
//   than `depth` set PHP's `JSON_ERROR_*` code. The result is then `false`; with `JSON_PARTIAL_OUTPUT_ON_ERROR` the
//   string with PHP's stand-ins; with `JSON_THROW_ON_ERROR` (and without the partial flag) an `Error` with PHP's message
//   and code (ESC-9.8-1 part 1).
// - `json_last_error()` (ESC-9.8-1 part 2): each call records its code through `recordJsonError`, except under
//   `JSON_THROW_ON_ERROR` without the partial flag, as PHP does. The top-level Jsonable hook records nothing: PHP's
//   `json_encode` never runs on that path (Laravel calls `toJson()` instead), so the record is left as it was.
//
// Load safety: the Class Registry imports this file (`writeClassmap`), so it imports only modules that call no Registry
// function at load time, directly or transitively. `casts.ts`, `isNumeric.ts`, `PhpArray.ts`, `PhpFloat.ts`,
// `stdClass.ts`, `phpSerialize.ts` and every class file are therefore out: brands are read by `Symbol.for` key.
import { gcvt } from "./gcvt";
import { hasBrand } from "./hasBrand";
import {
  JSON_ERROR_DEPTH,
  JSON_ERROR_INF_OR_NAN,
  JSON_ERROR_RECURSION,
  JSON_ERROR_UNSUPPORTED_TYPE,
  JSON_ERROR_UTF8,
  JSON_FORCE_OBJECT,
  JSON_HEX_AMP,
  JSON_HEX_APOS,
  JSON_HEX_QUOT,
  JSON_HEX_TAG,
  JSON_INVALID_UTF8_IGNORE,
  JSON_INVALID_UTF8_SUBSTITUTE,
  JSON_NUMERIC_CHECK,
  JSON_PARTIAL_OUTPUT_ON_ERROR,
  JSON_PRESERVE_ZERO_FRACTION,
  JSON_PRETTY_PRINT,
  JSON_THROW_ON_ERROR,
  JSON_UNESCAPED_LINE_TERMINATORS,
  JSON_UNESCAPED_SLASHES,
  JSON_UNESCAPED_UNICODE,
  jsonError,
  recordJsonError,
} from "./jsonConstants";
import { objectProps } from "./mangle";
import { parseNumeric } from "./numericString";

const HEX = "0123456789abcdef";

const PHP_ARRAY = Symbol.for("xaravel.php.array");
const PHP_FLOAT = Symbol.for("xaravel.php.float");
const JSONABLE = Symbol.for("Illuminate\\Contracts\\Support\\Jsonable");
const ARRAYABLE = Symbol.for("Illuminate\\Contracts\\Support\\Arrayable");
const JSON_SERIALIZABLE = Symbol.for("JsonSerializable");

/** `php_json_encoder` plus the output buffer. */
interface Encoder {
  readonly flags: number;
  readonly maxDepth: number;
  depth: number;
  error: number;
  out: string;
  /** The arrays and objects being encoded (PHP's recursion protection). */
  readonly path: Set<object>;
}

/** A key of a container's entry: an int key as a `number` or `bigint`, else a string. */
type Key = number | bigint | string;

/**
 * PHP's `json_encode($value, $flags, $depth)`: the JSON text PHP writes for the same value, `false` on an error
 * (the partial text under `JSON_PARTIAL_OUTPUT_ON_ERROR`). Under `JSON_THROW_ON_ERROR` without the partial flag, an
 * error throws an `Error` with PHP's message and `JSON_ERROR_*` code. An exception `jsonSerialize()`, `toJson()` or
 * `toArray()` throws propagates.
 */
export function jsonEncode(value: unknown, flags: number = 0, depth: number = 512): string | false {
  let data = value;
  if (typeof data === "object" && data !== null) {
    // Laravel's top-level hooks (Js::encode, JsonResponse::setData); PHP's json_encode knows neither.
    if (hasBrand(data, JSONABLE)) {
      const json: unknown = (data as { toJson: (options: number) => unknown }).toJson(flags);
      if (typeof json !== "string") {
        throw new TypeError("jsonEncode(): a Jsonable's toJson() must return a string");
      }
      return json;
    }
    if (hasBrand(data, ARRAYABLE) && !hasBrand(data, JSON_SERIALIZABLE)) {
      data = (data as { toArray: () => unknown }).toArray();
    }
  }
  const encoder: Encoder = { flags, maxDepth: depth, depth: 0, error: 0, out: "", path: new Set() };
  const records = (flags & JSON_THROW_ON_ERROR) === 0 || (flags & JSON_PARTIAL_OUTPUT_ON_ERROR) !== 0;
  try {
    encodeValue(data, encoder);
  } catch (error) {
    // PHP records the encoder's code before a `jsonSerialize()` exception propagates.
    if (records) {
      recordJsonError(encoder.error);
    }
    throw error;
  }
  if (records) {
    recordJsonError(encoder.error);
    if (encoder.error !== 0 && (flags & JSON_PARTIAL_OUTPUT_ON_ERROR) === 0) {
      return false;
    }
  } else if (encoder.error !== 0) {
    throw jsonError(encoder.error);
  }
  return encoder.out;
}

/** `php_json_encode_zval`: false on a failure that stops encoding unless the partial flag is set. */
function encodeValue(value: unknown, encoder: Encoder): boolean {
  switch (typeof value) {
    case "undefined":
      encoder.out += "null";
      return true;
    case "boolean":
      encoder.out += value ? "true" : "false";
      return true;
    case "number":
      if (Number.isSafeInteger(value) && !Object.is(value, -0)) {
        encoder.out += String(value);
      } else {
        encodeDouble(value, encoder);
      }
      return true;
    case "bigint":
      encoder.out += value.toString();
      return true;
    case "string":
      return encodeString(value, encoder.flags, encoder);
    case "function":
      // A Closure: an object without properties.
      return encodeContainer(value, [], false, true, encoder);
    case "object":
      break;
    default:
      return unsupported(encoder);
  }
  if (value === null) {
    encoder.out += "null";
    return true;
  }
  const record = value as Record<symbol, unknown>;
  if (record[PHP_FLOAT] === true) {
    encodeDouble(Number(value), encoder);
    return true;
  }
  if (Array.isArray(value)) {
    const entries: [Key, unknown][] = [];
    for (let index = 0; index < value.length; index++) {
      entries.push([index, value[index] as unknown]);
    }
    return encodeContainer(value, entries, true, false, encoder);
  }
  if (record[PHP_ARRAY] === true) {
    const entries = [...(value as Iterable<readonly [Key, unknown]>)].map(([key, item]): [Key, unknown] => [key, item]);
    return encodeContainer(
      value,
      entries,
      entries.every(([key], index) => key === index),
      false,
      encoder,
    );
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype === Object.prototype || prototype === null) {
    const entries = Object.keys(value).map((key): [Key, unknown] => [key, (value as Record<string, unknown>)[key]]);
    return encodeContainer(value, entries, false, false, encoder);
  }
  if (hasBrand(value, JSON_SERIALIZABLE)) {
    return encodeSerializable(value, encoder);
  }
  return encodeContainer(value, objectProps(value), false, true, encoder);
}

/** `php_json_encode_serializable_object`. */
function encodeSerializable(o: object, encoder: Encoder): boolean {
  if (encoder.path.has(o)) {
    encoder.error = JSON_ERROR_RECURSION;
    if ((encoder.flags & JSON_PARTIAL_OUTPUT_ON_ERROR) !== 0) {
      encoder.out += "null";
    }
    return false;
  }
  const method: unknown = (o as { jsonSerialize?: unknown }).jsonSerialize;
  if (typeof method !== "function") {
    throw new TypeError("jsonEncode(): an object branded JsonSerializable has no jsonSerialize() method");
  }
  encoder.path.add(o);
  let result: unknown;
  try {
    result = (method as () => unknown).call(o);
  } catch (error) {
    encoder.path.delete(o);
    throw error;
  }
  if (result === o) {
    // `return $this;`: straight to the object's properties.
    encoder.path.delete(o);
    return encodeContainer(o, objectProps(o), false, true, encoder);
  }
  const ok = encodeValue(result, encoder);
  encoder.path.delete(o);
  return ok;
}

/**
 * `php_json_encode_array` over `entries`: a JSON list when `list` (and not `JSON_FORCE_OBJECT`), else a JSON object.
 * `isObject` marks a PHP object, whose mangled (`\0`-prefixed) names are skipped and which `JSON_FORCE_OBJECT` does not
 * change.
 */
function encodeContainer(container: object, entries: readonly (readonly [Key, unknown])[], list: boolean, isObject: boolean, encoder: Encoder): boolean {
  const flags = encoder.flags;
  const asList = list && !isObject && (flags & JSON_FORCE_OBJECT) === 0;
  if (encoder.path.has(container)) {
    encoder.error = JSON_ERROR_RECURSION;
    encoder.out += "null";
    return false;
  }
  encoder.path.add(container);
  encoder.out += asList ? "[" : "{";
  encoder.depth++;
  let needComma = false;
  for (const [key, item] of entries) {
    if (!asList && isObject && typeof key === "string" && key.startsWith("\0")) {
      // Protected and private members.
      continue;
    }
    if (needComma) {
      encoder.out += ",";
    } else {
      needComma = true;
    }
    prettyNewline(encoder);
    if (!asList) {
      if (typeof key === "string") {
        if (!encodeString(key, flags & ~JSON_NUMERIC_CHECK, encoder) && (flags & JSON_PARTIAL_OUTPUT_ON_ERROR) !== 0) {
          encoder.out = `${encoder.out.slice(0, -4)}""`;
        }
      } else {
        encoder.out += `"${key.toString()}"`;
      }
      encoder.out += (flags & JSON_PRETTY_PRINT) !== 0 ? ": " : ":";
    }
    if (!encodeValue(item, encoder) && (flags & JSON_PARTIAL_OUTPUT_ON_ERROR) === 0) {
      encoder.path.delete(container);
      return false;
    }
  }
  encoder.path.delete(container);
  if (encoder.depth > encoder.maxDepth) {
    encoder.error = JSON_ERROR_DEPTH;
    if ((flags & JSON_PARTIAL_OUTPUT_ON_ERROR) === 0) {
      return false;
    }
  }
  encoder.depth--;
  // Only an empty array or object keeps its closing bracket on the same line.
  if (needComma) {
    prettyNewline(encoder);
  }
  encoder.out += asList ? "]" : "}";
  return true;
}

/** `php_json_pretty_print_char('\n')` and `php_json_pretty_print_indent`: a newline and 4 spaces per level. */
function prettyNewline(encoder: Encoder): void {
  if ((encoder.flags & JSON_PRETTY_PRINT) !== 0) {
    encoder.out += `\n${"    ".repeat(encoder.depth)}`;
  }
}

function unsupported(encoder: Encoder): boolean {
  encoder.error = JSON_ERROR_UNSUPPORTED_TYPE;
  if ((encoder.flags & JSON_PARTIAL_OUTPUT_ON_ERROR) !== 0) {
    encoder.out += "null";
  }
  return false;
}

/** `php_json_encode_double`, or `0` and `JSON_ERROR_INF_OR_NAN` for a value that is not finite (encoding goes on). */
function encodeDouble(d: number, encoder: Encoder): void {
  if (!Number.isFinite(d)) {
    encoder.error = JSON_ERROR_INF_OR_NAN;
    encoder.out += "0";
    return;
  }
  encoder.out += formatDouble(d, encoder.flags);
}

function formatDouble(d: number, flags: number): string {
  const text = gcvt(d, "e");
  return (flags & JSON_PRESERVE_ZERO_FRACTION) !== 0 && !text.includes(".") && !text.includes("e") ? `${text}.0` : text;
}

/**
 * `php_json_escape_string`. On a lone surrogate (PHP's malformed UTF-8) without an `INVALID_UTF8` flag it rewinds the
 * string, sets `JSON_ERROR_UTF8`, writes `null` under the partial flag and returns false.
 */
function encodeString(s: string, flags: number, encoder: Encoder): boolean {
  if (s === "") {
    encoder.out += '""';
    return true;
  }
  if ((flags & JSON_NUMERIC_CHECK) !== 0) {
    const numeric = parseNumeric(s, false);
    if (numeric !== null) {
      if (numeric.int !== null) {
        encoder.out += numeric.int.toString();
        return true;
      }
      if (Number.isFinite(numeric.float)) {
        encoder.out += formatDouble(numeric.float, flags);
        return true;
      }
    }
  }
  const unescapedUnicode = (flags & JSON_UNESCAPED_UNICODE) !== 0;
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const unit = s.charCodeAt(i);
    if (unit < 0x80) {
      out += escapeAscii(unit, s[i] as string, flags);
      continue;
    }
    let point = unit;
    if (unit >= 0xd800 && unit <= 0xdfff) {
      const low = unit <= 0xdbff && i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (low < 0xdc00 || low > 0xdfff) {
        if ((flags & JSON_INVALID_UTF8_IGNORE) !== 0) {
          continue;
        }
        if ((flags & JSON_INVALID_UTF8_SUBSTITUTE) !== 0) {
          out += unescapedUnicode ? "\ufffd" : "\\ufffd";
          continue;
        }
        encoder.error = JSON_ERROR_UTF8;
        if ((flags & JSON_PARTIAL_OUTPUT_ON_ERROR) !== 0) {
          encoder.out += "null";
        }
        return false;
      }
      point = 0x10000 + ((unit - 0xd800) << 10) + (low - 0xdc00);
    }
    if (unescapedUnicode && ((flags & JSON_UNESCAPED_LINE_TERMINATORS) !== 0 || point < 0x2028 || point > 0x2029)) {
      out += String.fromCodePoint(point);
    } else if (point >= 0x10000) {
      out += hex4(unit) + hex4(s.charCodeAt(i + 1));
    } else {
      out += hex4(unit);
    }
    if (point >= 0x10000) {
      i++;
    }
  }
  encoder.out += `${out}"`;
  return true;
}

/** One ASCII character as `php_json_escape_string` writes it. */
function escapeAscii(unit: number, char: string, flags: number): string {
  switch (unit) {
    case 0x22:
      return (flags & JSON_HEX_QUOT) !== 0 ? "\\u0022" : '\\"';
    case 0x5c:
      return "\\\\";
    case 0x2f:
      return (flags & JSON_UNESCAPED_SLASHES) !== 0 ? "/" : "\\/";
    case 0x08:
      return "\\b";
    case 0x0c:
      return "\\f";
    case 0x0a:
      return "\\n";
    case 0x0d:
      return "\\r";
    case 0x09:
      return "\\t";
    case 0x3c:
      return (flags & JSON_HEX_TAG) !== 0 ? "\\u003C" : "<";
    case 0x3e:
      return (flags & JSON_HEX_TAG) !== 0 ? "\\u003E" : ">";
    case 0x26:
      return (flags & JSON_HEX_AMP) !== 0 ? "\\u0026" : "&";
    case 0x27:
      return (flags & JSON_HEX_APOS) !== 0 ? "\\u0027" : "'";
    default:
      return unit < 0x20 ? hex4(unit) : char;
  }
}

/** `\uXXXX` with lower-case hex digits. */
function hex4(unit: number): string {
  return `\\u${HEX[(unit >> 12) & 0xf]}${HEX[(unit >> 8) & 0xf]}${HEX[(unit >> 4) & 0xf]}${HEX[unit & 0xf]}`;
}
