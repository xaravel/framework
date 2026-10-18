// @xaravel/assert: the grader's public surface (Story 4.1).
//
// Every export and its prototype is frozen on load, so code under test cannot
// replace or patch the grader (AD-15): assigning to one throws a TypeError.
import { phpLooseEquals, phpStrictEquals } from "./comparison/PhpComparison";

for (const exported of [phpLooseEquals, phpStrictEquals]) {
  const prototype: unknown = (exported as { prototype?: unknown }).prototype;
  if (typeof prototype === "object" && prototype !== null) {
    Object.freeze(prototype);
  }
  Object.freeze(exported);
}

export { phpLooseEquals, phpStrictEquals };
