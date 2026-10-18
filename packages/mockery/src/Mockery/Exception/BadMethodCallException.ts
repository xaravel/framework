// `Mockery\Exception\BadMethodCallException` (Mockery 1.6.15): thrown for a call
// to a method that has no expectation. Its parent is the grader-internal PHP
// `\BadMethodCallException` (ESC-4.5-1 item 2).
import { BadMethodCallException as PhpBadMethodCallException } from "../../php/BadMethodCallException";
import { FQCN } from "../../support/values";

export class BadMethodCallException extends PhpBadMethodCallException {
  static override readonly [FQCN]: string = "Mockery\\Exception\\BadMethodCallException";

  #dismissed = false;

  dismiss(): void {
    this.#dismissed = true;
    // We sometimes stack them.
    const previous = this.getPrevious();
    if (!(previous instanceof BadMethodCallException)) {
      return;
    }
    previous.dismiss();
  }

  dismissed(): boolean {
    return this.#dismissed;
  }
}
