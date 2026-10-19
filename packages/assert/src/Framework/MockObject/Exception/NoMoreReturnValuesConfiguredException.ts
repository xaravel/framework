// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\NoMoreReturnValuesConfiguredException` (Story 4.7).
import { Exception } from "../../Exception/Exception";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class NoMoreReturnValuesConfiguredException extends Exception {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\NoMoreReturnValuesConfiguredException";

  constructor(className: string, methodName: string, numberOfConfiguredReturnValues: number) {
    super(`Only ${numberOfConfiguredReturnValues} return values have been configured for ${className}::${methodName}()`);
    this.name = "NoMoreReturnValuesConfiguredException";
  }
}
