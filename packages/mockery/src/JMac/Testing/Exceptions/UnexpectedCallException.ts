// `JMac\Testing\Exceptions\UnexpectedCallException` (jasonmccreary/double v1.0.1): Strict mode got a call no
// expectation matches. The grader always has PHPUnit, so ExceptionFactory throws the PHPUnit variant. Internal.
import { FQCN } from "../../../support/values";
import type { ArgumentComparison } from "../Diagnostics/ArgumentComparison";
import { DoubleException } from "./DoubleException";
import { UnexpectedCallFields } from "./UnexpectedCallFields";

export class UnexpectedCallException extends DoubleException {
  static override readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\UnexpectedCallException";

  constructor(
    readonly label: string,
    readonly method: string,
    readonly argumentsDescription: string,
    readonly fabricated = false,
    readonly otherObservedCalls: readonly string[] = [],
    readonly argumentComparisons: readonly ArgumentComparison[] | null = null,
  ) {
    super(UnexpectedCallFields.renderMessage(label, method, argumentsDescription, fabricated, otherObservedCalls, argumentComparisons));
  }
}
