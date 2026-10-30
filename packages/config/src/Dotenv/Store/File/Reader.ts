// `Dotenv\Store\File\Reader` (vlucas/phpdotenv v5.7.0, `@internal`), ported line for line over the runtime's sync
// `file_get_contents` (AD-6, ESC-15.2-3). PHP's `@` silences warnings, which the runtime does not raise (DIV-9.17).
// `$output` is a `PhpArray` keyed by path; the result takes the PHP array form AD-9 gives its keys.
import type { PhpArrayLike } from "@xaravel/contracts/config";
import { registerClass } from "@xaravel/runtime";
import { arrayFromEntries, file_get_contents, PhpArray, Error as PhpError } from "@xaravel/runtime/php";
import { InvalidEncodingException } from "../../Exception/InvalidEncodingException";
import { Option } from "../../../PhpOption/Option";
import { Str } from "../../Util/Str";

/** The key to Upstream's private constructor. */
const CREATE: unique symbol = Symbol("Reader");

/** Reads environment files. */
export class Reader {
  /** This class is a singleton. Private in PHP: throws PHP's `Error`; Upstream's own callers pass the key. */
  constructor(key: typeof CREATE) {
    if (key !== CREATE) {
      throw new PhpError("Call to private Dotenv\\Store\\File\\Reader::__construct() from global scope");
    }
    //
  }

  /**
   * Read the file(s), and return their raw content.
   *
   * We provide the file path as the key, and its content as the value. If short circuit mode is enabled, then the
   * returned array with have length at most one. File paths that couldn't be read are omitted entirely.
   */
  static read(filePaths: readonly string[], shortCircuit: boolean = true, fileEncoding: string | null = null): PhpArrayLike {
    const output = new PhpArray<string | number, string>();

    for (const filePath of filePaths) {
      const content = Reader.readFromFile(filePath, fileEncoding);
      if (content.isDefined()) {
        output.set(filePath, content.get());
        if (shortCircuit) {
          break;
        }
      }
    }

    return arrayFromEntries(output) as PhpArrayLike;
  }

  /** Read the given file. */
  private static readFromFile(path: string, encoding: string | null = null): Option<string> {
    const content = Option.fromValue<string | false>(file_get_contents(path), false) as Option<string>;

    return content.flatMap((content: string) => {
      return Str.utf8(content, encoding).mapError((error: string): never => {
        throw new InvalidEncodingException(error);
      }).success();
    });
  }
}

registerClass("Dotenv\\Store\\File\\Reader", Reader);
