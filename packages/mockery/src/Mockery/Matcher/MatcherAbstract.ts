// `Mockery\Matcher\MatcherAbstract` (Mockery 1.6.15). Internal in Story 4.5:
// Story 4.6 exports the argument matchers.
import { FQCN } from "../../support/values";

export abstract class MatcherAbstract {
  static readonly [FQCN]: string = "Mockery\\Matcher\\MatcherAbstract";

  protected readonly _expected: unknown;

  constructor(expected: unknown = null) {
    this._expected = expected;
  }

  /** Whether `actual` matches; an ArgumentListMatcher receives the whole argument list. */
  abstract match(actual: unknown): boolean;

  abstract toString(): string;

  /** `instanceof ArgumentListMatcher`: the matcher stands for the whole argument list. */
  isArgumentListMatcher(): boolean {
    return false;
  }
}
