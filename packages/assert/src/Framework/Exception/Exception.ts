// PHPUnit 13.4.3's `PHPUnit\Framework\Exception` (Story 4.4, ESC-4.3-1 item 12):
// the base of every PHPUnit exception (PHP's `\RuntimeException` subclass).
//
// As in PHP, `code` is an int or a string: a string code is appended to the
// message as ` (exception code: <code>)` and the code becomes 0
// (sebastian-bergmann/phpunit#5965). `previous` is also the JS `cause`, and
// `code` a non-enumerable own property, so the grader's exporter and
// comparators read both as they read any JS error's.
const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class Exception extends Error {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\Exception";

  readonly #message: string;
  readonly #code: number;
  readonly #previous: Error | null;

  constructor(message: string = "", code: number | string = 0, previous: Error | null = null) {
    let text = String(message);
    let numeric = 0;
    if (typeof code === "number" && Number.isInteger(code)) {
      numeric = code;
    } else {
      text += ` (exception code: ${String(code)})`;
    }
    super(text, previous === null ? undefined : { cause: previous });
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
}
