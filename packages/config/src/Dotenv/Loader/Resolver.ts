// `Dotenv\Loader\Resolver` (vlucas/phpdotenv v5.7.0), ported line for line over the runtime's
// `preg_replace_callback` (PORTING.md § PCRE conversion, DIV-10.1). Variable locations are character offsets.
import { registerClass } from "@xaravel/runtime";
import { Option } from "../../PhpOption/Option";
import type { Value } from "../Parser/Value";
import type { RepositoryInterface } from "../Repository/RepositoryInterface";
import { Regex } from "../Util/Regex";
import { Str } from "../Util/Str";
import { Error as PhpError } from "@xaravel/runtime/php";

/** The key to Upstream's private constructor. */
const CREATE: unique symbol = Symbol("Resolver");

/** Resolves the nested `${NAME}` variables of a parsed value. */
export class Resolver {
  /** This class is a singleton. Private in PHP: throws PHP's `Error`; Upstream's own callers pass the key. */
  constructor(key: typeof CREATE) {
    if (key !== CREATE) {
      throw new PhpError("Call to private Dotenv\\Loader\\Resolver::__construct() from global scope");
    }
    //
  }

  /**
   * Resolve the nested variables in the given value.
   *
   * Replaces ${varname} patterns in the allowed positions in the variable value by an existing environment variable.
   */
  static resolve(repository: RepositoryInterface, value: Value): string {
    const chars = value.getChars();
    const vars = value.getVars();

    if (vars.length === 0) {
      return chars;
    }

    let tail = "";
    let cut = Str.len(chars);

    for (const i of vars) {
      const segment = Str.substr(chars, i, cut - i);
      tail = Resolver.resolveVariable(repository, segment + tail);
      cut = i;
    }

    return Str.substr(chars, 0, cut) + tail;
  }

  /** Resolve a single nested variable. */
  private static resolveVariable(repository: RepositoryInterface, str: string): string {
    return Regex.replaceCallback(
      "/\\A\\${([a-zA-Z0-9_.]+)}/",
      (matches: string[]) => {
        return Option.fromValue(repository.get(matches[1]!)).getOrElse(matches[0]!) as string;
      },
      str,
      1,
    ).success().getOrElse(str);
  }
}

registerClass("Dotenv\\Loader\\Resolver", Resolver);
