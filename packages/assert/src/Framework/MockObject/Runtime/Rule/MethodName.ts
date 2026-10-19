// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\Rule\MethodName` (Story 4.7):
// the method a matcher applies to, a name or a Constraint.
import { Constraint } from "../../../Constraint";
import type { Invocation } from "../Invocation";
import { MethodNameConstraint } from "../MethodNameConstraint";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class MethodName {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\Rule\\MethodName";

  readonly #constraint: Constraint;

  constructor(constraint: Constraint | string) {
    this.#constraint = typeof constraint === "string" ? new MethodNameConstraint(constraint) : constraint;
  }

  toString(): string {
    return `method name ${this.#constraint.toString()}`;
  }

  failureDescription(className: string): string {
    if (this.#constraint instanceof MethodNameConstraint) {
      return `${className}::${this.#constraint.methodName()}()`;
    }
    return this.toString();
  }

  matches(invocation: Invocation): boolean {
    return this.matchesName(invocation.methodName());
  }

  matchesName(methodName: string): boolean {
    return Boolean(this.#constraint.evaluate(methodName, "", true));
  }
}
