// PHPUnit 13.4.3's `PHPUnit\Framework\Exception` (Story 4.4, ESC-4.3-1 item 12):
// the base of PHPUnit's framework exceptions (assertion failures, skips, the
// test-double configuration errors). PHP's source declares
// `class Exception extends RuntimeException`, so it extends the grader's
// internal `RuntimeExceptionParent`, which links it to the runtime's
// `\RuntimeException` when the runtime's class map is published (Story 9.11).
//
// As in PHP, `code` is an int or a string: a string code is appended to the
// message as ` (exception code: <code>)` and the code becomes 0
// (sebastian-bergmann/phpunit#5965). `previous` is also the JS `cause`, and
// `code` a non-enumerable own property, so the grader's exporter and
// comparators read both as they read any JS error's.
//
// The message rewrite protocol (Story 9.11, ESC-4.3-1 item 11): every
// `PHPUnit\Framework\Exception` (this class and its subclasses; not
// `MockObject\RuntimeException`, `NeverReturningMethodException`,
// `ComparisonFailure` or `InvalidJsonException`, which PHP does not derive from
// it) has a non-enumerable method under
// `Symbol.for('xaravel.assert.setMessage')`, which Laravel's
// `TestResponseAssert::appendMessageToException` port calls in place of PHP's
// reflection on `message`, without importing the grader. Called with a string,
// it makes that string what `getMessage()` returns, and the JS `message` that
// string plus the suffix the class adds (`messageSuffix()`); code, previous,
// cause and any comparison failure are unchanged. It returns `null`.
import { isMarkedFloat, phpToString } from "../../comparison/PhpValues";
import { RuntimeExceptionParent } from "./RuntimeExceptionParent";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const SET_MESSAGE = Symbol.for("xaravel.assert.setMessage");

export class Exception extends RuntimeExceptionParent {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\Exception";

  #message: string;
  readonly #code: number;
  readonly #previous: Error | null;

  constructor(message: string = "", code: number | string = 0, previous: Error | null = null) {
    let text = String(message);
    let numeric = 0;
    // A marked float reads as its number (Story 9.11): an integral one is an int code, as coercive mode makes it.
    const given: unknown = isMarkedFloat(code) ? Number(code) : code;
    if (typeof given === "number" && Number.isInteger(given)) {
      numeric = given + 0;
    } else {
      text += ` (exception code: ${isMarkedFloat(code) ? phpToString(code) : String(code)})`;
    }
    // The code is this class's own read-only property (below), so the parent gets none.
    super(text, 0, previous instanceof Error ? previous : null);
    this.name = "Exception";
    this.#message = text;
    this.#code = numeric;
    this.#previous = previous;
    Object.defineProperty(this, "code", { value: numeric, writable: false, enumerable: false, configurable: false });
  }

  /** PHP's `getMessage()`: the message as built, whatever a subclass adds to the JS `message`. */
  getMessage(): string {
    return this.#message;
  }

  getCode(): number {
    return this.#code;
  }

  getPrevious(): Error | null {
    return this.#previous;
  }

  /** What a subclass adds to the JS `message` after `getMessage()`; none here. */
  protected messageSuffix(): string {
    return "";
  }

  /** The message rewrite protocol: `getMessage()` becomes `message`, the JS `message` keeps the class's suffix. */
  [SET_MESSAGE](message: unknown): null {
    if (typeof message !== "string") {
      throw new TypeError(`Symbol.for('xaravel.assert.setMessage'): the message must be a string, got ${message === null ? "null" : typeof message}`);
    }
    this.#message = message;
    this.message = message + this.messageSuffix();
    return null;
  }
}
