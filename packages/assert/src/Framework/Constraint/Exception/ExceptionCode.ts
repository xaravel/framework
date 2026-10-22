// PHPUnit 13.4.3's `Constraint\ExceptionCode` (Story 4.4). Internal to the grader.
import { unmarkFloat } from "../../../comparison/PhpValues";
import { phpunitExport } from "../../../exporter/Exporter";
import { Constraint } from "../../Constraint";

function isIntOrString(value: unknown): value is number | bigint | string {
  return typeof value === "string" || typeof value === "bigint" || (typeof value === "number" && Number.isInteger(value));
}

export class ExceptionCode extends Constraint {
  constructor(private readonly expectedCode: number | string) {
    super();
  }

  toString(): string {
    return `exception code is ${String(this.expectedCode)}`;
  }

  override negatedToString(): string {
    return `exception code is not ${String(this.expectedCode)}`;
  }

  protected override matches(given: unknown): boolean {
    // A marked float reads as its number (Story 9.11), so an integral one matches as the int it stands for.
    const other = unmarkFloat(given);
    if (!isIntOrString(other)) {
      return false;
    }
    return String(other) === String(this.expectedCode);
  }

  override failureDescription(other: unknown): string {
    return `${phpunitExport(other)} is equal to expected exception code ${phpunitExport(this.expectedCode)}`;
  }

  override negatedFailureDescription(other: unknown): string {
    return `${phpunitExport(other)} is not equal to expected exception code ${phpunitExport(this.expectedCode)}`;
  }
}
