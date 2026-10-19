// `JMac\Testing\Exceptions\AmbiguousExpectationException` (jasonmccreary/double v1.0.1): ambiguous expectations at
// verification. ExceptionFactory throws the PHPUnit variant. Internal.
import { FQCN } from "../../../support/values";
import type { AmbiguousExpectation } from "../Diagnostics/AmbiguousExpectation";
import { AmbiguousExpectationFields } from "./AmbiguousExpectationFields";
import { DoubleException } from "./DoubleException";

export class AmbiguousExpectationException extends DoubleException {
  static override readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\AmbiguousExpectationException";

  constructor(
    readonly label: string,
    readonly ambiguities: readonly AmbiguousExpectation[],
    readonly fabricated = false,
  ) {
    super(AmbiguousExpectationFields.renderMessage(label, ambiguities, fabricated));
  }
}
