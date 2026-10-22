// PHPUnit 13.4.3's `EmptyStringException` (Story 4.3): an empty prefix or suffix. Internal to the grader.
// PHP: `EmptyStringException extends InvalidArgumentException` (PHPUnit's, `extends Exception`, which
// `extends \RuntimeException`), so it sits on the runtime's `RuntimeException` once linked (Story 9.11).
import { RuntimeExceptionParent } from "./RuntimeExceptionParent";

export class EmptyStringException extends RuntimeExceptionParent {
  constructor() {
    super("");
    this.name = "EmptyStringException";
  }
}
