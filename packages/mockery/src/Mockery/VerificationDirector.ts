// `Mockery\VerificationDirector` (Mockery 1.6.15): what `shouldHaveReceived`
// returns. Each constraint verifies at once, on a copy of the expectation.
import { FQCN } from "../support/values";
import type { ReceivedMethodCalls } from "./ReceivedMethodCalls";
import type { VerificationExpectation } from "./VerificationExpectation";

export class VerificationDirector {
  static readonly [FQCN]: string = "Mockery\\VerificationDirector";

  readonly #receivedMethodCalls: ReceivedMethodCalls;
  readonly #verificationExpectation: VerificationExpectation;

  constructor(receivedMethodCalls: ReceivedMethodCalls, expectation: VerificationExpectation) {
    this.#receivedMethodCalls = receivedMethodCalls;
    this.#verificationExpectation = expectation;
  }

  atLeast(): VerificationDirector {
    return this.cloneWithoutCountValidatorsApplyAndVerify((expectation) => expectation.atLeast());
  }

  atMost(): VerificationDirector {
    return this.cloneWithoutCountValidatorsApplyAndVerify((expectation) => expectation.atMost());
  }

  once(): VerificationDirector {
    return this.cloneWithoutCountValidatorsApplyAndVerify((expectation) => expectation.once());
  }

  times(limit: number | null = null): VerificationDirector {
    return this.cloneWithoutCountValidatorsApplyAndVerify((expectation) => expectation.times(limit));
  }

  twice(): VerificationDirector {
    return this.cloneWithoutCountValidatorsApplyAndVerify((expectation) => expectation.twice());
  }

  verify(): void {
    this.#receivedMethodCalls.verify(this.#verificationExpectation);
  }

  with(...args: unknown[]): VerificationDirector {
    return this.cloneApplyAndVerify((expectation) => expectation.with(...args));
  }

  withAnyArgs(): VerificationDirector {
    return this.cloneApplyAndVerify((expectation) => expectation.withAnyArgs());
  }

  withArgs(args: readonly unknown[] | ((...args: any[]) => unknown)): VerificationDirector {
    return this.cloneApplyAndVerify((expectation) => expectation.withArgs(args));
  }

  withNoArgs(): VerificationDirector {
    return this.cloneApplyAndVerify((expectation) => expectation.withNoArgs());
  }

  protected cloneApplyAndVerify(apply: (expectation: VerificationExpectation) => unknown): VerificationDirector {
    const verificationExpectation = this.#verificationExpectation.clone();
    apply(verificationExpectation);
    const verificationDirector = new VerificationDirector(this.#receivedMethodCalls, verificationExpectation);
    verificationDirector.verify();
    return verificationDirector;
  }

  protected cloneWithoutCountValidatorsApplyAndVerify(apply: (expectation: VerificationExpectation) => unknown): VerificationDirector {
    const verificationExpectation = this.#verificationExpectation.clone();
    verificationExpectation.clearCountValidators();
    apply(verificationExpectation);
    const verificationDirector = new VerificationDirector(this.#receivedMethodCalls, verificationExpectation);
    verificationDirector.verify();
    return verificationDirector;
  }
}
