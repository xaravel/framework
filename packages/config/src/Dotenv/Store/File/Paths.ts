// `Dotenv\Store\File\Paths` (vlucas/phpdotenv v5.7.0, `@internal`), ported line for line, except that PHP's
// `DIRECTORY_SEPARATOR` constant, which `@xaravel/runtime/php` does not export yet (ESC-15.2-6), makes `filePaths`
// throw `BlockedByComponentError(runtime)` when it has a path to join.
import { BlockedByComponentError, registerClass } from "@xaravel/runtime";
import { Error as PhpError } from "@xaravel/runtime/php";

/** The key to Upstream's private constructor. */
const CREATE: unique symbol = Symbol("Paths");

/** Joins search paths and file names. */
export class Paths {
  /** This class is a singleton. Private in PHP: throws PHP's `Error`; Upstream's own callers pass the key. */
  constructor(key: typeof CREATE) {
    if (key !== CREATE) {
      throw new PhpError("Call to private Dotenv\\Store\\File\\Paths::__construct() from global scope");
    }
    //
  }

  /** Returns the full paths to the files. */
  static filePaths(paths: readonly string[], names: readonly string[]): string[] {
    const files: string[] = [];

    for (const path of paths) {
      for (const name of names) {
        void path;
        void name;
        throw new BlockedByComponentError("runtime", "DIRECTORY_SEPARATOR (ESC-15.2-6)");
      }
    }

    return files;
  }
}

registerClass("Dotenv\\Store\\File\\Paths", Paths);
