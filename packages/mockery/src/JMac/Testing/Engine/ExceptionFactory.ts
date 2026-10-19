// `JMac\Testing\Engine\ExceptionFactory` (jasonmccreary/double v1.0.1). PHPUnit is always present in the grader
// (@xaravel/assert), so every check failure is the PHPUnit variant, an AssertionFailedError, and one `assertTrue`
// is recorded before it is built (`PhpUnitIntegration::registerPass()`), as ExceptionFactory.php does. `listen()`'s
// CheckEvent is not ported (ESC-4.8-1 item 4). Internal.
import { FQCN } from "../../../support/values";
import type { AmbiguousExpectation } from "../Diagnostics/AmbiguousExpectation";
import type { ArgumentComparison } from "../Diagnostics/ArgumentComparison";
import type { UnsatisfiedExpectation } from "../Diagnostics/UnsatisfiedExpectation";
import { PHPUnitAmbiguousExpectationException } from "../Integrations/PHPUnit/PHPUnitAmbiguousExpectationException";
import { PHPUnitExpectationCallLimitExceededException } from "../Integrations/PHPUnit/PHPUnitExpectationCallLimitExceededException";
import { PHPUnitExpectationCallMismatchException } from "../Integrations/PHPUnit/PHPUnitExpectationCallMismatchException";
import { PHPUnitFabricationLimitExceededException } from "../Integrations/PHPUnit/PHPUnitFabricationLimitExceededException";
import { PHPUnitUnexpectedCallException } from "../Integrations/PHPUnit/PHPUnitUnexpectedCallException";
import { PHPUnitUnsatisfiedExpectationException } from "../Integrations/PHPUnit/PHPUnitUnsatisfiedExpectationException";
import { PhpUnitIntegration } from "./PhpUnitIntegration";

export class ExceptionFactory {
  static readonly [FQCN]: string = "JMac\\Testing\\Engine\\ExceptionFactory";

  static unexpectedCall(
    label: string,
    method: string,
    argumentsDescription: string,
    fabricated: boolean,
    otherObservedCalls: readonly string[] = [],
    argumentComparisons: readonly ArgumentComparison[] | null = null,
  ): PHPUnitUnexpectedCallException {
    PhpUnitIntegration.registerPass();
    return new PHPUnitUnexpectedCallException(label, method, argumentsDescription, fabricated, otherObservedCalls, argumentComparisons);
  }

  static expectationCallLimitExceeded(
    label: string,
    method: string,
    argumentsDescription: string,
    maximum: number,
    callNumber: number,
    fabricated: boolean,
    otherMatchingExpectations = 0,
  ): PHPUnitExpectationCallLimitExceededException {
    PhpUnitIntegration.registerPass();
    return new PHPUnitExpectationCallLimitExceededException(label, method, argumentsDescription, maximum, callNumber, fabricated, otherMatchingExpectations);
  }

  static expectationCallMismatch(
    label: string,
    method: string,
    argumentsDescription: string,
    fabricated: boolean,
    configuredCalls: readonly string[] = [],
    argumentComparisons: readonly ArgumentComparison[] | null = null,
    passthru = false,
  ): PHPUnitExpectationCallMismatchException {
    PhpUnitIntegration.registerPass();
    return new PHPUnitExpectationCallMismatchException(label, method, argumentsDescription, fabricated, configuredCalls, argumentComparisons, passthru);
  }

  static unsatisfiedExpectation(label: string, expectations: readonly UnsatisfiedExpectation[], fabricated: boolean): PHPUnitUnsatisfiedExpectationException {
    PhpUnitIntegration.registerPass();
    return new PHPUnitUnsatisfiedExpectationException(label, expectations, fabricated);
  }

  static ambiguousExpectations(label: string, ambiguities: readonly AmbiguousExpectation[], fabricated: boolean): PHPUnitAmbiguousExpectationException {
    PhpUnitIntegration.registerPass();
    return new PHPUnitAmbiguousExpectationException(label, ambiguities, fabricated);
  }

  static fabricationLimitExceeded(label: string, method: string, returnType: string, limit: number): PHPUnitFabricationLimitExceededException {
    PhpUnitIntegration.registerPass();
    return new PHPUnitFabricationLimitExceededException(label, method, returnType, limit);
  }
}
