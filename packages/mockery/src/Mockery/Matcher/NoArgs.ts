// `Mockery\Matcher\NoArgs` (Mockery 1.6.15), an ArgumentListMatcher. Internal in Story 4.5.
import { FQCN } from "../../support/values";
import { MatcherAbstract } from "./MatcherAbstract";

export class NoArgs extends MatcherAbstract {
  static override readonly [FQCN]: string = "Mockery\\Matcher\\NoArgs";

  match(actual: unknown): boolean {
    return Array.isArray(actual) && actual.length === 0;
  }

  toString(): string {
    return "<No Arguments>";
  }

  override isArgumentListMatcher(): boolean {
    return true;
  }
}
