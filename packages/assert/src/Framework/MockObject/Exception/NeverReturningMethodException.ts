// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\NeverReturningMethodException` (Story 9.11): an unconfigured call of a
// method declared `never`. PHP: `final class NeverReturningMethodException extends RuntimeException` (the global
// `\RuntimeException`, imported by `use RuntimeException;`), so it extends the grader's internal
// `RuntimeExceptionParent`, which links it to the runtime's `RuntimeException` when the runtime's class map is
// published.
import { RuntimeExceptionParent } from "../../Exception/RuntimeExceptionParent";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class NeverReturningMethodException extends RuntimeExceptionParent {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\NeverReturningMethodException";

  constructor(className: string, methodName: string) {
    super(`Method ${className}::${methodName}() is declared to never return`);
    this.name = "NeverReturningMethodException";
  }
}
