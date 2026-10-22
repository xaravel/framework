// PHP's `JSON_*` constants (Story 9.8, AD-23.1), with PHP 8.5's values (`ext/json/php_json.h`): the flags of
// `jsonEncode` / `jsonDecode` and the `JSON_ERROR_*` codes a JSON error carries. It imports nothing.

/** `json_encode`: `<` and `>` as `\u003C` and `\u003E`. */
export const JSON_HEX_TAG = 1;
/** `json_encode`: `&` as `\u0026`. */
export const JSON_HEX_AMP = 2;
/** `json_encode`: `'` as `\u0027`. */
export const JSON_HEX_APOS = 4;
/** `json_encode`: `"` as `\u0022`. */
export const JSON_HEX_QUOT = 8;
/** `json_encode`: every array as an object. */
export const JSON_FORCE_OBJECT = 16;
/** `json_encode`: a numeric string as a number. */
export const JSON_NUMERIC_CHECK = 32;
/** `json_encode`: `/` unescaped. */
export const JSON_UNESCAPED_SLASHES = 64;
/** `json_encode`: 4-space indentation and `": "`. */
export const JSON_PRETTY_PRINT = 128;
/** `json_encode`: non-ASCII characters unescaped. */
export const JSON_UNESCAPED_UNICODE = 256;
/** `json_encode`: a stand-in for each value that cannot be encoded, instead of `false`. */
export const JSON_PARTIAL_OUTPUT_ON_ERROR = 512;
/** `json_encode`: `.0` after an integral float. */
export const JSON_PRESERVE_ZERO_FRACTION = 1024;
/** `json_encode`: U+2028 and U+2029 unescaped under `JSON_UNESCAPED_UNICODE`. */
export const JSON_UNESCAPED_LINE_TERMINATORS = 2048;
/** `json_decode`: objects as arrays (when `associative` is null). */
export const JSON_OBJECT_AS_ARRAY = 1;
/** `json_decode`: an int beyond int64 as its digit string. */
export const JSON_BIGINT_AS_STRING = 2;
/** Both: invalid UTF-8 (a lone surrogate) dropped. */
export const JSON_INVALID_UTF8_IGNORE = 1048576;
/** Both: invalid UTF-8 (a lone surrogate) replaced with U+FFFD. */
export const JSON_INVALID_UTF8_SUBSTITUTE = 2097152;
/** Both: throw on an error instead of returning `false` / `null`. */
export const JSON_THROW_ON_ERROR = 4194304;

export const JSON_ERROR_NONE = 0;
export const JSON_ERROR_DEPTH = 1;
export const JSON_ERROR_STATE_MISMATCH = 2;
export const JSON_ERROR_CTRL_CHAR = 3;
export const JSON_ERROR_SYNTAX = 4;
export const JSON_ERROR_UTF8 = 5;
export const JSON_ERROR_RECURSION = 6;
export const JSON_ERROR_INF_OR_NAN = 7;
export const JSON_ERROR_UNSUPPORTED_TYPE = 8;
export const JSON_ERROR_INVALID_PROPERTY_NAME = 9;
export const JSON_ERROR_UTF16 = 10;
export const JSON_ERROR_NON_BACKED_ENUM = 11;

/** `php_json_get_error_msg`: the message of each `JSON_ERROR_*` code. Internal: the package does not export it. */
export const JSON_ERROR_MESSAGES: Readonly<Record<number, string>> = {
  [JSON_ERROR_NONE]: "No error",
  [JSON_ERROR_DEPTH]: "Maximum stack depth exceeded",
  [JSON_ERROR_STATE_MISMATCH]: "State mismatch (invalid or malformed JSON)",
  [JSON_ERROR_CTRL_CHAR]: "Control character error, possibly incorrectly encoded",
  [JSON_ERROR_SYNTAX]: "Syntax error",
  [JSON_ERROR_UTF8]: "Malformed UTF-8 characters, possibly incorrectly encoded",
  [JSON_ERROR_RECURSION]: "Recursion detected",
  [JSON_ERROR_INF_OR_NAN]: "Inf and NaN cannot be JSON encoded",
  [JSON_ERROR_UNSUPPORTED_TYPE]: "Type is not supported",
  [JSON_ERROR_INVALID_PROPERTY_NAME]: "The decoded property name is invalid",
  [JSON_ERROR_UTF16]: "Single unpaired UTF-16 surrogate in unicode escape",
  [JSON_ERROR_NON_BACKED_ENUM]: "Non-backed enums have no default serialization",
};

/**
 * The error a JSON function throws under `JSON_THROW_ON_ERROR`: an `Error` with PHP's message and the `JSON_ERROR_*`
 * code as its `code`. PHP throws a `JsonException`, which Story 9.10 ports (ESC-9.8-1 part 1, DIV-9.8). Internal.
 */
export function jsonError(code: number): Error {
  const error = new Error(JSON_ERROR_MESSAGES[code] ?? "Unknown error");
  Object.defineProperty(error, "code", { value: code, enumerable: true, writable: true, configurable: true });
  return error;
}

/** Where a JSON call's error code goes: `jsonLastError.ts` installs it on load (ESC-9.8-1 part 2). */
let recorder: ((code: number) => void) | null = null;

/**
 * Installs the recorder of `json_last_error()` (ESC-9.8-1 part 2). `jsonLastError.ts` calls it on load, so this
 * load-safe module, which `jsonEncode.ts` imports, never imports the Scope Frame module (the Registry imports the
 * encoder, and the scope module imports the Registry). Process wiring, not per-unit state: the record itself is a
 * Scope Frame slot (AD-5). Internal.
 */
export function installJsonErrorRecorder(record: (code: number) => void): void {
  if (recorder !== null) {
    throw new TypeError("installJsonErrorRecorder(): the json_last_error() recorder is already installed");
  }
  recorder = record;
}

/** Records a JSON call's `JSON_ERROR_*` code, as PHP sets `JSON_G(error_code)`. Internal. */
export function recordJsonError(code: number): void {
  recorder?.(code);
}
