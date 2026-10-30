// `Dotenv\Parser\Lexer` (vlucas/phpdotenv v5.7.0), ported line for line. The token regex keeps Upstream's PCRE
// source (bracket delimiters and the `A` modifier) and is matched by the runtime's `preg_match` at a byte `offset`
// (PORTING.md § PCRE conversion, DIV-10.1, ESC-15.2-5), so `{1,1000}` counts bytes, as in PHP. `isset($content[$offset])`
// is `$offset < strlen($content)`, a byte length.
import { registerClass } from "@xaravel/runtime";
import { Error as PhpError, implode, preg_match, Ref, sprintf, strlen, substr } from "@xaravel/runtime/php";

/** The key to Upstream's private constructor. */
const CREATE: unique symbol = Symbol("Lexer");

/** The regex for each type of token. */
const PATTERNS = [
  "[\\r\\n]{1,1000}", "[^\\S\\r\\n]{1,1000}", "\\\\", "'", "\"", "\\#", "\\$", "([^(\\s\\\\'\"\\#\\$)]|\\(|\\)){1,1000}",
];

/** Upstream's `static $regex`, built once, when the module loads. */
const REGEX = "((" + implode(")|(", PATTERNS) + "))A";

/** phpdotenv's tokenizer. */
export class Lexer {
  /** This class is a singleton. Private in PHP: throws PHP's `Error`; Upstream's own callers pass the key. */
  constructor(key: typeof CREATE) {
    if (key !== CREATE) {
      throw new PhpError("Call to private Dotenv\\Parser\\Lexer::__construct() from global scope");
    }
    //
  }

  /**
   * Convert content into a token stream.
   *
   * Multibyte string processing is not needed here, and nether is error handling, for performance reasons.
   */
  static *lex(content: string): Generator<string, void, undefined> {
    let offset = 0;

    while (offset < strlen(content)) {
      const matches = new Ref<unknown>(null);
      if (preg_match(REGEX, content, matches, 0, offset) !== 1) {
        throw new PhpError(sprintf("Lexer encountered unexpected character [%s].", substr(content, offset, 1)));
      }

      const token = (matches.value as string[])[0]!;

      offset += strlen(token);

      yield token;
    }
  }
}

registerClass("Dotenv\\Parser\\Lexer", Lexer);
