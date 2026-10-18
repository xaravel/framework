// PHPUnit 13.4.3's `Constraint\Exception` (Story 4.4): the thrown value is an
// instance of the expected class or interface token. A wrong-class message
// ends with the JS stack's frame locations in place of PHP's trace
// (ESC-4.4-2 item 3). Internal to the grader.
import { classNameOf } from "../../../comparison/PhpValues";
import { Constraint } from "../../Constraint";
import { classOrInterface } from "../../Constraints";
import { isThrowable, messageOf, stackTraceOf } from "../../Throwable";

export class Exception extends Constraint {
  private readonly checked: ReturnType<typeof classOrInterface>;

  constructor(className: unknown) {
    super();
    this.checked = classOrInterface(className);
  }

  toString(): string {
    return `exception of type "${this.checked.name}"`;
  }

  override negatedToString(): string {
    return `exception of type "${this.checked.name}" is not thrown`;
  }

  protected override matches(other: unknown): boolean {
    return this.checked.test(other);
  }

  override failureDescription(other: unknown): string {
    if (!isThrowable(other)) {
      return `exception of type "${this.checked.name}" is thrown`;
    }
    const message = `. Message was: "${messageOf(other)}" at\n${stackTraceOf(other)}`;
    return `exception of type "${classNameOf(other)}" matches expected exception "${this.checked.name}"${message}`;
  }

  override negatedFailureDescription(other: unknown): string {
    if (!isThrowable(other)) {
      return this.negatedToString();
    }
    const message = `. Message was: "${messageOf(other)}" at\n${stackTraceOf(other)}`;
    return `exception of type "${classNameOf(other)}" does not match expected exception "${this.checked.name}"${message}`;
  }
}
