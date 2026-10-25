---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportReflectsClosuresTest::testItReturnsTheFirstParameterType"
trigger: contract
proposed: >-
  Option 1 (recommended): `@xaravel/assert`'s `assertInstanceOf` /
  `assertNotInstanceOf` (`classOrInterface`) accept a class-string, as
  PHPUnit does. They resolve it through the Class Registry (`resolveClass`)
  and throw `UnknownClassOrInterfaceException` only when it does not
  resolve, as PHPUnit throws for a class that does not exist. Then the
  test ports unchanged: `this.assertInstanceOf(type, new
  ExampleParameter())`. This changes a Protected grader package, but it
  makes the grader more faithful, not weaker. Option 2: adapt the test to
  `this.assertInstanceOf(resolveClass(type), new ExampleParameter())`
  under a new DIV clause, "a class-string passed to assertInstanceOf is
  resolved first". The expected-value argument then changes, which F-2
  allows only under a clause.
evidence: >-
  The test asserts `assertInstanceOf($type, new ExampleParameter)`, where
  `$type` is the class-string that `firstClosureParameterType` returns
  (framework/tests/Support/SupportReflectsClosuresTest.php:44-51).
  PHPUnit's `assertInstanceOf` accepts any existing class or interface
  name. `packages/assert/src/Framework/Constraints.ts:299-302` throws
  `UnknownClassOrInterfaceException` for every string ("a string names no
  class here (no global class table)"). That comment predates the Class
  Registry (Story 9.x), which now resolves registered FQCNs, test classes
  included (`registerTestClass`). `packages/assert` is a Protected Path,
  and the Story may not edit it.
---

# ESC-13.1-9: `assertInstanceOf` rejects the class-string that `firstClosureParameterType` returns

PHPUnit's `assertInstanceOf` takes a class name. `@xaravel/assert` refuses every string, because it was written before the Class Registry existed. Option 1 lets the grader resolve a registered name. Option 2 adapts the test under a new clause. Work on testItReturnsTheFirstParameterType stops here.
