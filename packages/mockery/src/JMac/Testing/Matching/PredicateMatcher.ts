// `JMac\Testing\Matching\PredicateMatcher` (jasonmccreary/double v1.0.1): `Argument.satisfies(fn)`, a match when
// `(bool) fn(actual)` is true. PHP's `(bool)` cast: false, 0, 0.0, '', '0', an empty array and null are false.
import { arrayEntries, FQCN, isPhpArray } from "../../../support/values";
import { ValueFormatter } from "../Diagnostics/ValueFormatter";
import { Matcher } from "./Matcher";

function phpBool(value: unknown): boolean {
  if (value === "0") {
    return false;
  }
  if (typeof value === "number" && Number.isNaN(value)) {
    // PHP's `(bool) NAN` is true.
    return true;
  }
  if (isPhpArray(value)) {
    return arrayEntries(value).length > 0;
  }
  return Boolean(value);
}

export class PredicateMatcher extends Matcher {
  static override readonly [FQCN]: string = "JMac\\Testing\\Matching\\PredicateMatcher";

  readonly #predicate: (actual: any) => unknown;

  constructor(predicate: (actual: any) => unknown) {
    super();
    this.#predicate = predicate;
  }

  matches(actual: unknown): boolean {
    return phpBool(this.#predicate(actual));
  }

  describe(): string {
    return "satisfies(...)";
  }

  explainMismatch(actual: unknown): string | null {
    if (this.matches(actual)) {
      return null;
    }
    return `value did not satisfy predicate: ${ValueFormatter.describe(actual)}`;
  }
}
