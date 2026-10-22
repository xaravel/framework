// PHPUnit 13.4.3's `EmptyStringException` (Story 4.3): an empty prefix or suffix. Internal to the grader.
// PHP: `EmptyStringException extends InvalidArgumentException` (PHPUnit's abstract one, not ported here, which
// `extends Exception`), so it extends the grader's PHPUnit `Exception`, which reaches the runtime's
// `RuntimeException` once linked (Story 9.11).
import { Exception } from "./Exception";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class EmptyStringException extends Exception {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\EmptyStringException";

  constructor() {
    super("");
    this.name = "EmptyStringException";
  }
}
