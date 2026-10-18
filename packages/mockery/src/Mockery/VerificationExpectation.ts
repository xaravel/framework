// `Mockery\VerificationExpectation` (Mockery 1.6.15): the expectation a
// `shouldHaveReceived` verifies against the received calls.
import { FQCN } from "../support/values";
import { Expectation } from "./Expectation";

export class VerificationExpectation extends Expectation {
  static override readonly [FQCN]: string = "Mockery\\VerificationExpectation";

  /** PHP's `__clone`: Expectation's, with the call count reset. */
  protected override __clone(): void {
    super.__clone();
    this._actualCount = 0;
  }

  clearCountValidators(): void {
    this._countValidators = new Map();
  }
}
