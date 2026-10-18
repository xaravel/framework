// sebastian/comparator 8.4.0's `ComparisonFailure` (Story 4.3): thrown by a
// comparator when two values are not equal, carrying both values and their
// exported forms. PHPUnit attaches it to an ExpectationFailedException.
const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class ComparisonFailure extends Error {
  static readonly [CLASS_FQCN] = "SebastianBergmann\\Comparator\\ComparisonFailure";

  readonly #expected: unknown;
  readonly #actual: unknown;
  readonly #expectedAsString: string;
  readonly #actualAsString: string;

  constructor(expected: unknown, actual: unknown, expectedAsString: string, actualAsString: string, message = "") {
    super(message);
    this.name = "ComparisonFailure";
    this.#expected = expected;
    this.#actual = actual;
    this.#expectedAsString = expectedAsString;
    this.#actualAsString = actualAsString;
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
}
