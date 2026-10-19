// `JMac\Testing\Exceptions\ExpectationCallLimitExceededException` (jasonmccreary/double v1.0.1): a call over its
// expectation's maximum. ExceptionFactory throws the PHPUnit variant. Internal.
import { FQCN } from "../../../support/values";
import { DoubleException } from "./DoubleException";
import { ExpectationCallLimitExceededFields } from "./ExpectationCallLimitExceededFields";

export class ExpectationCallLimitExceededException extends DoubleException {
  static override readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\ExpectationCallLimitExceededException";

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
  }
}
