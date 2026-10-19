// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\MethodNamedMethodException` (Story 4.7).
import { Exception } from "../../Exception/Exception";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class MethodNamedMethodException extends Exception {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\MethodNamedMethodException";

  constructor() {
    super('Doubling interfaces (or classes) that have a method named "method" is not supported.');
    this.name = "MethodNamedMethodException";
  }
}
