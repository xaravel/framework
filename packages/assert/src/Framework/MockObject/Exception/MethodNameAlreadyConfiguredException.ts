// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\MethodNameAlreadyConfiguredException` (Story 4.7).
import { Exception } from "../../Exception/Exception";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class MethodNameAlreadyConfiguredException extends Exception {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\MethodNameAlreadyConfiguredException";

  constructor() {
    super("Method name is already configured");
    this.name = "MethodNameAlreadyConfiguredException";
  }
}
