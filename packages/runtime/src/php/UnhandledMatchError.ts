// PHP's `UnhandledMatchError` and the error a `match` with no matching arm throws (action item
// epic-14-item-7-runtime-match-error-dynamic-call, ESC-14.2-6), ports of PHP 8.5.11's `Zend/zend_execute.c`
// (`zend_match_unhandled_error`) and `Zend/zend_smart_str.c` (`smart_str_append_scalar`, `smart_str_append_double`,
// `smart_str_append_escaped_truncated`) at PHP's defaults, `precision` 14 and `exception_string_param_max_len` 15.
// A port writes `throw unhandledMatch(subject)` where PHP's `match` has no `default` arm and no arm matches.
//
// The class is not on `Symbol.for('xaravel.php.classes')`, the grader's map of root throwables (`phpClasses.ts`).
import { isContractToken, registerClass } from "../registry/registry";
import { isClassConstructor } from "./Closure";
import { Error } from "./Error";
import { LONE_SURROGATE, utf8 } from "./mangle";
import { getDebugType, phpType } from "./phpType";
import { formatFloat } from "./scalarString";
import { stringOf } from "./typeTests";

/** PHP's `exception_string_param_max_len` default: the bytes of a string subject the message keeps. */
const STRING_MAX_LEN = 15;

/** The escapes `smart_str_append_escaped` writes for a byte, beside `\xHH`. */
const ESCAPES: Readonly<Record<number, string>> = { 9: "\\t", 10: "\\n", 11: "\\v", 12: "\\f", 13: "\\r", 27: "\\e", 92: "\\\\" };

/** `smart_str_append_escaped_truncated`: the first `STRING_MAX_LEN` UTF-8 bytes of `s`, escaped, `...` when cut. */
function escapedTruncated(s: string): string {
  if (LONE_SURROGATE.test(s)) {
    throw new TypeError("unhandledMatch(): the string holds a lone surrogate, which has no UTF-8 form");
  }
  const bytes = utf8.encode(s);
  let out = "";
  for (const byte of bytes.subarray(0, STRING_MAX_LEN)) {
    const escape = ESCAPES[byte];
    if (escape !== undefined) {
      out += escape;
    } else if (byte < 32 || byte > 126) {
      out += `\\x${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    } else {
      out += String.fromCharCode(byte);
    }
  }
  return bytes.length > STRING_MAX_LEN ? `${out}...` : out;
}

/** The subject as `zend_match_unhandled_error` renders it. */
function subjectText(subject: unknown): string {
  if (typeof subject === "string" || isContractToken(subject) || isClassConstructor(subject)) {
    return `'${escapedTruncated(stringOf(subject))}'`;
  }
  switch (phpType(subject)) {
    case "null":
      return "NULL";
    case "bool":
      return subject === true ? "true" : "false";
    case "int":
      return String(subject);
    case "float": {
      const value = typeof subject === "number" ? subject : Number(subject);
      const text = formatFloat(value);
      return Number.isFinite(value) && !text.includes(".") ? `${text}.0` : text;
    }
    default:
      return `of type ${getDebugType(subject)}`;
  }
}

/**
 * The `UnhandledMatchError` PHP's `match` throws when no arm matches `subject`, returned, not thrown:
 * `Unhandled match case ` and the subject as PHP renders it. `null` (and `undefined`) is `NULL`, a bool `true` /
 * `false`, an int in decimal, a float as PHP's `(string)` gives it with `.0` added when it is finite and has no `.`
 * (`1.0`, `-0.0`, `1.0E+20`), a string quoted with `'` with at most its first 15 UTF-8 bytes escaped (`\n`, `\r`,
 * `\t`, `\f`, `\v`, `\e`, `\\`, any other byte outside 32..126 `\xHH`) and `...` when it is longer; a class constructor
 * or a contract token is its class-string. An array is `of type array`, an object `of type <get_debug_type>`. A symbol
 * or a `bigint` outside int64, no PHP value, throws the runtime's JS `TypeError`, as `phpType` does, and so does a
 * string holding a lone surrogate, which has no UTF-8 form.
 */
export function unhandledMatch(subject: unknown): UnhandledMatchError {
  return new UnhandledMatchError(`Unhandled match case ${subjectText(subject)}`);
}

/** PHP's `UnhandledMatchError`: what a `match` with no matching arm throws. */
export class UnhandledMatchError extends Error {}

registerClass("UnhandledMatchError", UnhandledMatchError);
