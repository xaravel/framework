// `Mockery\CountValidator\Exact` (Mockery 1.6.15).
import { InvalidCountException } from "../Exception/InvalidCountException";
import { FQCN } from "../../support/values";
import { CountValidatorAbstract } from "./CountValidatorAbstract";

export class Exact extends CountValidatorAbstract {
  static override readonly [FQCN]: string = "Mockery\\CountValidator\\Exact";

  validate(n: number): void {
    if (this._limit !== n) {
      const because = this._expectation.getExceptionMessage();
      const invalidCountException = new InvalidCountException(
        `Method ${this._expectation.toString()} from ${this._expectation.getMock().mockery_getName()} should be called\n exactly ${this._limit} times but called ${n} times.` + (because !== null && because !== "" && because !== "0" ? ` Because ${because}` : ""),
      );
      invalidCountException
        .setMock(this._expectation.getMock())
        .setMethodName(this._expectation.toString())
        .setExpectedCountComparative("=")
        .setExpectedCount(this._limit)
        .setActualCount(n);
      throw invalidCountException;
    }
  }
}
