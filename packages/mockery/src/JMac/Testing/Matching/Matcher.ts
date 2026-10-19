// `JMac\Testing\Matching\Matcher` (jasonmccreary/double v1.0.1): every argument constraint. PHP's interface is an
// abstract class here, so `with()` can tell a matcher from a literal by `instanceof`. Internal (exported as a type).
import { FQCN } from "../../../support/values";

export abstract class Matcher {
  static readonly [FQCN]: string = "JMac\\Testing\\Matching\\Matcher";

  abstract matches(actual: unknown): boolean;

  abstract describe(): string;

  /** Null when it matched; otherwise why it did not. */
  abstract explainMismatch(actual: unknown): string | null;
}
