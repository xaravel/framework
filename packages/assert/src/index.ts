// @xaravel/assert: the grader's public surface (Stories 4.1, 4.2, 4.3).
//
// Every export and its prototype is frozen on load, so code under test cannot
// replace or patch the grader (AD-15): assigning to one throws a TypeError.
import { phpLooseEquals, phpStrictEquals } from "./comparison/PhpComparison";
import { recordAssertion } from "./declarations/AssertionCounter";
import { portedTest } from "./declarations/portedTest";
import { xaravelTest } from "./declarations/xaravelTest";
import { Assert } from "./Framework/Assert";
import { AssertionFailedError } from "./Framework/AssertionFailedError";
import { ComparisonFailure } from "./Framework/ComparisonFailure";
import { ExpectationFailedException } from "./Framework/ExpectationFailedException";

for (const exported of [Assert, AssertionFailedError, ComparisonFailure, ExpectationFailedException, phpLooseEquals, phpStrictEquals, portedTest, recordAssertion, xaravelTest]) {
  const prototype: unknown = (exported as { prototype?: unknown }).prototype;
  if (typeof prototype === "object" && prototype !== null) {
    Object.freeze(prototype);
  }
  Object.freeze(exported);
}

export { Assert, AssertionFailedError, ComparisonFailure, ExpectationFailedException, phpLooseEquals, phpStrictEquals, portedTest, recordAssertion, xaravelTest };
export type { ClassOrInterface } from "./Framework/Assert";
export type { Dataset, PortedTestOptions } from "./declarations/portedTest";
export type { TestReport } from "./declarations/Declarations";
