// PHPUnit 13.4.3's `ExpectationFailedException` (Stories 4.3 and 4.4): a failed assertion.
//
// `getMessage()` is PHPUnit's `getMessage()`, exactly. When a ComparisonFailure
// with exported values is attached, the JS `message` also names both values, as
// PHPUnit's diff does: `"\n--- Expected\n" + expectedAsString + "\n+++ Actual\n"
// + actualAsString`, so bun's failure output shows them (`messageSuffix()`,
// which the message rewrite protocol keeps).
import { AssertionFailedError } from "./AssertionFailedError";
import type { ComparisonFailure } from "./ComparisonFailure";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class ExpectationFailedException extends AssertionFailedError {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\ExpectationFailedException";

  readonly #comparisonFailure: ComparisonFailure | null;

  constructor(message: string, comparisonFailure: ComparisonFailure | null = null, previous: Error | null = null) {
    super(message, 0, previous);
    this.name = "ExpectationFailedException";
    this.#comparisonFailure = comparisonFailure;
    this.message = this.getMessage() + this.messageSuffix();
  }

  /** PHPUnit's diff header with both exported values, when the comparison failure has them. */
  protected override messageSuffix(): string {
    const expected = this.#comparisonFailure?.getExpectedAsString() ?? "";
    const actual = this.#comparisonFailure?.getActualAsString() ?? "";
    return expected !== "" || actual !== "" ? `\n--- Expected\n${expected}\n+++ Actual\n${actual}` : "";
  }

  getComparisonFailure(): ComparisonFailure | null {
    return this.#comparisonFailure;
  }
}
