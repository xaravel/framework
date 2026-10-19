// `JMac\Testing\Diagnostics\AmbiguousExpectation` (jasonmccreary/double v1.0.1): two or more expectations of one
// method with identical argument matching, each with a finite call limit. Internal.
import { FQCN } from "../../../support/values";

export class AmbiguousExpectation {
  static readonly [FQCN]: string = "JMac\\Testing\\Diagnostics\\AmbiguousExpectation";

  constructor(
    readonly method: string,
    readonly argumentsDescription: string,
    readonly count: number,
  ) {}
}
