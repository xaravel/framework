// @xaravel/assert: the grader's public surface (Stories 4.1, 4.2).
//
// Every export and its prototype is frozen on load, so code under test cannot
// replace or patch the grader (AD-15): assigning to one throws a TypeError.
import { phpLooseEquals, phpStrictEquals } from "./comparison/PhpComparison";
import { recordAssertion } from "./declarations/AssertionCounter";
import { portedTest } from "./declarations/portedTest";
import { xaravelTest } from "./declarations/xaravelTest";

for (const exported of [phpLooseEquals, phpStrictEquals, portedTest, recordAssertion, xaravelTest]) {
  const prototype: unknown = (exported as { prototype?: unknown }).prototype;
  if (typeof prototype === "object" && prototype !== null) {
    Object.freeze(prototype);
  }
  Object.freeze(exported);
}

export { phpLooseEquals, phpStrictEquals, portedTest, recordAssertion, xaravelTest };
export type { Dataset, PortedTestOptions } from "./declarations/portedTest";
export type { TestReport } from "./declarations/Declarations";
