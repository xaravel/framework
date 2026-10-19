// PHPUnit 13.4.3's `PHPUnit\Framework\TestCase\MockObjectRegistry` (Story 4.7):
// the mock objects a TestCase made, verified after the test body.
//
// `verify` counts one assertion per mock object that has an invocation count
// rule (any rule but `any()`) and verifies it; a mock object without one is
// skipped. PHPUnit's "No expectations were configured" notice and its risky
// "not been sealed" check are not emitted (ESC-4.7-1 item 3).
import { ExpectationFailedException } from "../ExpectationFailedException";
import { invocationHandlerOf, resetInvocationHandler } from "../MockObject/Generator/Generator";
import { isFromInvokedCountRule } from "../MockObject/Runtime/Rule/InvokedCount";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

/** What the registry needs of its TestCase. */
interface Counting {
  addToAssertionCount(count: number): void;
}

export class MockObjectRegistry {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\TestCase\\MockObjectRegistry";

  #mockObjects: { readonly type: unknown; readonly mockObject: object }[] = [];

  register(type: unknown, mockObject: object): void {
    this.#mockObjects.push({ type, mockObject });
  }

  clear(): void {
    this.#mockObjects = [];
  }

  verify(test: Counting): void {
    for (const { mockObject } of this.#mockObjects) {
      const handler = invocationHandlerOf(mockObject);
      if (handler === null || !handler.hasInvocationCountRule()) {
        continue;
      }
      test.addToAssertionCount(1);
      handler.verify();
      resetInvocationHandler(mockObject, (count) => test.addToAssertionCount(count));
    }
  }

  /** An expectation failure an invocation count rule threw while the test body ran counts as an assertion. */
  handleExceptionFromInvokedCountRule(test: Counting, thrown: unknown): void {
    if (!(thrown instanceof ExpectationFailedException)) {
      return;
    }
    if (isFromInvokedCountRule(thrown)) {
      test.addToAssertionCount(1);
    }
  }
}
