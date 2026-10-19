// `JMac\Testing\Integrations\PHPUnit\PHPUnitExpectationCallMismatchException` (jasonmccreary/double v1.0.1): the
// PHPUnit variant of ExpectationCallMismatchException, an AssertionFailedError. Internal.
import { AssertionFailedError } from "@xaravel/assert";
import { FQCN } from "../../../../support/values";
import type { ArgumentComparison } from "../../Diagnostics/ArgumentComparison";
import { ExpectationCallMismatchFields } from "../../Exceptions/ExpectationCallMismatchFields";

export class PHPUnitExpectationCallMismatchException extends AssertionFailedError {
  static readonly [FQCN]: string = "JMac\\Testing\\Integrations\\PHPUnit\\PHPUnitExpectationCallMismatchException";

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
    this.name = "PHPUnitExpectationCallMismatchException";
  }

  getDiagnostic(): this {
    return this;
  }
}
