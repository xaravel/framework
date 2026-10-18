// `Mockery\Matcher\Closure` (Mockery 1.6.15): `Mockery.on(fn)` and
// `Mockery.capture(ref)`, matching an argument when `fn` returns exactly `true`.
import { FQCN } from "../../support/values";
import { MatcherAbstract } from "./MatcherAbstract";

export class Closure extends MatcherAbstract {
  static override readonly [FQCN]: string = "Mockery\\Matcher\\Closure";

  match(actual: unknown): boolean {
    return (this._expected as (actual: unknown) => unknown)(actual) === true;
  }

  toString(): string {
    return "<Closure===true>";
  }
}
