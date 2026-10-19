// `JMac\Testing\Integrations\PHPUnit\PHPUnitAmbiguousExpectationException` (jasonmccreary/double v1.0.1): the PHPUnit
// variant of AmbiguousExpectationException, an AssertionFailedError. Internal.
import { AssertionFailedError } from "@xaravel/assert";
import { FQCN } from "../../../../support/values";
import type { AmbiguousExpectation } from "../../Diagnostics/AmbiguousExpectation";
import { AmbiguousExpectationFields } from "../../Exceptions/AmbiguousExpectationFields";

export class PHPUnitAmbiguousExpectationException extends AssertionFailedError {
  static readonly [FQCN]: string = "JMac\\Testing\\Integrations\\PHPUnit\\PHPUnitAmbiguousExpectationException";

  constructor(
    readonly label: string,
    readonly ambiguities: readonly AmbiguousExpectation[],
    readonly fabricated = false,
  ) {
    super(AmbiguousExpectationFields.renderMessage(label, ambiguities, fabricated));
    this.name = "PHPUnitAmbiguousExpectationException";
  }

  getDiagnostic(): this {
    return this;
  }
}
