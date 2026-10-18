// PHPUnit 13.4.3's `Constraint\JsonMatches` (Story 4.4): two JSON documents
// are equal once canonicalized (object keys sorted). Its failure carries a
// ComparisonFailure of both documents, prettified. Internal to the grader.
import { canonicalize, jsonDecode, prettify, toPhpValue } from "../../util/Json";
import { ComparisonFailure } from "../ComparisonFailure";
import { Constraint } from "../Constraint";

export class JsonMatches extends Constraint {
  constructor(private readonly value: string) {
    super();
  }

  toString(): string {
    return `matches JSON string "${this.value}"`;
  }

  override negatedToString(): string {
    return `does not match JSON string "${this.value}"`;
  }

  protected override matches(other: unknown): boolean {
    if (typeof other !== "string") {
      return false;
    }
    const [otherError, recodedOther] = canonicalize(other);
    if (otherError) {
      return false;
    }
    const [valueError, recodedValue] = canonicalize(this.value);
    if (valueError) {
      return false;
    }
    return recodedOther === recodedValue;
  }

  override fail(other: unknown, description: string, comparisonFailure: ComparisonFailure | null = null): never {
    if (comparisonFailure === null && typeof other === "string") {
      const [otherError, recodedOther] = canonicalize(other);
      if (otherError) {
        return super.fail(other, description);
      }
      const [valueError, recodedValue] = canonicalize(this.value);
      if (valueError) {
        return super.fail(other, description);
      }
      const decoded = (json: string): unknown => {
        const result = jsonDecode(json);
        return result.error === 0 ? toPhpValue(result.value) : null;
      };
      comparisonFailure = new ComparisonFailure(decoded(this.value), decoded(other), prettify(recodedValue), prettify(recodedOther), "Failed asserting that two json values are equal.");
    }
    return super.fail(other, description, comparisonFailure);
  }
}
