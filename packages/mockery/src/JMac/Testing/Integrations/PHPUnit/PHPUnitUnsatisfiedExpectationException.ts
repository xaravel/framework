// `JMac\Testing\Integrations\PHPUnit\PHPUnitUnsatisfiedExpectationException` (jasonmccreary/double v1.0.1): the
// PHPUnit variant of UnsatisfiedExpectationException, an AssertionFailedError. Internal.
import { AssertionFailedError } from "@xaravel/assert";
import { FQCN } from "../../../../support/values";
import type { UnsatisfiedExpectation } from "../../Diagnostics/UnsatisfiedExpectation";
import { UnsatisfiedExpectationFields } from "../../Exceptions/UnsatisfiedExpectationFields";

export class PHPUnitUnsatisfiedExpectationException extends AssertionFailedError {
  static readonly [FQCN]: string = "JMac\\Testing\\Integrations\\PHPUnit\\PHPUnitUnsatisfiedExpectationException";

  constructor(
    readonly label: string,
    readonly expectations: readonly UnsatisfiedExpectation[],
    readonly fabricated = false,
  ) {
    super(UnsatisfiedExpectationFields.renderMessage(label, expectations, fabricated));
    this.name = "PHPUnitUnsatisfiedExpectationException";
  }

  getDiagnostic(): this {
    return this;
  }
}
