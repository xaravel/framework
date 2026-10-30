// `Dotenv\Parser\Lines` (vlucas/phpdotenv v5.7.0), ported line for line. `$line[0] === '#'` reads the first byte,
// which is `#` exactly when the string starts with `#` (`str_starts_with`).
import { registerClass } from "@xaravel/runtime";
import { implode, str_replace, str_starts_with, strpos, trim, Error as PhpError } from "@xaravel/runtime/php";
import { Regex } from "../Util/Regex";

/** The key to Upstream's private constructor. */
const CREATE: unique symbol = Symbol("Lines");

/** Joins the lines of an environment file into raw entries. */
export class Lines {
  /** This class is a singleton. Private in PHP: throws PHP's `Error`; Upstream's own callers pass the key. */
  constructor(key: typeof CREATE) {
    if (key !== CREATE) {
      throw new PhpError("Call to private Dotenv\\Parser\\Lines::__construct() from global scope");
    }
    //
  }

  /**
   * Process the array of lines of environment variables.
   *
   * This will produce an array of raw entries, one per variable.
   */
  static process(lines: readonly string[]): string[] {
    const output: string[] = [];
    let multiline = false;
    let multilineBuffer: string[] = [];

    for (let line of lines) {
      [multiline, line, multilineBuffer] = Lines.multilineProcess(multiline, line, multilineBuffer);

      if (!multiline && !Lines.isCommentOrWhitespace(line)) {
        output.push(line);
      }
    }

    return output;
  }

  /** Used to make all multiline variable process. */
  private static multilineProcess(multiline: boolean, line: string, buffer: readonly string[]): [boolean, string, string[]] {
    const startsOnCurrentLine = multiline ? false : Lines.looksLikeMultilineStart(line);
    let lines = [...buffer];

    // check if $line can be multiline variable
    if (startsOnCurrentLine) {
      multiline = true;
    }

    if (multiline) {
      lines.push(line);

      if (Lines.looksLikeMultilineStop(line, startsOnCurrentLine)) {
        multiline = false;
        line = implode("\n", lines);
        lines = [];
      }
    }

    return [multiline, line, lines];
  }

  /** Determine if the given line can be the start of a multiline variable. */
  private static looksLikeMultilineStart(line: string): boolean {
    const pos = strpos(line, "=\"");

    if (pos === false) {
      return false;
    }

    const hash = strpos(line, "#");

    if (hash !== false && hash < pos) {
      return false;
    }

    return Lines.looksLikeMultilineStop(line, true) === false;
  }

  /** Determine if the given line can be the start of a multiline variable. */
  private static looksLikeMultilineStop(line: string, started: boolean): boolean {
    if (line === "\"") {
      return true;
    }

    return Regex.occurrences("/(?=([^\\\\]\"))/", str_replace("\\\\", "", line) as string).map((count: number) => {
      return started ? count > 1 : count >= 1;
    }).success().getOrElse(false);
  }

  /** Determine if the line in the file is a comment or whitespace. */
  private static isCommentOrWhitespace(line: string): boolean {
    line = trim(line, " \n\r\t\0\x0B");

    return line === "" || str_starts_with(line, "#");
  }
}

registerClass("Dotenv\\Parser\\Lines", Lines);
