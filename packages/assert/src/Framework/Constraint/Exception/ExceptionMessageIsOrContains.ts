// PHPUnit 13.4.3's `Constraint\ExceptionMessageIsOrContains` (Story 4.4). Internal to the grader.
import { phpunitExport } from "../../../exporter/Exporter";
import { Constraint } from "../../Constraint";

export class ExceptionMessageIsOrContains extends Constraint {
  constructor(private readonly expectedMessage: string) {
    super();
  }

  toString(): string {
    return this.expectedMessage === "" ? "exception message is empty" : `exception message contains ${phpunitExport(this.expectedMessage)}`;
  }

  override negatedToString(): string {
    return this.expectedMessage === "" ? "exception message is not empty" : `exception message does not contain ${phpunitExport(this.expectedMessage)}`;
  }

  protected override matches(other: unknown): boolean {
    if (this.expectedMessage === "") {
      return other === "";
    }
    return typeof other === "string" && other.includes(this.expectedMessage);
  }

  override failureDescription(other: unknown): string {
    const message = typeof other === "string" ? other : "";
    if (this.expectedMessage === "") {
      return `exception message is empty but is '${message}'`;
    }
    return `exception message '${message}' contains '${this.expectedMessage}'`;
  }

  override negatedFailureDescription(other: unknown): string {
    const message = typeof other === "string" ? other : "";
    if (this.expectedMessage === "") {
      return `exception message is not empty but is '${message}'`;
    }
    return `exception message '${message}' does not contain '${this.expectedMessage}'`;
  }
}
