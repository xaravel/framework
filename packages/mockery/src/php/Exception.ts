// PHP's `\Exception`, grader-internal (Story 4.5, ESC-4.5-1 item 2): the root
// of the SPL parents of Mockery's exceptions. Not exported from the package.
import { FQCN, shortClassName } from "../support/values";

export class Exception extends Error {
  static readonly [FQCN]: string = "Exception";

  readonly #code: number;
  readonly #previous: Error | null;

  constructor(message: string = "", code: number = 0, previous: Error | null = null) {
    super(message);
    this.#code = code;
    this.#previous = previous;
    // Not enumerable: it is no public PHP property (formatObjects reads those).
    Object.defineProperty(this, "name", { value: shortClassName(new.target), writable: true, configurable: true, enumerable: false });
  }

  getMessage(): string {
    return this.message;
  }

  getCode(): number {
    return this.#code;
  }

  getPrevious(): Error | null {
    return this.#previous;
  }
}
