// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\CannotUseOnlyMethodsException` (Story 4.7).
import { Exception } from "../../Exception/Exception";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class CannotUseOnlyMethodsException extends Exception {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\CannotUseOnlyMethodsException";

  constructor(type: string, methodName: string) {
    super(`Trying to configure method "${methodName}" with onlyMethods(), but it does not exist in class "${type}"`);
    this.name = "CannotUseOnlyMethodsException";
  }
}
