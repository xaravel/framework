// `Mockery\ReceivedMethodCalls` (Mockery 1.6.15): every call a mock received,
// which `shouldHaveReceived` verifies after the fact.
import { FQCN } from "../support/values";
import type { Expectation } from "./Expectation";
import type { MethodCall } from "./MethodCall";

export class ReceivedMethodCalls {
  static readonly [FQCN]: string = "Mockery\\ReceivedMethodCalls";

  readonly #methodCalls: MethodCall[] = [];

  push(methodCall: MethodCall): void {
    this.#methodCalls.push(methodCall);
  }

  /** Replays each call of the expectation's method whose arguments match, then verifies its count. */
  verify(expectation: Expectation): void {
    for (const methodCall of this.#methodCalls) {
      if (methodCall.getMethod() !== expectation.getName()) {
        continue;
      }
      if (!expectation.matchArgs(methodCall.getArgs())) {
        continue;
      }
      expectation.verifyCall(methodCall.getArgs());
    }
    expectation.verify();
  }
}
