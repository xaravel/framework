// @xaravel/assert: the grader's public surface (Stories 4.1-4.4).
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
import { Constraint } from "./Framework/Constraint";
import { Exception } from "./Framework/Exception/Exception";
import { SkippedWithMessageException } from "./Framework/Exception/SkippedWithMessageException";
import { ExpectationFailedException } from "./Framework/ExpectationFailedException";
import { TestCase } from "./Framework/TestCase";

for (const exported of [
  Assert,
  AssertionFailedError,
  ComparisonFailure,
  Constraint,
  Exception,
  ExpectationFailedException,
  SkippedWithMessageException,
  TestCase,
  phpLooseEquals,
  phpStrictEquals,
  portedTest,
  recordAssertion,
  xaravelTest,
]) {
  const prototype: unknown = (exported as { prototype?: unknown }).prototype;
  if (typeof prototype === "object" && prototype !== null) {
    Object.freeze(prototype);
  }
  Object.freeze(exported);
}

export {
  Assert,
  AssertionFailedError,
  ComparisonFailure,
  Constraint,
  Exception,
  ExpectationFailedException,
  phpLooseEquals,
  phpStrictEquals,
  portedTest,
  recordAssertion,
  SkippedWithMessageException,
  TestCase,
  xaravelTest,
};
export type { ClassOrInterface } from "./Framework/Assert";
export type { Dataset, PortedTestOptions } from "./declarations/portedTest";
export type { TestReport } from "./declarations/Declarations";
