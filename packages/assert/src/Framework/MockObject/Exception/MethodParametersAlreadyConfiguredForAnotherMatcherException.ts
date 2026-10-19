// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\MethodParametersAlreadyConfiguredForAnotherMatcherException` (Story 4.7).
import { Exception } from "../../Exception/Exception";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class MethodParametersAlreadyConfiguredForAnotherMatcherException extends Exception {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\MethodParametersAlreadyConfiguredForAnotherMatcherException";

  constructor(methodName: string) {
    super(`Parameters for method "${methodName}" are already configured for another matcher. with() configures an expectation (the method must be called with the specified arguments), it does not select a return value based on arguments. Use willReturnMap() to return different values based on arguments.`);
    this.name = "MethodParametersAlreadyConfiguredForAnotherMatcherException";
  }
}
