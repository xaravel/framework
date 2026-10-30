// `Dotenv\Util\Regex` (vlucas/phpdotenv v5.7.0, `@internal`), ported line for line over the runtime's `preg_*`
// functions, which take Upstream's PCRE pattern strings and convert them by PORTING.md § PCRE conversion (DIV-10.1,
// ESC-15.2-5). PHP's `@` silences warnings, which the runtime does not raise (DIV-9.17). `(int)`, `(string)` and
// `(array)` are `toInt`, `toPhpString` and `toPhpArray`. `preg_last_error()` reads the active Scope Frame's code and 0
// outside a frame (AD-5).
import { registerClass } from "@xaravel/runtime";
import {
  array_values,
  preg_last_error,
  preg_last_error_msg,
  preg_match,
  preg_match_all,
  preg_replace_callback,
  preg_split,
  PREG_NO_ERROR,
  toInt,
  toPhpArray,
  toPhpString,
  Error as PhpError,
} from "@xaravel/runtime/php";
import { Error } from "../../GrahamCampbell/ResultType/Error";
import type { Result } from "../../GrahamCampbell/ResultType/Result";
import { Success } from "../../GrahamCampbell/ResultType/Success";

/** The key to Upstream's private constructor. */
const CREATE: unique symbol = Symbol("Regex");

/** phpdotenv's PCRE wrapper: each call's result, or `preg_last_error_msg()` as an error. */
export class Regex {
  /** This class is a singleton. Private in PHP: throws PHP's `Error`; Upstream's own callers pass the key. */
  constructor(key: typeof CREATE) {
    if (key !== CREATE) {
      throw new PhpError("Call to private Dotenv\\Util\\Regex::__construct() from global scope");
    }
    //
  }

  /** Perform a preg match, wrapping up the result. */
  static matches(pattern: string, subject: string): Result<boolean, string> {
    return Regex.wrap(preg_match(pattern, subject) === 1);
  }

  /** Perform a preg match all, wrapping up the result. */
  static occurrences(pattern: string, subject: string): Result<number, string> {
    return Regex.wrap(Number(toInt(preg_match_all(pattern, subject))));
  }

  /** Perform a preg replace callback, wrapping up the result. */
  static replaceCallback(pattern: string, callback: (matches: string[]) => string, subject: string, limit: number | null = null): Result<string, string> {
    return Regex.wrap(toPhpString(preg_replace_callback(pattern, callback, subject, limit ?? -1)));
  }

  /** Perform a preg split, wrapping up the result. */
  static split(pattern: string, subject: string): Result<string[], string> {
    const result = array_values(toPhpArray(preg_split(pattern, subject))) as string[];

    return Regex.wrap(result);
  }

  /** Wrap the result of a preg operation. */
  private static wrap<V>(result: V): Result<V, string> {
    if (preg_last_error() !== PREG_NO_ERROR) {
      return Error.create(preg_last_error_msg());
    }

    return Success.create(result);
  }
}

registerClass("Dotenv\\Util\\Regex", Regex);
