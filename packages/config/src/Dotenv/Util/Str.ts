// `Dotenv\Util\Str` (vlucas/phpdotenv v5.7.0, `@internal`), ported line for line over the runtime's mbstring
// functions. A runtime string is UTF-8 text, so `mb_convert_encoding` converts only from UTF-8 (a `$fileEncoding`
// naming another encoding throws the runtime's limit; deferred item in spec-15-2). PHP's `@` silences warnings, which
// the runtime does not raise (DIV-9.17).
import { registerClass } from "@xaravel/runtime";
import {
  is_string,
  mb_convert_encoding,
  mb_encoding_aliases,
  mb_list_encodings,
  mb_strlen,
  mb_strpos,
  mb_substr,
  sprintf,
  str_starts_with,
  strcasecmp,
  substr,
  Error as PhpError,
} from "@xaravel/runtime/php";
import { Error } from "../../GrahamCampbell/ResultType/Error";
import type { Result } from "../../GrahamCampbell/ResultType/Result";
import { Success } from "../../GrahamCampbell/ResultType/Success";
import { Option } from "../../PhpOption/Option";

/** The key to Upstream's private constructor. */
const CREATE: unique symbol = Symbol("Str");

/** phpdotenv's multibyte string helpers. */
export class Str {
  /** This class is a singleton. Private in PHP: throws PHP's `Error`; Upstream's own callers pass the key. */
  constructor(key: typeof CREATE) {
    if (key !== CREATE) {
      throw new PhpError("Call to private Dotenv\\Util\\Str::__construct() from global scope");
    }
    //
  }

  /** Convert a string to UTF-8 from the given encoding. */
  static utf8(input: string, encoding: string | null = null): Result<string, string> {
    if (encoding !== null && !Str.isValidEncoding(encoding)) {
      return Error.create(
        sprintf("Illegal character encoding [%s] specified.", encoding),
      );
    }

    const converted: unknown = encoding === null
      ? mb_convert_encoding(input, "UTF-8")
      : mb_convert_encoding(input, "UTF-8", encoding);

    if (!is_string(converted)) {
      return Error.create(
        sprintf("Conversion from encoding [%s] failed.", encoding ?? "NULL"),
      );
    }

    let result = converted as string;

    // This is for support UTF-8 with BOM encoding (https://github.com/vlucas/phpdotenv/issues/500). Upstream's
    // `substr($converted, 0, 3) === "\xEF\xBB\xBF"` is `str_starts_with`, which never splits a UTF-8 sequence.
    if (str_starts_with(result, "\u{FEFF}")) {
      result = substr(result, 3);
    }

    return Success.create(result);
  }

  /** Is the given character encoding valid? */
  private static isValidEncoding(encoding: string): boolean {
    for (const candidate of mb_list_encodings()) {
      if (strcasecmp(candidate, encoding) === 0) {
        return true;
      }

      for (const alias of mb_encoding_aliases(candidate)) {
        if (strcasecmp(alias, encoding) === 0) {
          return true;
        }
      }
    }

    return false;
  }

  /** Search for a given substring of the input. */
  static pos(haystack: string, needle: string): Option<number> {
    return Option.fromValue(mb_strpos(haystack, needle, 0, "UTF-8"), false) as Option<number>;
  }

  /** Grab the specified substring of the input. */
  static substr(input: string, start: number, length: number | null = null): string {
    return mb_substr(input, start, length, "UTF-8");
  }

  /** Compute the length of the given string. */
  static len(input: string): number {
    return mb_strlen(input, "UTF-8");
  }
}

registerClass("Dotenv\\Util\\Str", Str);
