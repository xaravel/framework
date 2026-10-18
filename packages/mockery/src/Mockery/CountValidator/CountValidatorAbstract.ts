// `Mockery\CountValidator\CountValidatorAbstract` (Mockery 1.6.15).
import type { Expectation } from "../Expectation";
import { FQCN } from "../../support/values";

export abstract class CountValidatorAbstract {
  static readonly [FQCN]: string = "Mockery\\CountValidator\\CountValidatorAbstract";

  protected readonly _expectation: Expectation;
  protected readonly _limit: number;

  constructor(expectation: Expectation, limit: number) {
    this._expectation = expectation;
    this._limit = limit;
  }

  /** Whether the expectation may take another call after `n` calls. */
  isEligible(n: number): boolean {
    return n < this._limit;
  }

  /** Throws an InvalidCountException when `n` calls break the limit. */
  abstract validate(n: number): void;
}
