// `JMac\Testing\Exceptions\ExpectationCallMismatchException` (jasonmccreary/double v1.0.1): a call to a method with
// expects() configured that matches none of its expectations. ExceptionFactory throws the PHPUnit variant. Internal.
import { FQCN } from "../../../support/values";
import type { ArgumentComparison } from "../Diagnostics/ArgumentComparison";
import { DoubleException } from "./DoubleException";
import { ExpectationCallMismatchFields } from "./ExpectationCallMismatchFields";

export class ExpectationCallMismatchException extends DoubleException {
  static override readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\ExpectationCallMismatchException";

  constructor(
    readonly label: string,
    readonly method: string,
    readonly argumentsDescription: string,
    readonly fabricated = false,
    readonly configuredCalls: readonly string[] = [],
    readonly argumentComparisons: readonly ArgumentComparison[] | null = null,
    readonly passthru = false,
  ) {
    super(ExpectationCallMismatchFields.renderMessage(label, method, argumentsDescription, fabricated, configuredCalls, argumentComparisons, passthru));
  }
}
