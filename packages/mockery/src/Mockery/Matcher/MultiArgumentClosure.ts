// `Mockery\Matcher\MultiArgumentClosure` (Mockery 1.6.15), an ArgumentListMatcher. Internal in Story 4.5.
import { FQCN } from "../../support/values";
import { MatcherAbstract } from "./MatcherAbstract";

export class MultiArgumentClosure extends MatcherAbstract {
  static override readonly [FQCN]: string = "Mockery\\Matcher\\MultiArgumentClosure";

  match(actual: unknown): boolean {
    return (this._expected as (...args: unknown[]) => unknown)(...(actual as unknown[])) === true;
  }

  toString(): string {
    return "<MultiArgumentClosure===true>";
  }

  override isArgumentListMatcher(): boolean {
    return true;
  }
}
