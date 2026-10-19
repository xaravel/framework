// `JMac\Testing\Exceptions\UnsatisfiedExpectationException` (jasonmccreary/double v1.0.1): unmet expects()
// expectations at verification. ExceptionFactory throws the PHPUnit variant. Internal.
import { FQCN } from "../../../support/values";
import type { UnsatisfiedExpectation } from "../Diagnostics/UnsatisfiedExpectation";
import { DoubleException } from "./DoubleException";
import { UnsatisfiedExpectationFields } from "./UnsatisfiedExpectationFields";

export class UnsatisfiedExpectationException extends DoubleException {
  static override readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\UnsatisfiedExpectationException";

  constructor(
    readonly label: string,
    readonly expectations: readonly UnsatisfiedExpectation[],
    readonly fabricated = false,
  ) {
    super(UnsatisfiedExpectationFields.renderMessage(label, expectations, fabricated));
  }
}
