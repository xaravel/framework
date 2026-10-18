// sebastian/comparator 8.4.0's `ComparisonFailure` (Stories 4.3 and 4.4):
// thrown by a comparator when two values are not equal, carrying both values
// and their exported forms. PHPUnit attaches it to an ExpectationFailedException.
//
// `getDiff()` is sebastian/diff 9.0.1's strict unified diff of the two
// exported strings, with comparator's options (header
// `"\n--- Expected\n+++ Actual\n"`, no line numbers, `contextLines` lines of
// context, the line-ending warning shown, no end-of-file marker), and
// `toString()` is `getMessage()` followed by it (ESC-4.3-1 item 12).
import { Differ } from "../diff/Differ";
import { StrictUnifiedDiffOutputBuilder } from "../diff/StrictUnifiedDiffOutputBuilder";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class ComparisonFailure extends Error {
  static readonly [CLASS_FQCN] = "SebastianBergmann\\Comparator\\ComparisonFailure";

  readonly #expected: unknown;
  readonly #actual: unknown;
  readonly #expectedAsString: string;
  readonly #actualAsString: string;
  readonly #message: string;
  readonly #contextLines: number;

  constructor(expected: unknown, actual: unknown, expectedAsString: string, actualAsString: string, message = "", contextLines = 3) {
    super(message);
    this.name = "ComparisonFailure";
    this.#expected = expected;
    this.#actual = actual;
    this.#expectedAsString = expectedAsString;
    this.#actualAsString = actualAsString;
    this.#message = message;
    this.#contextLines = contextLines;
  }

  getExpected(): unknown {
    return this.#expected;
  }

  getActual(): unknown {
    return this.#actual;
  }

  getExpectedAsString(): string {
    return this.#expectedAsString;
  }

  getActualAsString(): string {
    return this.#actualAsString;
  }

  getMessage(): string {
    return this.#message;
  }

  getDiff(): string {
    if (this.#actualAsString === "" && this.#expectedAsString === "") {
      return "";
    }
    const differ = new Differ(
      new StrictUnifiedDiffOutputBuilder({
        header: "\n--- Expected\n+++ Actual\n",
        addLineNumbers: false,
        contextLines: this.#contextLines,
        emitDiffLineEndWarning: true,
        emitNoLineEndEofWarning: false,
      }),
    );
    return differ.diff(this.#expectedAsString, this.#actualAsString);
  }

  override toString(): string {
    return this.getMessage() + this.getDiff();
  }
}
