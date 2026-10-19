// `JMac\Testing\Diagnostics\UnsatisfiedExpectation` (jasonmccreary/double v1.0.1): one unmet `expects()`
// expectation and every observed call of its method. Internal.
import { FQCN } from "../../../support/values";
import type { ArgumentComparison } from "./ArgumentComparison";

export class UnsatisfiedExpectation {
  static readonly [FQCN]: string = "JMac\\Testing\\Diagnostics\\UnsatisfiedExpectation";

  constructor(
    readonly method: string,
    readonly description: string,
    readonly expectedMin: number,
    readonly expectedMax: number,
    readonly timesCalled: number,
    readonly otherObservedCalls: readonly string[],
    readonly argumentMismatch: string | null = null,
    readonly argumentComparisons: readonly ArgumentComparison[] | null = null,
  ) {}
}
