// @xaravel/assert: the grader's public surface (Stories 4.1-4.4 and 4.7).
//
// Every export and its prototype is frozen on load, so code under test cannot
// replace or patch the grader (AD-15): assigning to one throws a TypeError.
//
// The `php*` helpers other than the two comparisons are the grader's PHP value
// layer over the AD-9 value model, exported so @xaravel/mockery reads values
// exactly as the grader does (Epic 4 retrospective A1). XT-conformance-7 allows
// no subpath export, so they sit on the index. So do `contractParentBrands`,
// `contractMethods` and `defineContractProtocols`, the parents walk, the
// contract methods and their JS protocols both packages' test doubles share
// (ESC-10.1-6, ESC-10.2-4).
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
import { contractMethods, contractParentBrands, defineContractProtocols } from "./Framework/MockObject/Generator/ContractParents";
import { MockBuilder } from "./Framework/MockObject/MockBuilder";
import { TestCase } from "./Framework/TestCase";
import { objectHandle as phpObjectHandle } from "./exporter/Exporter";
import { varExport as phpVarExport } from "./exporter/VarExport";

for (const exported of [
  Assert,
  AssertionFailedError,
  ComparisonFailure,
  Constraint,
  contractMethods,
  contractParentBrands,
  defineContractProtocols,
  Exception,
  ExpectationFailedException,
  MockBuilder,
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
  contractMethods,
  contractParentBrands,
  defineContractProtocols,
  Exception,
  ExpectationFailedException,
  MockBuilder,
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
export type { ContractMethod, ContractProtocols } from "./Framework/MockObject/Generator/ContractParents";
export type { InvocationMocker } from "./Framework/MockObject/Runtime/Interface/InvocationMocker";
export type { InvocationStubber } from "./Framework/MockObject/Runtime/Interface/InvocationStubber";
export type { MockObject } from "./Framework/MockObject/Runtime/Interface/MockObject";
export type { Stub } from "./Framework/MockObject/Runtime/Interface/Stub";
export type { Dataset, PortedTestOptions } from "./declarations/portedTest";
export type { TestReport } from "./declarations/Declarations";
export type { Key as PhpKey } from "./comparison/PhpComparison";
