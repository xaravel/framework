// PHPUnit 13.4.3's `Constraint`, `LogicalNot`, `LogicalOr` and `LogicalAnd`
// (Stories 4.3 and 4.4): how an assertion evaluates and words its failure.
// `Constraint` is exported (Story 4.4's `assertThat` takes one); the
// operators are built through `Assert`'s factories (`logicalAnd`, …).
import { isPhpArray } from "../comparison/PhpComparison";
import { classNameOf, gettype, isPhpObject } from "../comparison/PhpValues";
import { phpunitExport } from "../exporter/Exporter";
import type { ComparisonFailure } from "./ComparisonFailure";
import { ExpectationFailedException } from "./ExpectationFailedException";

export abstract class Constraint {
  evaluate(other: unknown, description = "", returnResult = false): boolean | null {
    const success = this.matches(other);
    if (returnResult) {
      return success;
    }
    if (!success) {
      this.fail(other, description);
    }
    return null;
  }

  protected matches(_other: unknown): boolean {
    return false;
  }

  abstract toString(): string;

  fail(other: unknown, description: string, comparisonFailure: ComparisonFailure | null = null): never {
    let failureDescription = `Failed asserting that ${this.failureDescription(other)}.`;
    const additional = this.additionalFailureDescription(other);
    if (additional !== "") {
      failureDescription += `\n${additional}`;
    }
    if (description !== "") {
      failureDescription = `${description}\n${failureDescription}`;
    }
    throw new ExpectationFailedException(failureDescription, comparisonFailure);
  }

  additionalFailureDescription(_other: unknown): string {
    return "";
  }

  failureDescription(other: unknown): string {
    return `${phpunitExport(other)} ${this.toString()}`;
  }

  negatedToString(): string {
    return "";
  }

  negatedFailureDescription(other: unknown): string {
    const text = this.negatedToString();
    return text === "" ? "" : `${phpunitExport(other)} ${text}`;
  }
}

/** `Constraint::valueToTypeStringFragment`. */
export function valueToTypeStringFragment(value: unknown): string {
  if (isPhpObject(value)) {
    return `an instance of class ${classNameOf(value)} `;
  }
  let type = gettype(value).toLowerCase();
  if (type === "double") {
    type = "float";
  }
  if (type === "resource (closed)") {
    type = "closed resource";
  }
  switch (type) {
    case "array":
    case "integer":
      return `an ${type} `;
    case "boolean":
    case "closed resource":
    case "float":
    case "resource":
    case "string":
      return `a ${type} `;
    case "null":
      return "null ";
    default:
      return `a value of ${type} `;
  }
}

/** Arrays and objects are described by type, other values by their export (IsTrue, IsFalse, IsNull, IsNan). */
export function describeByTypeForContainers(other: unknown, text: string): string {
  if ((typeof other === "object" && other !== null && isPhpArray(other)) || isPhpObject(other)) {
    return valueToTypeStringFragment(other) + text;
  }
  return `${phpunitExport(other)} ${text}`;
}

const POSITIVES = ["contains ", "exists", "has ", "is ", "are ", "matches ", "starts with ", "ends with ", "reference ", "not not "];
const NEGATIVES = ["does not contain ", "does not exist", "does not have ", "is not ", "are not ", "does not match ", "starts not with ", "ends not with ", "don't reference ", "not "];
const PATTERNS = POSITIVES.map((text) => new RegExp(`\\b${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"));

/** `LogicalNot::negate`: negates the wording outside quoted segments. */
export function negate(text: string): string {
  const segments = text.split(/('[^']*'|"[^"]*")/);
  return segments
    .map((segment, index) => {
      if (index % 2 === 1) {
        return segment;
      }
      let result = segment;
      PATTERNS.forEach((pattern, position) => {
        result = result.replace(pattern, () => NEGATIVES[position]!);
      });
      return result;
    })
    .join("");
}

export class LogicalNot extends Constraint {
  constructor(private readonly constraint: Constraint) {
    super();
  }

  protected override matches(other: unknown): boolean {
    return this.constraint.evaluate(other, "", true) === false;
  }

  toString(): string {
    const text = this.constraint.negatedToString();
    return text !== "" ? text : negate(this.constraint.toString());
  }

  override failureDescription(other: unknown): string {
    const text = this.constraint.negatedFailureDescription(other);
    return text !== "" ? text : negate(this.constraint.failureDescription(other));
  }
}

/** PHPUnit's `BinaryOperator`: operands joined by the operator, parenthesised by precedence. */
abstract class BinaryOperator extends Constraint {
  protected readonly constraints: readonly Constraint[];

  constructor(constraints: readonly Constraint[]) {
    super();
    this.constraints = constraints;
  }

  abstract operator(): string;

  abstract precedence(): number;

  arity(): number {
    return this.constraints.length;
  }

  toString(): string {
    if (this.constraints.length === 1 && this.constraints[0] instanceof BinaryOperator) {
      return this.constraints[0].toString();
    }
    return this.constraints
      .map((constraint, position) => {
        const prefix = position > 0 ? ` ${this.operator()} ` : "";
        const needsParentheses = this.arity() > 1 && constraint instanceof BinaryOperator && constraint.arity() > 1 && this.precedence() <= constraint.precedence();
        return needsParentheses ? `${prefix}( ${constraint.toString()} )` : prefix + constraint.toString();
      })
      .join("");
  }
}

export class LogicalOr extends BinaryOperator {
  constructor(...constraints: Constraint[]) {
    super(constraints);
  }

  operator(): string {
    return "or";
  }

  precedence(): number {
    return 24;
  }

  protected override matches(other: unknown): boolean {
    return this.constraints.some((constraint) => constraint.evaluate(other, "", true) === true);
  }
}

export class LogicalAnd extends BinaryOperator {
  constructor(...constraints: Constraint[]) {
    super(constraints);
  }

  operator(): string {
    return "and";
  }

  precedence(): number {
    return 22;
  }

  protected override matches(other: unknown): boolean {
    for (const constraint of this.constraints) {
      if (constraint.evaluate(other, "", true) === false) {
        return false;
      }
    }
    return this.constraints.length > 0;
  }
}
