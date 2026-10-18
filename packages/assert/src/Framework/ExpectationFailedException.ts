// PHPUnit 13.4.3's `ExpectationFailedException` (Story 4.3): a failed assertion.
//
// `getMessage()` is PHPUnit's `getMessage()`, exactly. When a ComparisonFailure
// with exported values is attached, the JS `message` also names both values, as
// PHPUnit's diff does: `"\n--- Expected\n" + expectedAsString + "\n+++ Actual\n"
// + actualAsString`, so bun's failure output shows them.
import { AssertionFailedError } from "./AssertionFailedError";
import type { ComparisonFailure } from "./ComparisonFailure";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class ExpectationFailedException extends AssertionFailedError {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\ExpectationFailedException";

  readonly #comparisonFailure: ComparisonFailure | null;

  constructor(message: string, comparisonFailure: ComparisonFailure | null = null) {
    super(message);
    this.name = "ExpectationFailedException";
    this.#comparisonFailure = comparisonFailure;
    const expected = comparisonFailure?.getExpectedAsString() ?? "";
    const actual = comparisonFailure?.getActualAsString() ?? "";
    if (expected !== "" || actual !== "") {
      this.message = `${message}\n--- Expected\n${expected}\n+++ Actual\n${actual}`;
    }
  }

  getComparisonFailure(): ComparisonFailure | null {
    return this.#comparisonFailure;
  }
}
