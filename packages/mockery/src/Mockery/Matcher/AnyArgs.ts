// `Mockery\Matcher\AnyArgs` (Mockery 1.6.15), an ArgumentListMatcher. Internal in Story 4.5.
import { FQCN } from "../../support/values";
import { MatcherAbstract } from "./MatcherAbstract";

export class AnyArgs extends MatcherAbstract {
  static override readonly [FQCN]: string = "Mockery\\Matcher\\AnyArgs";

  match(_actual: unknown): boolean {
    return true;
  }

  toString(): string {
    return "<Any Arguments>";
  }

  override isArgumentListMatcher(): boolean {
    return true;
  }
}
