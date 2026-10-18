// PHPUnit 13.4.3's `Constraint`, `LogicalNot` and `LogicalOr` (Story 4.3):
// how an assertion evaluates and words its failure. Internal to the grader;
// Story 4.4's `assertThat` exposes constraints.
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

export class LogicalOr extends Constraint {
  private readonly constraints: readonly Constraint[];

  constructor(...constraints: Constraint[]) {
    super();
    this.constraints = constraints;
  }

  protected override matches(other: unknown): boolean {
    return this.constraints.some((constraint) => constraint.evaluate(other, "", true) === true);
  }

  toString(): string {
    return this.constraints.map((constraint) => constraint.toString()).join(" or ");
  }
}
