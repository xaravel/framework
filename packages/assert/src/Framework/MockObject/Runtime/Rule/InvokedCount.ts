// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\Rule\InvokedCount` (Story 4.7):
// `once()`, `never()` and `exactly(n)`.
//
// A call past the expected count throws at once. Every exception this class
// throws is marked, so MockObjectRegistry's `handleExceptionFromInvokedCountRule`
// counts it as one assertion, as PHPUnit does when the trace's first frame is
// this class.
import { ExpectationFailedException } from "../../../ExpectationFailedException";
import type { Invocation } from "../Invocation";
import { InvocationOrder } from "./InvocationOrder";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const FROM_INVOKED_COUNT = Symbol("thrown by InvokedCount");

/** Whether `value` was thrown by an InvokedCount rule (PHPUnit reads the trace's first frame). Internal. */
export function isFromInvokedCountRule(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[FROM_INVOKED_COUNT] === true;
}

function marked(error: ExpectationFailedException): ExpectationFailedException {
  Object.defineProperty(error, FROM_INVOKED_COUNT, { value: true });
  return error;
}

export class InvokedCount extends InvocationOrder {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\Rule\\InvokedCount";

  readonly #expectedCount: number;

  constructor(expectedCount: number) {
    super();
    this.#expectedCount = expectedCount;
  }

  isNever(): boolean {
    return this.#expectedCount === 0;
  }

  toString(): string {
    if (this.#expectedCount === 1) {
      return "invoked once";
    }
    return `invoked ${this.#expectedCount} times`;
  }

  matches(_invocation: Invocation): boolean {
    return true;
  }

  verify(): void {
    const actualCount = this.numberOfInvocations();
    if (actualCount !== this.#expectedCount) {
      throw marked(
        new ExpectationFailedException(
          `Method was expected to be called ${this.#expectedCount} time${this.#expectedCount !== 1 ? "s" : ""}, actually called ${actualCount} time${actualCount !== 1 ? "s" : ""}.`,
        ),
      );
    }
  }

  protected override invokedDo(invocation: Invocation): void {
    const count = this.numberOfInvocations();
    if (count > this.#expectedCount) {
      let message = `${invocation.toString()} `;
      switch (this.#expectedCount) {
        case 0:
          message += "was not expected to be called";
          break;
        case 1:
          message += "was not expected to be called more than once";
          break;
        default:
          message += `was not expected to be called more than ${this.#expectedCount} times`;
      }
      message += `, actually called ${count} time${count !== 1 ? "s" : ""}.`;
      throw marked(new ExpectationFailedException(message));
    }
  }
}
