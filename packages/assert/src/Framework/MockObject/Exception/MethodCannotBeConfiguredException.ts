// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\MethodCannotBeConfiguredException` (Story 4.7).
import { Exception } from "../../Exception/Exception";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class MethodCannotBeConfiguredException extends Exception {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\MethodCannotBeConfiguredException";

  constructor(method: string) {
    super(`Trying to configure method "${method}" which cannot be configured because it does not exist, has not been specified, is final, or is static`);
    this.name = "MethodCannotBeConfiguredException";
  }
}
