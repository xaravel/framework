// `Mockery\Matcher\Any` (Mockery 1.6.15): `Mockery.any()`, matching any one argument.
import { FQCN } from "../../support/values";
import { MatcherAbstract } from "./MatcherAbstract";

export class Any extends MatcherAbstract {
  static override readonly [FQCN]: string = "Mockery\\Matcher\\Any";

  match(_actual: unknown): boolean {
    return true;
  }

  toString(): string {
    return "<Any>";
  }
}
