// PHPUnit 13.4.3's `AssertionFailedError` (Stories 4.3 and 4.4): the base of
// every failed assertion, which Upstream tests catch (`catch
// (AssertionFailedError $e)`), and what `fail()` throws.
//
// `getMessage()` is PHPUnit's `getMessage()`, exactly, and `toString()` is
// `getMessage()` (PHPUnit's SelfDescribing). A subclass may make the JS
// `message` longer (ExpectationFailedException adds both compared values,
// for bun's failure output); a port of `$e->getMessage()` calls `e.getMessage()`.
import { Exception } from "./Exception/Exception";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class AssertionFailedError extends Exception {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\AssertionFailedError";

  constructor(message: string = "", code: number | string = 0, previous: Error | null = null) {
    super(message, code, previous);
    this.name = "AssertionFailedError";
  }

  override toString(): string {
    return this.getMessage();
  }
}
