// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\RuntimeException` (Story 9.11): a return value or a declared default
// a test double cannot produce. PHP: `final class RuntimeException extends \RuntimeException`, so it extends the
// grader's internal `RuntimeExceptionParent`, which links it to the runtime's `RuntimeException` when the runtime's
// class map is published.
import { RuntimeExceptionParent } from "../../Exception/RuntimeExceptionParent";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class RuntimeException extends RuntimeExceptionParent {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\RuntimeException";

  constructor(message: string = "", code: number = 0, previous: Error | null = null) {
    super(message, code, previous);
    this.name = "RuntimeException";
  }
}
