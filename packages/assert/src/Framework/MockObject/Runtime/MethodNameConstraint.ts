// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\MethodNameConstraint` (Story 4.7):
// a method name, compared case-insensitively as PHP compares method names.
import { Constraint } from "../../Constraint";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class MethodNameConstraint extends Constraint {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\MethodNameConstraint";

  readonly #methodName: string;

  constructor(methodName: string) {
    super();
    this.#methodName = methodName;
  }

  methodName(): string {
    return this.#methodName;
  }

  toString(): string {
    return `is "${this.#methodName}"`;
  }

  protected override matches(other: unknown): boolean {
    if (typeof other !== "string") {
      return false;
    }
    return this.#methodName.toLowerCase() === other.toLowerCase();
  }
}
