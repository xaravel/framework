// `JMac\Testing\Exceptions\FabricationLimitExceededException` (jasonmccreary/double v1.0.1): an unconfigured call
// chain went deeper than one fabricated double. ExceptionFactory throws the PHPUnit variant. Internal.
import { FQCN } from "../../../support/values";
import { DoubleException } from "./DoubleException";
import { FabricationLimitExceededFields } from "./FabricationLimitExceededFields";

export class FabricationLimitExceededException extends DoubleException {
  static override readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\FabricationLimitExceededException";

  constructor(
    readonly label: string,
    readonly method: string,
    readonly returnType: string,
    readonly limit: number,
  ) {
    super(FabricationLimitExceededFields.renderMessage(label, method));
  }
}
