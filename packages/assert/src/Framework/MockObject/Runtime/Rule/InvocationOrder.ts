// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\Rule\InvocationOrder` (Story 4.7):
// the invocation count rule of a matcher (`once()`, `never()`, `any()`, …).
import type { Invocation } from "../Invocation";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export abstract class InvocationOrder {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\Rule\\InvocationOrder";

  readonly #invocations: Invocation[] = [];

  numberOfInvocations(): number {
    return this.#invocations.length;
  }

  hasBeenInvoked(): boolean {
    return this.#invocations.length > 0;
  }

  invoked(invocation: Invocation): void {
    this.#invocations.push(invocation);
    this.invokedDo(invocation);
  }

  abstract matches(invocation: Invocation): boolean;

  abstract verify(): void;

  abstract toString(): string;

  protected invokedDo(_invocation: Invocation): void {}
}
