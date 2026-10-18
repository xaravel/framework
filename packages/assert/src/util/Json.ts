// PHP 8.5's `json_decode`/`json_validate`/`json_encode` as PHPUnit 13.4.3's
// `PHPUnit\Util\Json` and the JSON constraints use them (Story 4.4).
// Internal to the grader.
//
// The decoder follows ext/json's scanner and parser: the same grammar, the
// same first error in input order (depth 512, a control character, a syntax
// error, a mismatched bracket, a lone UTF-16 surrogate escape, malformed
// UTF-8, which a JS string can hold only as a lone surrogate; depth 512
// admits 511 nested levels), and the same
// values: an int outside int64 is a float, a JSON object is a `stdClass`
// whose repeated key keeps its first position. Ints are `bigint`s here, so
// no digit is lost before the value is encoded again.
//
// The encoder writes `json_encode`'s forms: `serialize_precision = -1`
// floats (`1.0` is `1`, `1e25` is `1.0e+25`, `-0.0` is `-0`), `\/` and
// `\uXXXX` escapes by default, and `JSON_PRETTY_PRINT`'s four-space layout.

export const JSON_ERROR_NONE = 0;
export const JSON_ERROR_DEPTH = 1;
export const JSON_ERROR_STATE_MISMATCH = 2;
export const JSON_ERROR_CTRL_CHAR = 3;
export const JSON_ERROR_SYNTAX = 4;
export const JSON_ERROR_UTF8 = 5;
export const JSON_ERROR_INF_OR_NAN = 7;
export const JSON_ERROR_INVALID_PROPERTY_NAME = 9;
export const JSON_ERROR_UTF16 = 10;

/** A JSON int (PHP int). */
export class JsonInt {
  constructor(readonly value: bigint) {}
}

/** A JSON float (PHP float). */
export class JsonFloat {
  constructor(readonly value: number) {}
}

/** A decoded JSON object (PHP `stdClass`): properties in insertion order. */
export class JsonObject {
  readonly properties = new Map<string, JsonValue>();
}

export type JsonValue = null | boolean | string | JsonInt | JsonFloat | JsonValue[] | JsonObject;

export type DecodeResult = { readonly error: number; readonly value: null } | { readonly error: 0; readonly value: JsonValue };

const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;

type Token =
  | { kind: "{" | "}" | "[" | "]" | ":" | "," | "eoi" }
  | { kind: "value"; value: JsonValue }
  | { kind: "string"; value: string }
  | { kind: "error"; code: number };

class Scanner {
  private position = 0;

  constructor(private readonly text: string) {}

  next(): Token {
    const text = this.text;
    for (;;) {
      if (this.position >= text.length) {
        return { kind: "eoi" };
      }
      const char = text[this.position]!;
      if (char === " " || char === "\t" || char === "\n" || char === "\r") {
        this.position++;
        continue;
      }
      switch (char) {
        case "{":
        case "}":
        case "[":
        case "]":
        case ":":
        case ",":
          this.position++;
          return { kind: char };
        case '"':
          this.position++;
          return this.string();
        default:
          break;
      }
      for (const [literal, value] of [
        ["null", null],
        ["true", true],
        ["false", false],
      ] as const) {
        if (text.startsWith(literal, this.position)) {
          this.position += literal.length;
          return { kind: "value", value };
        }
      }
      const number = /-?(?:0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/y;
      number.lastIndex = this.position;
      const match = number.exec(text);
      if (match !== null) {
        this.position = number.lastIndex;
        return { kind: "value", value: numberValue(match[0], match[1] !== undefined || match[2] !== undefined) };
      }
      const code = char.charCodeAt(0);
      if (code < 0x20) {
        return { kind: "error", code: JSON_ERROR_CTRL_CHAR };
      }
      return { kind: "error", code: isLoneSurrogateAt(text, this.position) ? JSON_ERROR_UTF8 : JSON_ERROR_SYNTAX };
    }
  }

  private string(): Token {
    const text = this.text;
    let value = "";
    for (;;) {
      if (this.position >= text.length) {
        // The terminating NUL byte, inside a string: a control character.
        return { kind: "error", code: JSON_ERROR_CTRL_CHAR };
      }
      const char = text[this.position]!;
      const code = char.charCodeAt(0);
      if (char === '"') {
        this.position++;
        return { kind: "string", value };
      }
      if (code < 0x20) {
        return { kind: "error", code: JSON_ERROR_CTRL_CHAR };
      }
      if (char === "\\") {
        const escaped = text[this.position + 1];
        const simple: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        if (escaped !== undefined && Object.hasOwn(simple, escaped)) {
          value += simple[escaped]!;
          this.position += 2;
          continue;
        }
        if (escaped === "u") {
          const unit = hex4(text, this.position + 2);
          if (unit === null) {
            return { kind: "error", code: JSON_ERROR_SYNTAX };
          }
          if (unit >= 0xd800 && unit <= 0xdbff) {
            const low = text.startsWith("\\u", this.position + 6) ? hex4(text, this.position + 8) : null;
            if (low !== null && low >= 0xdc00 && low <= 0xdfff) {
              value += String.fromCharCode(unit, low);
              this.position += 12;
              continue;
            }
            return { kind: "error", code: JSON_ERROR_UTF16 };
          }
          if (unit >= 0xdc00 && unit <= 0xdfff) {
            return { kind: "error", code: JSON_ERROR_UTF16 };
          }
          value += String.fromCharCode(unit);
          this.position += 6;
          continue;
        }
        return { kind: "error", code: JSON_ERROR_SYNTAX };
      }
      if (isLoneSurrogateAt(text, this.position)) {
        return { kind: "error", code: JSON_ERROR_UTF8 };
      }
      const width = code >= 0xd800 && code <= 0xdbff ? 2 : 1;
      value += text.slice(this.position, this.position + width);
      this.position += width;
    }
  }
}

function hex4(text: string, at: number): number | null {
  const digits = text.slice(at, at + 4);
  return /^[0-9a-fA-F]{4}$/.test(digits) ? Number.parseInt(digits, 16) : null;
}

function isLoneSurrogateAt(text: string, at: number): boolean {
  const code = text.charCodeAt(at);
  if (code >= 0xd800 && code <= 0xdbff) {
    const next = text.charCodeAt(at + 1);
    return !(next >= 0xdc00 && next <= 0xdfff);
  }
  return code >= 0xdc00 && code <= 0xdfff;
}

function numberValue(text: string, isFloat: boolean): JsonValue {
  if (!isFloat) {
    const big = BigInt(text);
    if (big >= INT64_MIN && big <= INT64_MAX) {
      return new JsonInt(big);
    }
  }
  return new JsonFloat(Number(text));
}

class JsonError extends Error {
  constructor(readonly code: number) {
    super(`json error ${code}`);
  }
}

class Parser {
  private readonly scanner: Scanner;
  private depth = 0;

  constructor(
    text: string,
    private readonly maxDepth: number,
    private readonly objects: boolean,
  ) {
    this.scanner = new Scanner(text);
  }

  parse(): JsonValue {
    const value = this.value(this.token());
    const end = this.token();
    if (end.kind !== "eoi") {
      throw new JsonError(JSON_ERROR_SYNTAX);
    }
    return value;
  }

  private token(): Token {
    const token = this.scanner.next();
    if (token.kind === "error") {
      throw new JsonError(token.code);
    }
    return token;
  }

  private value(token: Token): JsonValue {
    switch (token.kind) {
      case "value":
      case "string":
        return token.value;
      case "{":
        return this.object();
      case "[":
        return this.array();
      default:
        throw new JsonError(JSON_ERROR_SYNTAX);
    }
  }

  /** ext/json's depth check: `depth` admits at most `depth - 1` nested arrays and objects (probed 2026-10-18). */
  private enter(): void {
    if (++this.depth >= this.maxDepth) {
      throw new JsonError(JSON_ERROR_DEPTH);
    }
  }

  private object(): JsonValue {
    this.enter();
    const object = new JsonObject();
    let token = this.token();
    if (token.kind !== "}" && token.kind !== "]") {
      for (;;) {
        if (token.kind !== "string") {
          throw new JsonError(JSON_ERROR_SYNTAX);
        }
        const key = token.value;
        if (this.token().kind !== ":") {
          throw new JsonError(JSON_ERROR_SYNTAX);
        }
        const item = this.value(this.token());
        if (this.objects && key.startsWith("\0")) {
          throw new JsonError(JSON_ERROR_INVALID_PROPERTY_NAME);
        }
        object.properties.set(key, item);
        token = this.token();
        if (token.kind === ",") {
          token = this.token();
          continue;
        }
        break;
      }
    }
    if (token.kind === "]") {
      throw new JsonError(JSON_ERROR_STATE_MISMATCH);
    }
    if (token.kind !== "}") {
      throw new JsonError(JSON_ERROR_SYNTAX);
    }
    this.depth--;
    return object;
  }

  private array(): JsonValue {
    this.enter();
    const list: JsonValue[] = [];
    let token = this.token();
    if (token.kind !== "]" && token.kind !== "}") {
      for (;;) {
        list.push(this.value(token));
        token = this.token();
        if (token.kind === ",") {
          token = this.token();
          continue;
        }
        break;
      }
    }
    if (token.kind === "}") {
      throw new JsonError(JSON_ERROR_STATE_MISMATCH);
    }
    if (token.kind !== "]") {
      throw new JsonError(JSON_ERROR_SYNTAX);
    }
    this.depth--;
    return list;
  }
}

/** `json_decode($json)` (objects as `stdClass`, depth 512): the value, or the error `json_last_error()` reports. */
export function jsonDecode(json: string, depth = 512): DecodeResult {
  try {
    return { error: 0, value: new Parser(json, depth, true).parse() };
  } catch (error) {
    if (error instanceof JsonError) {
      return { error: error.code, value: null };
    }
    throw error;
  }
}

/** `json_validate($json)`; the error code is what `json_last_error()` then reports. */
export function jsonValidate(json: string, depth = 512): number {
  try {
    new Parser(json, depth, false).parse();
    return JSON_ERROR_NONE;
  } catch (error) {
    if (error instanceof JsonError) {
      return error.code;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Encoding

export interface EncodeOptions {
  readonly prettyPrint?: boolean;
  readonly unescapedSlashes?: boolean;
  readonly unescapedUnicode?: boolean;
}

/** PHP's `php_gcvt($value, 17, '.', 'e')` with `serialize_precision = -1`: the shortest round-trip digits. */
export function encodeDouble(value: number): string {
  const sign = value < 0 || Object.is(value, -0) ? "-" : "";
  const [mantissa, exponent] = Math.abs(value).toExponential().split("e") as [string, string];
  const digits = mantissa.replace(".", "");
  let decpt = Number(exponent) + 1;
  if (decpt < 0 ? decpt < -3 : decpt > 17) {
    decpt--;
    const negative = decpt < 0;
    return `${sign}${digits[0]}.${digits.length > 1 ? digits.slice(1) : "0"}e${negative ? "-" : "+"}${Math.abs(decpt)}`;
  }
  if (decpt < 0) {
    return `${sign}0.${"0".repeat(-decpt)}${digits}`;
  }
  const whole = digits.length >= decpt ? digits.slice(0, decpt) : digits + "0".repeat(decpt - digits.length);
  const fraction = digits.slice(decpt);
  return `${sign}${whole === "" ? "0" : whole}${fraction === "" ? "" : `.${fraction}`}`;
}

function encodeString(value: string, options: EncodeOptions): string {
  let out = '"';
  for (const char of value) {
    const code = char.codePointAt(0)!;
    switch (char) {
      case '"':
        out += '\\"';
        continue;
      case "\\":
        out += "\\\\";
        continue;
      case "/":
        out += options.unescapedSlashes === true ? "/" : "\\/";
        continue;
      case "\b":
        out += "\\b";
        continue;
      case "\f":
        out += "\\f";
        continue;
      case "\n":
        out += "\\n";
        continue;
      case "\r":
        out += "\\r";
        continue;
      case "\t":
        out += "\\t";
        continue;
      default:
        break;
    }
    if (code < 0x20) {
      out += `\\u${code.toString(16).padStart(4, "0")}`;
    } else if (code < 0x80 || (options.unescapedUnicode === true && code !== 0x2028 && code !== 0x2029)) {
      out += char;
    } else {
      for (let i = 0; i < char.length; i++) {
        out += `\\u${char.charCodeAt(i).toString(16).padStart(4, "0")}`;
      }
    }
  }
  return `${out}"`;
}

class EncodeError extends Error {
  constructor(readonly code: number) {
    super(`json encode error ${code}`);
  }
}

function encodeValue(value: JsonValue, options: EncodeOptions, depth: number): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "string") {
    return encodeString(value, options);
  }
  if (value instanceof JsonInt) {
    return value.value.toString();
  }
  if (value instanceof JsonFloat) {
    if (!Number.isFinite(value.value)) {
      throw new EncodeError(JSON_ERROR_INF_OR_NAN);
    }
    return encodeDouble(value.value);
  }
  const pretty = options.prettyPrint === true;
  const newline = pretty ? "\n" : "";
  const indent = pretty ? "    ".repeat(depth + 1) : "";
  const closing = pretty ? "    ".repeat(depth) : "";
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    return `[${newline}${value.map((item) => indent + encodeValue(item, options, depth + 1)).join(`,${newline}`)}${newline}${closing}]`;
  }
  if (value.properties.size === 0) {
    return "{}";
  }
  const members = [...value.properties].map(([key, item]) => `${indent}${encodeString(key, options)}:${pretty ? " " : ""}${encodeValue(item, options, depth + 1)}`);
  return `{${newline}${members.join(`,${newline}`)}${newline}${closing}}`;
}

/** `json_encode($value, $flags)`: the text, or null when PHP's returns false (an INF or NAN float). */
export function jsonEncode(value: JsonValue, options: EncodeOptions = {}): string | null {
  try {
    return encodeValue(value, options, 0);
  } catch (error) {
    if (error instanceof EncodeError) {
      return null;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// PHPUnit\Util\Json

/** Byte-wise comparison of two keys' UTF-8 forms, as `ksort($a, SORT_STRING)` compares them. */
function compareKeys(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function recursiveSort(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(recursiveSort);
  }
  if (value instanceof JsonObject) {
    const sorted = new JsonObject();
    for (const key of [...value.properties.keys()].sort(compareKeys)) {
      sorted.properties.set(key, recursiveSort(value.properties.get(key)!));
    }
    return sorted;
  }
  return value;
}

/** `Json::canonicalize`: `[true, null]` when the JSON does not decode or re-encode, else `[false, canonical JSON]`. */
export function canonicalize(json: string): readonly [true, null] | readonly [false, string] {
  const decoded = jsonDecode(json);
  if (decoded.error !== JSON_ERROR_NONE) {
    return [true, null];
  }
  const encoded = jsonEncode(recursiveSort(decoded.value));
  return encoded === null ? [true, null] : [false, encoded];
}

/** PHPUnit's `InvalidJsonException`. Internal to the grader. */
export class InvalidJsonException extends Error {
  constructor() {
    super("");
    this.name = "InvalidJsonException";
  }
}

/** `Json::prettify`: `JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE`. */
export function prettify(json: string): string {
  const decoded = jsonDecode(json);
  if (decoded.error !== JSON_ERROR_NONE) {
    throw new InvalidJsonException();
  }
  const encoded = jsonEncode(decoded.value, { prettyPrint: true, unescapedSlashes: true, unescapedUnicode: true });
  if (encoded === null) {
    throw new InvalidJsonException();
  }
  return encoded;
}

const PHP_PROPS = Symbol.for("xaravel.php.props");

/** A decoded value in the grader's PHP value model (AD-9): a JSON object is a `stdClass` behind the props protocol. */
export function toPhpValue(value: JsonValue): unknown {
  if (value instanceof JsonInt) {
    const number = Number(value.value);
    return Number.isSafeInteger(number) ? number : value.value;
  }
  if (value instanceof JsonFloat) {
    return value.value;
  }
  if (Array.isArray(value)) {
    return value.map(toPhpValue);
  }
  if (value instanceof JsonObject) {
    const props = Object.fromEntries([...value.properties].map(([key, item]) => [key, toPhpValue(item)]));
    return Object.freeze({ [PHP_PROPS]: () => props });
  }
  return value;
}
