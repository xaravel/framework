// PHP's `json_decode($json, $associative, $depth, $flags)` over the AD-9 value model (Story 9.8, AD-23.1), mirroring
// PHP 8.5's `ext/json/json_scanner.re` and `json_parser.y`: a hand-written scanner over the JS string and a
// recursive-descent parser that reports PHP's `JSON_ERROR_*` code for the first error PHP's scanner and parser meet.
//
// - Grammar: RFC 8259 as PHP reads it. Whitespace is only ` \t\n\r`; `true`, `false` and `null` are lower case; a
//   number has no leading zero, `+`, bare `.` or bare exponent, and under `JSON_BIGINT_AS_STRING` an int beyond
//   int64 is a string token, which may be an object key, as in PHP. A raw character below 0x20 is `JSON_ERROR_CTRL_CHAR`
//   (inside a string, and outside one too), an unterminated string included; a lone surrogate is PHP's malformed UTF-8
//   (`JSON_ERROR_UTF8`) unless `JSON_INVALID_UTF8_SUBSTITUTE` (U+FFFD) or `_IGNORE` (dropped) applies; a `\u` escape
//   that leaves an unpaired surrogate is `JSON_ERROR_UTF16`; a `}` closing a `[` (or `]` a `{`) is
//   `JSON_ERROR_STATE_MISMATCH`; anything else is `JSON_ERROR_SYNTAX`.
// - Depth: an array or object that makes the nesting reach `depth` is `JSON_ERROR_DEPTH`, checked when it opens.
// - Numbers: an int is an AD-9 int (`-0` is `0`, beyond ±(2^53 − 1) a `bigint`); an int beyond int64 is a float, or
//   its digit string under `JSON_BIGINT_AS_STRING`; a fraction or exponent is a float, marked with `float()` when its
//   value is integral (`1.0`, `1e2`), as `phpUnserialize` marks one.
// - Objects: with `associative === true` (or null plus `JSON_OBJECT_AS_ARRAY`) a PHP array built by `arrayFromEntries`
//   (keys normalised; a repeated key keeps its first position and its last value; `{}` is `[]`); otherwise a
//   `stdClass` with the keys verbatim, where a key starting with `\0` is `JSON_ERROR_INVALID_PROPERTY_NAME`.
//   A JS object lists integer-like keys first, so such a `stdClass` key is read back out of PHP's order (`phpUnserialize`
//   builds `stdClass` the same way).
// - Errors: the result is `null`; under `JSON_THROW_ON_ERROR`, PHP's `JsonException` with PHP's message and code
//   (ESC-9.8-1 part 1). A `depth` below 1 throws PHP's `ValueError`.
//
// - `json_last_error()` (ESC-9.8-1 part 2): without `JSON_THROW_ON_ERROR`, each call records its code through
//   `recordJsonError` (`JSON_ERROR_NONE` first, so a `depth` `ValueError` leaves 0, as in PHP); under it, none.
import {
  JSON_BIGINT_AS_STRING,
  JSON_ERROR_CTRL_CHAR,
  JSON_ERROR_DEPTH,
  JSON_ERROR_INVALID_PROPERTY_NAME,
  JSON_ERROR_NONE,
  JSON_ERROR_STATE_MISMATCH,
  JSON_ERROR_SYNTAX,
  JSON_ERROR_UTF16,
  JSON_ERROR_UTF8,
  JSON_INVALID_UTF8_IGNORE,
  JSON_INVALID_UTF8_SUBSTITUTE,
  JSON_OBJECT_AS_ARRAY,
  JSON_THROW_ON_ERROR,
  jsonError,
  recordJsonError,
} from "./jsonConstants";
import { exceedsInt64 } from "./numericString";
import { arrayFromEntries } from "./PhpArray";
import { float } from "./PhpFloat";
import { intKey } from "./phpInt";
import { stdClass } from "./stdClass";
import { ValueError } from "./ValueError";

/** `INT_MAX`, the largest `depth` PHP accepts. */
const DEPTH_LIMIT = 2147483647;
const NUMBER = /-?(?:0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/y;
const HEX4 = /^[0-9a-fA-F]{4}$/;

/** A JSON error: its `JSON_ERROR_*` code. */
class Failure {
  constructor(readonly code: number) {}
}

/** A token: a punctuator or `eoi`, else a value (`value` holds it). */
type TokenType = "{" | "}" | "[" | "]" | ":" | "," | "value" | "eoi";

interface Token {
  readonly type: TokenType;
  readonly value: unknown;
  /** A string token (an object key must be one). */
  readonly string?: true;
}

const EOI: Token = { type: "eoi", value: null };

/**
 * PHP's `json_decode($json, $associative, $depth, $flags)`: the decoded value in AD-9 form, or `null` on an error.
 * Under `JSON_THROW_ON_ERROR` an error throws PHP's `JsonException` with PHP's message and `JSON_ERROR_*` code. Throws
 * PHP's `ValueError` when `depth` is below 1 (an empty `json` is a syntax error first, as in PHP). A `null` or
 * `undefined` `json` reads as "".
 */
export function jsonDecode(json: string | null | undefined, associative: boolean | null = null, depth: number = 512, flags: number = 0): unknown {
  const throws = (flags & JSON_THROW_ON_ERROR) !== 0;
  // PHP clears json_last_error() first unless it throws, so a ValueError below leaves 0 (ESC-9.8-1 part 2).
  if (!throws) {
    recordJsonError(JSON_ERROR_NONE);
  }
  // PHP reads a null `$json` as "" (with a deprecation): a syntax error.
  const text = json ?? "";
  if (text === "") {
    if (throws) {
      throw jsonError(JSON_ERROR_SYNTAX);
    }
    recordJsonError(JSON_ERROR_SYNTAX);
    return null;
  }
  if (depth <= 0) {
    throw valueError("must be greater than 0");
  }
  if (depth > DEPTH_LIMIT) {
    throw valueError(`must be less than ${DEPTH_LIMIT}`);
  }
  let options = flags;
  if (associative !== null) {
    options = associative ? options | JSON_OBJECT_AS_ARRAY : options & ~JSON_OBJECT_AS_ARRAY;
  }
  try {
    return new Parser(text, options, depth).parse();
  } catch (error) {
    if (!(error instanceof Failure)) {
      throw error;
    }
    if (throws) {
      throw jsonError(error.code);
    }
    recordJsonError(error.code);
    return null;
  }
}

/** PHP's `ValueError` for argument #3, with code 0 (ESC-9.8-1 part 1). */
function valueError(message: string): ValueError {
  return new ValueError(`json_decode(): Argument #3 ($depth) ${message}`);
}

class Parser {
  #pos = 0;
  #depth = 0;

  constructor(
    readonly text: string,
    readonly options: number,
    readonly maxDepth: number,
  ) {}

  parse(): unknown {
    const value = this.#value(this.#next());
    if (this.#next().type !== "eoi") {
      throw new Failure(JSON_ERROR_SYNTAX);
    }
    return value;
  }

  /** The value that starts with `token`. */
  #value(token: Token): unknown {
    switch (token.type) {
      case "value":
        return token.value;
      case "[":
        return this.#array();
      case "{":
        return this.#object();
      default:
        throw new Failure(JSON_ERROR_SYNTAX);
    }
  }

  /** `PHP_JSON_DEPTH_INC`, when an array or object opens. */
  #enter(): void {
    if (++this.#depth >= this.maxDepth) {
      throw new Failure(JSON_ERROR_DEPTH);
    }
  }

  #array(): unknown[] {
    this.#enter();
    const items: unknown[] = [];
    let token = this.#next();
    if (token.type !== "]") {
      for (;;) {
        if (token.type === "}" && items.length === 0) {
          throw new Failure(JSON_ERROR_STATE_MISMATCH);
        }
        items.push(this.#value(token));
        token = this.#next();
        if (token.type === ",") {
          token = this.#next();
          continue;
        }
        if (token.type === "]") {
          break;
        }
        throw new Failure(token.type === "}" ? JSON_ERROR_STATE_MISMATCH : JSON_ERROR_SYNTAX);
      }
    }
    this.#depth--;
    return items;
  }

  #object(): unknown {
    this.#enter();
    const assoc = (this.options & JSON_OBJECT_AS_ARRAY) !== 0;
    const entries: [string, unknown][] = [];
    const object = assoc ? null : new stdClass();
    let token = this.#next();
    if (token.type !== "}") {
      let first = true;
      for (;;) {
        if (first && token.type === "]") {
          throw new Failure(JSON_ERROR_STATE_MISMATCH);
        }
        first = false;
        if (token.type !== "value" || typeof token.value !== "string" || !token.string) {
          throw new Failure(JSON_ERROR_SYNTAX);
        }
        const key = token.value;
        if (this.#next().type !== ":") {
          throw new Failure(JSON_ERROR_SYNTAX);
        }
        const value = this.#value(this.#next());
        if (object === null) {
          entries.push([key, value]);
        } else {
          if (key.startsWith("\0")) {
            throw new Failure(JSON_ERROR_INVALID_PROPERTY_NAME);
          }
          Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
        }
        token = this.#next();
        if (token.type === ",") {
          token = this.#next();
          continue;
        }
        if (token.type === "}") {
          break;
        }
        throw new Failure(token.type === "]" ? JSON_ERROR_STATE_MISMATCH : JSON_ERROR_SYNTAX);
      }
    }
    this.#depth--;
    return object ?? arrayFromEntries(entries);
  }

  /** The next token (`json_scanner.re`'s `JS` state). */
  #next(): Token {
    const text = this.text;
    let pos = this.#pos;
    while (pos < text.length) {
      const c = text.charCodeAt(pos);
      if (c !== 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) {
        break;
      }
      pos++;
    }
    this.#pos = pos;
    if (pos >= text.length) {
      return EOI;
    }
    const char = text[pos] as string;
    switch (char) {
      case "{":
      case "}":
      case "[":
      case "]":
      case ":":
      case ",":
        this.#pos = pos + 1;
        return { type: char, value: null };
      case '"':
        return { type: "value", value: this.#string(), string: true };
      case "t":
        return this.#literal("true", true);
      case "f":
        return this.#literal("false", false);
      case "n":
        return this.#literal("null", null);
      default:
        break;
    }
    NUMBER.lastIndex = pos;
    const match = NUMBER.exec(text);
    if (match !== null) {
      this.#pos = pos + match[0].length;
      const value = this.#number(match[0], match[1] !== undefined || match[2] !== undefined);
      // Under JSON_BIGINT_AS_STRING the scanner returns an int beyond int64 as a string token, which can be a key.
      return typeof value === "string" ? { type: "value", value, string: true } : { type: "value", value };
    }
    throw new Failure(invalidCharacter(text, pos));
  }

  #literal(word: string, value: unknown): Token {
    if (!this.text.startsWith(word, this.#pos)) {
      throw new Failure(JSON_ERROR_SYNTAX);
    }
    this.#pos += word.length;
    return { type: "value", value };
  }

  #number(text: string, isFloat: boolean): unknown {
    if (!isFloat) {
      const negative = text.startsWith("-");
      if (!exceedsInt64(negative ? text.slice(1) : text, negative)) {
        return intKey(BigInt(text));
      }
      if ((this.options & JSON_BIGINT_AS_STRING) !== 0) {
        return text;
      }
    }
    const value = Number(text);
    return Number.isSafeInteger(value) && !Object.is(value, -0) && isFloat ? float(value) : value;
  }

  /** A string token from its opening quote (`STR_P1`): its value, or the first error in it. */
  #string(): string {
    const text = this.text;
    let pos = this.#pos + 1;
    let out = "";
    for (;;) {
      if (pos >= text.length) {
        // PHP reads the terminating NUL as a control character.
        throw new Failure(JSON_ERROR_CTRL_CHAR);
      }
      const c = text.charCodeAt(pos);
      if (c === 0x22) {
        this.#pos = pos + 1;
        return out;
      }
      if (c < 0x20) {
        throw new Failure(JSON_ERROR_CTRL_CHAR);
      }
      if (c === 0x5c) {
        const escape = text[pos + 1];
        switch (escape) {
          case '"':
          case "\\":
          case "/":
            out += escape;
            pos += 2;
            continue;
          case "b":
            out += "\b";
            pos += 2;
            continue;
          case "f":
            out += "\f";
            pos += 2;
            continue;
          case "n":
            out += "\n";
            pos += 2;
            continue;
          case "r":
            out += "\r";
            pos += 2;
            continue;
          case "t":
            out += "\t";
            pos += 2;
            continue;
          case "u": {
            const unit = hexUnit(text, pos + 2);
            if (unit === null) {
              throw new Failure(JSON_ERROR_SYNTAX);
            }
            if (unit >= 0xd800 && unit <= 0xdbff) {
              const low = text.startsWith("\\u", pos + 6) ? hexUnit(text, pos + 8) : null;
              if (low === null || low < 0xdc00 || low > 0xdfff) {
                throw new Failure(JSON_ERROR_UTF16);
              }
              out += String.fromCharCode(unit, low);
              pos += 12;
              continue;
            }
            if (unit >= 0xdc00 && unit <= 0xdfff) {
              throw new Failure(JSON_ERROR_UTF16);
            }
            out += String.fromCharCode(unit);
            pos += 6;
            continue;
          }
          default:
            throw new Failure(JSON_ERROR_SYNTAX);
        }
      }
      if (c >= 0xd800 && c <= 0xdfff) {
        const low = c <= 0xdbff && pos + 1 < text.length ? text.charCodeAt(pos + 1) : 0;
        if (low >= 0xdc00 && low <= 0xdfff) {
          out += text.slice(pos, pos + 2);
          pos += 2;
          continue;
        }
        // A lone surrogate: PHP's malformed UTF-8.
        if ((this.options & JSON_INVALID_UTF8_SUBSTITUTE) !== 0) {
          out += "\ufffd";
        } else if ((this.options & JSON_INVALID_UTF8_IGNORE) === 0) {
          throw new Failure(JSON_ERROR_UTF8);
        }
        pos++;
        continue;
      }
      out += text[pos];
      pos++;
    }
  }
}

/** The 16-bit unit of the 4 hex digits at `pos`, or null when there are not 4. */
function hexUnit(text: string, pos: number): number | null {
  const digits = text.slice(pos, pos + 4);
  return HEX4.test(digits) ? Number.parseInt(digits, 16) : null;
}

/** The error PHP's scanner gives a character that starts no token: a control character, malformed UTF-8, or syntax. */
function invalidCharacter(text: string, pos: number): number {
  const c = text.charCodeAt(pos);
  if (c < 0x20) {
    return JSON_ERROR_CTRL_CHAR;
  }
  if (c >= 0xd800 && c <= 0xdfff) {
    const low = c <= 0xdbff && pos + 1 < text.length ? text.charCodeAt(pos + 1) : 0;
    if (low < 0xdc00 || low > 0xdfff) {
      return JSON_ERROR_UTF8;
    }
  }
  return JSON_ERROR_SYNTAX;
}
