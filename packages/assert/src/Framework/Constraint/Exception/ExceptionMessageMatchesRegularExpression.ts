// PHPUnit 13.4.3's `Constraint\ExceptionMessageMatchesRegularExpression`
// (Story 4.4). The pattern is a JS `RegExp` (DIV-10), printed as its literal
// (`String(regexp)`), which is the PCRE pattern where the two agree.
// Internal to the grader.
import { phpunitExport } from "../../../exporter/Exporter";
import { Constraint } from "../../Constraint";

export class ExceptionMessageMatchesRegularExpression extends Constraint {
  constructor(private readonly regularExpression: RegExp) {
    super();
  }

  private get pattern(): string {
    return String(this.regularExpression);
  }

  toString(): string {
    return `exception message matches ${phpunitExport(this.pattern)}`;
  }

  override negatedToString(): string {
    return `exception message does not match ${phpunitExport(this.pattern)}`;
  }

  protected override matches(other: unknown): boolean {
    if (typeof other !== "string") {
      return false;
    }
    // One preg_match() call: a fresh RegExp without `g`/`y`, so neither `lastIndex` nor sticky anchoring applies
    // (as Constraint\RegularExpression does).
    return new RegExp(this.regularExpression.source, this.regularExpression.flags.replace(/[gy]/g, "")).test(other);
  }

  override failureDescription(other: unknown): string {
    const message = typeof other === "string" ? other : "";
    return `exception message '${message}' matches '${this.pattern}'`;
  }

  override negatedFailureDescription(other: unknown): string {
    const message = typeof other === "string" ? other : "";
    return `exception message '${message}' does not match '${this.pattern}'`;
  }
}
