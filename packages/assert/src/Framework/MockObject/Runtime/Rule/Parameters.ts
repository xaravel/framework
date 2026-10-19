// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\Rule\Parameters` (Story 4.7):
// `with(…)`. An argument that is not a Constraint is `IsEqual` to it.
//
// Each check counts one assertion through the TestCase that made the double
// (PHPUnit's `Test::currentTestCase()->addToAssertionCount(1)`): one for a
// too-short call, else one per constrained argument. A parameter is named by
// the doubled method's declared name (`$x`, read from its source), else by
// its index. Arguments are positional only, so PHP's named-argument forms do
// not exist here.
import { Constraint } from "../../../Constraint";
import { IsEqual } from "../../../Constraints";
import { ExpectationFailedException } from "../../../ExpectationFailedException";
import type { Invocation } from "../Invocation";
import type { ParametersRule } from "./ParametersRule";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class Parameters implements ParametersRule {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\Rule\\Parameters";

  readonly #parameters: readonly Constraint[];
  readonly #addToAssertionCount: (count: number) => void;
  #invocation: Invocation | null = null;
  /** PHP's `null|bool|ExpectationFailedException`; `null` is unset (`isset` is false). */
  #parameterVerificationResult: boolean | ExpectationFailedException | null = null;

  constructor(parameters: readonly unknown[], addToAssertionCount: (count: number) => void) {
    this.#parameters = parameters.map((parameter) => (parameter instanceof Constraint ? parameter : new IsEqual(parameter)));
    this.#addToAssertionCount = addToAssertionCount;
  }

  apply(invocation: Invocation): void {
    this.#invocation = invocation;
    this.#parameterVerificationResult = null;
    try {
      this.#parameterVerificationResult = this.#doVerify();
    } catch (error) {
      if (error instanceof ExpectationFailedException) {
        this.#parameterVerificationResult = error;
      }
      throw error;
    }
  }

  verify(): void {
    this.#doVerify();
  }

  #doVerify(): boolean {
    if (this.#parameterVerificationResult !== null) {
      if (this.#parameterVerificationResult instanceof ExpectationFailedException) {
        throw this.#parameterVerificationResult;
      }
      return this.#parameterVerificationResult;
    }
    if (this.#invocation === null) {
      throw new ExpectationFailedException("Doubled method does not exist.");
    }
    const invocation = this.#invocation;
    const invocationParameters = invocation.parameters();
    if (this.#parameters.length > invocationParameters.length) {
      this.#addToAssertionCount(1);
      throw new ExpectationFailedException(`Parameter count for invocation ${invocation.toString()} is too low.`);
    }
    const names = invocation.parameterNames();
    this.#parameters.forEach((parameter, index) => {
      const other = invocationParameters[index] ?? null;
      const parameterName = names[index] ?? String(index);
      this.#addToAssertionCount(1);
      parameter.evaluate(other, `Parameter ${parameterName} for invocation ${invocation.toString()} does not match expected value.`);
    });
    return true;
  }
}
