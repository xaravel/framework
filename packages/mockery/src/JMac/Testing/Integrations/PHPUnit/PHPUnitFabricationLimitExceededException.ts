// `JMac\Testing\Integrations\PHPUnit\PHPUnitFabricationLimitExceededException` (jasonmccreary/double v1.0.1): the
// PHPUnit variant of FabricationLimitExceededException, an AssertionFailedError. Internal.
import { AssertionFailedError } from "@xaravel/assert";
import { FQCN } from "../../../../support/values";
import { FabricationLimitExceededFields } from "../../Exceptions/FabricationLimitExceededFields";

export class PHPUnitFabricationLimitExceededException extends AssertionFailedError {
  static readonly [FQCN]: string = "JMac\\Testing\\Integrations\\PHPUnit\\PHPUnitFabricationLimitExceededException";

  constructor(
    readonly label: string,
    readonly method: string,
    readonly returnType: string,
    readonly limit: number,
  ) {
    super(FabricationLimitExceededFields.renderMessage(label, method));
    this.name = "PHPUnitFabricationLimitExceededException";
  }

  getDiagnostic(): this {
    return this;
  }
}
