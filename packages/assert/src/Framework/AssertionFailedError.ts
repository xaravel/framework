// PHPUnit 13.4.3's `AssertionFailedError` (Story 4.3): the base of every failed
// assertion, which Upstream tests catch (`catch (AssertionFailedError $e)`).
//
// `getMessage()` is PHPUnit's `getMessage()`, exactly. A subclass may make the
// JS `message` longer (ExpectationFailedException adds both compared values,
// for bun's failure output); a port of `$e->getMessage()` calls `e.getMessage()`.
const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class AssertionFailedError extends Error {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\AssertionFailedError";

  readonly #message: string;

  constructor(message = "") {
    super(message);
    this.name = "AssertionFailedError";
    this.#message = message;
  }

  getMessage(): string {
    return this.#message;
  }
}
