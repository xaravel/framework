// `JMac\Testing\Matching\Argument` (jasonmccreary/double v1.0.1): the argument-matcher facade, in the subset the ai,
// mcp and boost suites use: `type` and `satisfies`. The other matchers (`any`, `all`, `capture`, `remaining`, `none`,
// `same`, `not`, `matches`, `contains`) have no Upstream use (ESC-4.8-1 item 4).
import { FQCN } from "../../../support/values";
import type { Matcher } from "./Matcher";
import { PredicateMatcher } from "./PredicateMatcher";
import { TypeMatcher, type TypeTarget } from "./TypeMatcher";

export class Argument {
  static readonly [FQCN]: string = "JMac\\Testing\\Matching\\Argument";

  private constructor() {}

  /** A PHP type name (`'string'`, `'int'`, …, `'mixed'`), a class or interface name, a class or a contract token. */
  static type(type: string | TypeTarget): Matcher {
    return new TypeMatcher(type);
  }

  /** A match when `predicate(actual)` is truthy as PHP's `(bool)` reads it. */
  static satisfies(predicate: (actual: any) => unknown): Matcher {
    return new PredicateMatcher(predicate);
  }
}
