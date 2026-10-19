// @xaravel/assert: the grader's public surface (Stories 4.1-4.4).
//
// Every export and its prototype is frozen on load, so code under test cannot
// replace or patch the grader (AD-15): assigning to one throws a TypeError.
//
// The `php*` helpers other than the two comparisons are the grader's PHP value
// layer over the AD-9 value model, exported so @xaravel/mockery reads values
// exactly as the grader does (Epic 4 retrospective A1). XT-conformance-7 allows
// no subpath export, so they sit on the index.
import {
  arrayEntries as phpArrayEntries,
  isBrandedArray as phpIsBrandedArray,
  isPhpArray as phpIsArray,
  objectProps as phpObjectProps,
  phpLooseEquals,
  phpStrictEquals,
} from "./comparison/PhpComparison";
import {
  classNameOf as phpClassNameOf,
  isPhpObject as phpIsObject,
  isResource as phpIsResource,
  phpToString,
} from "./comparison/PhpValues";
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
import { objectHandle as phpObjectHandle } from "./exporter/Exporter";
import { varExport as phpVarExport } from "./exporter/VarExport";

for (const exported of [
  Assert,
  AssertionFailedError,
  ComparisonFailure,
  Constraint,
  Exception,
  ExpectationFailedException,
  SkippedWithMessageException,
  TestCase,
  phpArrayEntries,
  phpClassNameOf,
  phpIsArray,
  phpIsBrandedArray,
  phpIsObject,
  phpIsResource,
  phpLooseEquals,
  phpObjectHandle,
  phpObjectProps,
  phpStrictEquals,
  phpToString,
  phpVarExport,
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
  phpArrayEntries,
  phpClassNameOf,
  phpIsArray,
  phpIsBrandedArray,
  phpIsObject,
  phpIsResource,
  phpLooseEquals,
  phpObjectHandle,
  phpObjectProps,
  phpStrictEquals,
  phpToString,
  phpVarExport,
  portedTest,
  recordAssertion,
  SkippedWithMessageException,
  TestCase,
  xaravelTest,
};
export type { ClassOrInterface } from "./Framework/Assert";
export type { Dataset, PortedTestOptions } from "./declarations/portedTest";
export type { TestReport } from "./declarations/Declarations";
export type { Key as PhpKey } from "./comparison/PhpComparison";
