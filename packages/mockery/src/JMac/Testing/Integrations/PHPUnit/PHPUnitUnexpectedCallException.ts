// `JMac\Testing\Integrations\PHPUnit\PHPUnitUnexpectedCallException` (jasonmccreary/double v1.0.1): the PHPUnit
// variant of UnexpectedCallException, an AssertionFailedError. Internal.
import { AssertionFailedError } from "@xaravel/assert";
import { FQCN } from "../../../../support/values";
import type { ArgumentComparison } from "../../Diagnostics/ArgumentComparison";
import { UnexpectedCallFields } from "../../Exceptions/UnexpectedCallFields";

export class PHPUnitUnexpectedCallException extends AssertionFailedError {
  static readonly [FQCN]: string = "JMac\\Testing\\Integrations\\PHPUnit\\PHPUnitUnexpectedCallException";

  constructor(
    readonly label: string,
    readonly method: string,
    readonly argumentsDescription: string,
    readonly fabricated = false,
    readonly otherObservedCalls: readonly string[] = [],
    readonly argumentComparisons: readonly ArgumentComparison[] | null = null,
  ) {
    super(UnexpectedCallFields.renderMessage(label, method, argumentsDescription, fabricated, otherObservedCalls, argumentComparisons));
    this.name = "PHPUnitUnexpectedCallException";
  }

  getDiagnostic(): this {
    return this;
  }
}
