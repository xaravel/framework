// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\MethodNameNotConfiguredException` (Story 4.7).
import { Exception } from "../../Exception/Exception";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class MethodNameNotConfiguredException extends Exception {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\MethodNameNotConfiguredException";

  constructor() {
    super("Method name is not configured");
    this.name = "MethodNameNotConfiguredException";
  }
}
