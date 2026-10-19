// `JMac\Testing\Integrations\PHPUnit\PHPUnitExpectationCallLimitExceededException` (jasonmccreary/double v1.0.1):
// the PHPUnit variant of ExpectationCallLimitExceededException, an AssertionFailedError. Internal.
import { AssertionFailedError } from "@xaravel/assert";
import { FQCN } from "../../../../support/values";
import { ExpectationCallLimitExceededFields } from "../../Exceptions/ExpectationCallLimitExceededFields";

export class PHPUnitExpectationCallLimitExceededException extends AssertionFailedError {
  static readonly [FQCN]: string = "JMac\\Testing\\Integrations\\PHPUnit\\PHPUnitExpectationCallLimitExceededException";

  constructor(
    readonly label: string,
    readonly method: string,
    readonly argumentsDescription: string,
    readonly maximum: number,
    readonly callNumber: number,
    readonly fabricated = false,
    readonly otherMatchingExpectations = 0,
  ) {
    super(ExpectationCallLimitExceededFields.renderMessage(label, method, argumentsDescription, maximum, callNumber, fabricated, otherMatchingExpectations));
    this.name = "PHPUnitExpectationCallLimitExceededException";
  }

  getDiagnostic(): this {
    return this;
  }
}
