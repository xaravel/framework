---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportReflectsClosuresTest::testReflectsClosures"
  - "Illuminate\\Tests\\Support\\SupportReflectsClosuresTest::testItThrowsWhenNoFirstParameterType"
  - "Illuminate\\Tests\\Support\\SupportReflectsClosuresTest::testItWorksWithUnionTypes"
  - "Illuminate\\Tests\\Support\\SupportReflectsClosuresTest::testItThrowsWhenFirstParameterHasNoTypeHintEvenIfLaterParameterDoes"
  - "Illuminate\\Tests\\Support\\SupportReflectsClosuresTest::testItReturnsTheFirstParameterType"
  - "Illuminate\\Tests\\Support\\SupportReflectsClosuresTest::testItThrowsWhenNoParameters"
  - "Illuminate\\Tests\\Support\\SupportReflectsClosuresTest::testItWorksWithUnionTypesWithNoArguments"
  - "Illuminate\\Tests\\Support\\SupportReflectsClosuresTest::testItWorksWithUnionTypesWithNoTypeHints"
  - XT-reflection-2
trigger: divergence
proposed: >-
  Option 1 (recommended): add a DIV-3 clause for closures. An untyped PHP
  parameter is declared `primitive`, and a variadic parameter is declared
  `variadic(<Spec>)`, so the `inject` map always lists every parameter in
  order, as AD-4's lint requires. A closure with no parameters is declared
  `inject({}, () => …)`. A closure with no `inject` at all makes
  `closureParameterTypes` and the `firstClosureParameterType(s)` methods
  throw `RuntimeException`, with a message that names the
  `inject({ <param>: <Spec> }, fn)` form (Story 13.1's XT-reflection-2
  criterion). `ReflectsClosures` then ports line for line: a `primitive`,
  `String`, `Number` or `Boolean` Spec reads as a builtin (`null`), and
  `variadic(...)` reads as `null`, as Upstream's `isVariadic()` branch
  gives. The runtime defines `primitive`, `oneOf` and `variadic` beside
  `inject` now, and Container re-exports them later. This could be the same
  Infrastructure action item as ESC-13.1-1 option 1. Otherwise these tests
  wait as `blocked-by:container` until Epic 17. testItWorksWithUnionTypes
  needs `oneOf`, and its fixture closure is ported in place, marked
  `adapted:DIV-3.1`. Option 2: leave untyped parameters out of the map, and
  have the reflector read parameter names and rest parameters from
  `Function.prototype.toString()`. This breaks AD-4's rule that keys are
  the whole parameter list, and source text is not a stable contract
  (minifiers, bound functions, native functions). Option 3: skip the
  untyped and variadic cases as `intentional-divergence:DIV-3`. That is
  not valid by PORTING.md § Adapt versus skip, because the behaviour exists
  in Xaravel.
evidence: >-
  Upstream maps an untyped parameter to `null`
  (`function ($one)` gives `[null]`), a builtin hint to `null`, and a
  variadic parameter to `null`
  (framework/tests/Support/SupportReflectsClosuresTest.php:12-41; trait
  framework/src/Illuminate/Reflection/Traits/ReflectsClosures.php:44-95).
  `inject` rejects a `null` or `undefined` value
  (packages/runtime/src/metadata/inject.ts `freezeMap`). AD-4 says keys
  are the parameter names in order, checked by a lint rule against the
  parameter list. Its Spec list has no value for "no hint" and no variadic
  form. So `function ($one, ?ExampleParameter $two = null)` cannot be
  declared under DIV-3.1 as it stands. The epic's AC for Story 13.1 says a
  closure with no `inject` throws, naming the `inject` form
  (XT-reflection-2). Upstream returns `[]` for `function () {}` and
  `[null]` for `function ($one)`, so the reading of "no declaration"
  decides how `closureParameterTypes` enumerates parameters at all.
  testItReturnsTheFirstParameterType, testItThrowsWhenNoParameters,
  testItWorksWithUnionTypesWithNoArguments and
  testItWorksWithUnionTypesWithNoTypeHints need no new Spec. They are held
  here only because they run through that same enumeration: building it
  before the ruling would build it twice. The fixture
  `Fixtures/UnionTypesClosure.php` is
  `function (ExampleParameter|AnotherExampleParameter $a, $b)`, which needs
  both `oneOf` and an untyped parameter.
---

# ESC-13.1-2: untyped and variadic closure parameters cannot be declared with `inject`

`ReflectsClosures` reports an untyped or variadic parameter as `null`, but `inject` rejects a `null` Spec. AD-4 requires the map to list every parameter, and has no variadic form. The epic also asks that a closure with no `inject` throw, while Upstream reads `function () {}` and `function ($one)` without any hint. Option 1 adds `primitive` / `variadic(...)` declarations under a new DIV-3 clause, defined in the runtime now. Option 2 reads parameter names from function source. Option 3 skips. Work on these Test IDs stops here.
