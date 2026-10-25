// `JMac\Testing\Matching\EqualsMatcher` (jasonmccreary/double v1.0.1): the implicit matcher of a literal passed to
// `with()`. Two arrays match when their keys are identical and in the same order and each value matches; an expected
// object matches by PHP `==`; anything else by `===`. A contract token is its FQCN class-string (AD-9.8), so a token
// expected or given is compared as that string, strictly, as Upstream compares a class-string. The comparisons are
// @xaravel/assert's.
import { classString, phpLooseEquals, phpStrictEquals } from "@xaravel/assert";
import { arrayEntries, FQCN, isPhpArray, isPhpObject } from "../../../support/values";
import { ValueFormatter } from "../Diagnostics/ValueFormatter";
import { Matcher } from "./Matcher";

function equals(expectedGiven: unknown, actualGiven: unknown): boolean {
  const expected = classString(expectedGiven);
  const actual = classString(actualGiven);
  if (isPhpArray(expected) && isPhpArray(actual)) {
    const expectedEntries = arrayEntries(expected);
    const actualEntries = arrayEntries(actual);
    if (expectedEntries.length !== actualEntries.length || expectedEntries.some(([key], index) => key !== actualEntries[index]![0])) {
      return false;
    }
    return expectedEntries.every(([, value], index) => equals(value, actualEntries[index]![1]));
  }
  return isPhpObject(expected) ? phpLooseEquals(expected, actual) : phpStrictEquals(expected, actual);
}

export class EqualsMatcher extends Matcher {
  static override readonly [FQCN]: string = "JMac\\Testing\\Matching\\EqualsMatcher";

  readonly #expected: unknown;

  constructor(expected: unknown) {
    super();
    this.#expected = expected;
  }

  /** The raw expected value, for StringDiffer and the array dump. */
  expected(): unknown {
    return this.#expected;
  }

  matches(actual: unknown): boolean {
    return equals(this.#expected, actual);
  }

  describe(): string {
    return ValueFormatter.describe(this.#expected);
  }

  explainMismatch(actual: unknown): string | null {
    if (this.matches(actual)) {
      return null;
    }
    return `expected ${ValueFormatter.describe(this.#expected)}, got ${ValueFormatter.describe(actual)}`;
  }
}
