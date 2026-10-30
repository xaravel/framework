// `Dotenv\Parser\EntryParser` (vlucas/phpdotenv v5.7.0), ported line for line. Patterns keep Upstream's PCRE source
// and run through the runtime's `preg_match` (PORTING.md § PCRE conversion, DIV-10.1, ESC-15.2-5), so the value
// fast path's branch-reset group and byte-counted `{1,1000}` match as in PHP.
//
// A PHP string is its bytes, a runtime string UTF-8 text. Upstream reads single bytes (`$name[6]`, `$name[0]`, the
// last byte, `ord($prefix[$i])`) and cuts at a byte count (`cutBytes`), which can fall inside a UTF-8 sequence where
// a runtime `substr` would throw the runtime's limit. Those reads go through `utf8Bytes`, the string's UTF-8 bytes,
// and `cutBytes` cuts those bytes; every result it returns ends on a whole character, as Upstream's does.
import { registerClass } from "@xaravel/runtime";
import {
  addcslashes,
  ctype_space,
  Error as PhpError,
  explode,
  in_array,
  ltrim,
  preg_match,
  Ref,
  sprintf,
  str_starts_with,
  stripcslashes,
  strlen,
  strtok,
  substr,
  trim,
} from "@xaravel/runtime/php";
import { Error } from "../../GrahamCampbell/ResultType/Error";
import type { Result } from "../../GrahamCampbell/ResultType/Result";
import { Success } from "../../GrahamCampbell/ResultType/Success";
import { None } from "../../PhpOption/None";
import type { Option } from "../../PhpOption/Option";
import { Some } from "../../PhpOption/Some";
import { Regex } from "../Util/Regex";
import { Str } from "../Util/Str";
import { Entry } from "./Entry";
import { Lexer } from "./Lexer";
import { Value } from "./Value";

/** The key to Upstream's private constructor. */
const CREATE: unique symbol = Symbol("EntryParser");

const INITIAL_STATE = 0;
const UNQUOTED_STATE = 1;
const SINGLE_QUOTED_STATE = 2;
const DOUBLE_QUOTED_STATE = 3;
const ESCAPE_SEQUENCE_STATE = 4;
const WHITESPACE_STATE = 5;
const COMMENT_STATE = 6;
const REJECT_STATES = [SINGLE_QUOTED_STATE, DOUBLE_QUOTED_STATE, ESCAPE_SEQUENCE_STATE];

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** The UTF-8 bytes of `s`: the PHP string's bytes, for Upstream's single-byte reads. */
function utf8Bytes(s: string): Uint8Array {
  return encoder.encode(s);
}

/** The byte `$s[$i]` reads, as its value (`ord`), or null past the end. */
function byteAt(s: string, i: number): number | null {
  const bytes = utf8Bytes(s);
  return i >= 0 && i < bytes.length ? bytes[i]! : null;
}

/** `$s[$i]` is the one-byte ASCII string `char`. */
function byteIs(s: string, i: number, char: string): boolean {
  return byteAt(s, i) === char.charCodeAt(0);
}

/** phpdotenv's entry parser: a raw entry into a name and a value. */
export class EntryParser {
  /** This class is a singleton. Private in PHP: throws PHP's `Error`; Upstream's own callers pass the key. */
  constructor(key: typeof CREATE) {
    if (key !== CREATE) {
      throw new PhpError("Call to private Dotenv\\Parser\\EntryParser::__construct() from global scope");
    }
    //
  }

  /**
   * Parse a raw entry into a proper entry.
   *
   * That is, turn a raw environment variable entry into a name and possibly a value. We wrap the answer in a result
   * type.
   */
  static parse(entry: string): Result<Entry, string> {
    return EntryParser.splitStringIntoParts(entry).flatMap((parts: [string, string | null]) => {
      const [name, value] = parts;

      return EntryParser.parseName(name).flatMap((name: string) => {
        const parsedValue: Result<Value | null, string> = value === null ? Success.create(null) : EntryParser.parseValue(value);

        return parsedValue.map((value: Value | null) => {
          return new Entry(name, value);
        });
      });
    });
  }

  /** Split the compound string into parts. */
  private static splitStringIntoParts(line: string): Result<[string, string | null], string> {
    const parts = explode("=", line, 2);
    let result: [string, string | null];

    if (parts[1] !== undefined) {
      result = [trim(parts[0], " \n\r\t\0\x0B"), trim(parts[1], " \n\r\t\0\x0B")];
    } else {
      result = [line, null];
    }

    if (result[0] === "") {
      return Error.create(EntryParser.getErrorMessage("an unexpected equals", line));
    }

    return Success.create(result);
  }

  /**
   * Parse the given variable name.
   *
   * That is, strip the optional quotes and leading "export" from the variable name. We wrap the answer in a result
   * type. `substr($name, 0, 6) === 'export'` is `str_starts_with`, and `ctype_space($name[6])` reads byte 6, which
   * the six ASCII bytes before it leave on a character boundary.
   */
  private static parseName(name: string): Result<string, string> {
    if (strlen(name) > 6 && str_starts_with(name, "export") && EntryParser.isSpaceByte(name, 6)) {
      name = ltrim(substr(name, 6), " \t\n\r\v\f");
    }

    if (EntryParser.isQuotedName(name)) {
      name = substr(name, 1, -1);
    }

    if (!EntryParser.isValidName(name)) {
      return Error.create(EntryParser.getErrorMessage("an invalid name", name));
    }

    return Success.create(name);
  }

  /** `ctype_space($s[$i])`: the byte is an ASCII byte `ctype_space` takes (a byte of 128 or more never is). */
  private static isSpaceByte(s: string, i: number): boolean {
    const byte = byteAt(s, i);
    return byte !== null && byte < 0x80 && ctype_space(String.fromCharCode(byte));
  }

  /** Is the given variable name quoted? */
  private static isQuotedName(name: string): boolean {
    if (strlen(name) < 3) {
      return false;
    }

    const last = strlen(name) - 1;

    return (byteIs(name, 0, "\"") && byteIs(name, last, "\"")) || (byteIs(name, 0, "'") && byteIs(name, last, "'"));
  }

  /** Is the given variable name valid? */
  private static isValidName(name: string): boolean {
    if (preg_match("~\\A[a-zA-Z0-9_.]+\\z~", name) === 1) {
      return true;
    }

    return Regex.matches("~\\A[\\p{Ll}\\p{Lu}\\p{M}\\p{N}_.]+\\z~u", name).success().getOrElse(false);
  }

  /**
   * Parse the given variable value.
   *
   * This has the effect of stripping quotes and comments, dealing with special characters, and locating nested
   * variables, but not resolving them. Formally, we run a finite state automaton with an output tape: a transducer.
   * We wrap the answer in a result type.
   */
  private static parseValue(value: string): Result<Value, string> {
    if (trim(value, " \n\r\t\0\x0B") === "") {
      return Success.create(Value.blank());
    }

    const literal = EntryParser.parseLiteral(value);

    if (literal.isDefined()) {
      return Success.create(Value.blank().append(literal.get(), false));
    }

    let chars = "";
    let pending = "";
    let length = 0;
    const vars: number[] = [];
    let state = INITIAL_STATE;

    for (const token of Lexer.lex(value)) {
      const result = EntryParser.processToken(state, token);

      if (result.error().isDefined()) {
        return Error.create(EntryParser.getErrorMessage(result.error().get(), value));
      }

      const [chunk, variable, next] = result.success().get();
      state = next;

      if (variable) {
        chars += pending;
        length += Str.len(pending);
        pending = "";
        vars.push(length);
      }

      pending += chunk;
    }

    if (in_array(state, REJECT_STATES, true)) {
      return Error.create(EntryParser.getErrorMessage("a missing closing quote", value));
    }

    return Success.create(Value.create(chars + pending, vars));
  }

  /**
   * Parse the given variable value, if it is a literal.
   *
   * That is, a value which can be used verbatim, save stripping quotes. Unquoted literals are capped at the lexer's
   * chunk size, so that the fast path agrees with the transducer under any libc locale.
   */
  private static parseLiteral(value: string): Option<string> {
    const matches = new Ref<unknown>(null);
    if (preg_match("~\\A(?|([^\\s\\\\'\"#$]{1,1000})|'([^']*)'|\"([^\"\\\\$]*)\")\\z~", value, matches) === 1) {
      return Some.create((matches.value as string[])[1]!);
    }

    return None.create();
  }

  /** Process the given token. */
  private static processToken(state: number, token: string): Result<[string, boolean, number], string> {
    switch (state) {
      case INITIAL_STATE:
        if (token === "'") {
          return Success.create(["", false, SINGLE_QUOTED_STATE]);
        } else if (token === "\"") {
          return Success.create(["", false, DOUBLE_QUOTED_STATE]);
        } else if (token === "#") {
          return Success.create(["", false, COMMENT_STATE]);
        } else if (token === "$") {
          return Success.create([token, true, UNQUOTED_STATE]);
        } else {
          return Success.create([token, false, UNQUOTED_STATE]);
        }
      case UNQUOTED_STATE:
        if (token === "#") {
          return Success.create(["", false, COMMENT_STATE]);
        } else if (ctype_space(token)) {
          return Success.create(["", false, WHITESPACE_STATE]);
        } else if (token === "$") {
          return Success.create([token, true, UNQUOTED_STATE]);
        } else {
          return Success.create([token, false, UNQUOTED_STATE]);
        }
      case SINGLE_QUOTED_STATE:
        if (token === "'") {
          return Success.create(["", false, WHITESPACE_STATE]);
        } else {
          return Success.create([token, false, SINGLE_QUOTED_STATE]);
        }
      case DOUBLE_QUOTED_STATE:
        if (token === "\"") {
          return Success.create(["", false, WHITESPACE_STATE]);
        } else if (token === "\\") {
          return Success.create(["", false, ESCAPE_SEQUENCE_STATE]);
        } else if (token === "$") {
          return Success.create([token, true, DOUBLE_QUOTED_STATE]);
        } else {
          return Success.create([token, false, DOUBLE_QUOTED_STATE]);
        }
      case ESCAPE_SEQUENCE_STATE:
        if (token === "\"" || token === "\\") {
          return Success.create([token, false, DOUBLE_QUOTED_STATE]);
        } else if (token === "$") {
          return Success.create([token, false, DOUBLE_QUOTED_STATE]);
        } else {
          const first = Str.substr(token, 0, 1);
          if (in_array(first, ["f", "n", "r", "t", "v"], true)) {
            return Success.create([stripcslashes("\\" + first) + Str.substr(token, 1), false, DOUBLE_QUOTED_STATE]);
          } else {
            return Error.create("an unexpected escape sequence");
          }
        }
      case WHITESPACE_STATE:
        if (token === "#") {
          return Success.create(["", false, COMMENT_STATE]);
        } else if (!ctype_space(token)) {
          return Error.create("unexpected whitespace");
        } else {
          return Success.create(["", false, WHITESPACE_STATE]);
        }
      case COMMENT_STATE:
        return Success.create(["", false, COMMENT_STATE]);
      default:
        throw new PhpError("Parser entered invalid state.");
    }
  }

  /** Generate a friendly error message. */
  private static getErrorMessage(cause: string, subject: string): string {
    let line = strtok(subject, "\n");

    if (line === false) {
      line = "";
    }

    if (strlen(line) > 80) {
      line = EntryParser.cutBytes(line, 80) + "...";
    }

    line = addcslashes(line, "\0..\x1F\x7F");

    return sprintf(
      "Encountered %s at [%s].",
      cause,
      line,
    );
  }

  /**
   * Cut the string to at most the given number of bytes.
   *
   * The cut never splits a multibyte UTF-8 character: an incomplete trailing sequence is dropped entirely. It runs
   * over the string's UTF-8 bytes (see the header).
   */
  private static cutBytes(input: string, limit: number): string {
    let prefix = utf8Bytes(input).subarray(0, limit);
    const length = prefix.length;

    for (let i = length - 1; i >= 0 && i >= length - 4; i--) {
      const byte = prefix[i]!;

      if ((byte & 0xC0) !== 0x80) {
        const need = byte < 0x80 ? 1 : (byte >= 0xF0 ? 4 : (byte >= 0xE0 ? 3 : (byte >= 0xC0 ? 2 : 1)));

        if (i + need > length) {
          prefix = prefix.subarray(0, i);
        }

        break;
      }
    }

    return decoder.decode(prefix);
  }
}

registerClass("Dotenv\\Parser\\EntryParser", EntryParser);
