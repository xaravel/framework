// `Mockery\CountValidator\AtMost` (Mockery 1.6.15).
import { InvalidCountException } from "../Exception/InvalidCountException";
import { FQCN } from "../../support/values";
import { CountValidatorAbstract } from "./CountValidatorAbstract";

export class AtMost extends CountValidatorAbstract {
  static override readonly [FQCN]: string = "Mockery\\CountValidator\\AtMost";

  validate(n: number): void {
    if (this._limit < n) {
      const invalidCountException = new InvalidCountException(
        `Method ${this._expectation.toString()} from ${this._expectation.getMock().mockery_getName()} should be called\n at most ${this._limit} times but called ${n} times.`,
      );
      invalidCountException
        .setMock(this._expectation.getMock())
        .setMethodName(this._expectation.toString())
        .setExpectedCountComparative("<=")
        .setExpectedCount(this._limit)
        .setActualCount(n);
      throw invalidCountException;
    }
  }
}
