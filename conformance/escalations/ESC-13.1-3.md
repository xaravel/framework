---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportReflectsClosuresTest::testClosureReturnTypesReturnsClassReturnType"
  - "Illuminate\\Tests\\Support\\SupportReflectsClosuresTest::testClosureReturnTypesExcludesBuiltinReturnType"
  - "Illuminate\\Tests\\Support\\SupportReflectsClosuresTest::testClosureReturnTypesReturnsEmptyArrayWhenNoReturnType"
  - "Illuminate\\Tests\\Support\\SupportReflectsClosuresTest::testClosureReturnTypesExcludesSelfAndStaticReturnTypes"
  - "Illuminate\\Tests\\Support\\SupportReflectsClosuresTest::testClosureReturnTypesKeepsOnlyClassTypesFromUnionReturnType"
  - "Illuminate\\Tests\\Support\\SupportReflectsClosuresTest::testClosureReturnTypesReturnsEmptyArrayForIntersectionReturnType"
trigger: divergence
proposed: >-
  Option 1 (recommended): add a DIV-3 clause for return hints the framework
  reads. A closure declares its return hint with
  `returns(<Spec>, fn)`, which the runtime writes beside `inject` in the
  same `Symbol.metadata` object (`readReturnMetadata(fn)` reads it, or
  `null`). Specs: a class or token; `String` / `Number` / `Boolean` for
  builtins; `oneOf(A, B)` for a union; `allOf(A, B)` for an intersection;
  and the markers `self` and `static`. `closureReturnTypes` then ports line
  for line, and each Ported Test wraps its arrow function in `returns(...)`,
  marked `adapted:DIV-3.<k>`, with assertions unchanged. `proxy()` reads it
  the same way. Option 2: `closureReturnTypes` returns `[]` because no
  return metadata exists, and the six tests skip as
  `intentional-divergence:DIV-3` under a new clause. `proxy()` then always
  takes the class from the first parameter.
evidence: >-
  `closureReturnTypes` reads `ReflectionFunction::getReturnType()`, which
  can be named, union or intersection, and drops builtins and
  `self` / `static`
  (framework/src/Illuminate/Reflection/Traits/ReflectsClosures.php:97-123).
  The six tests cover each branch
  (framework/tests/Support/SupportReflectsClosuresTest.php:116-171).
  TypeScript erases return types. `inject` (AD-4, DIV-3,
  packages/runtime/src/metadata/inject.ts) records parameters only, and
  DIV-3.1 covers parameter hints for injection, not return hints. No DIV
  clause or AD names a return declaration, an intersection Spec, or the
  `self` / `static` markers.
---

# ESC-13.1-3: closure return types have no declaration form

`ReflectsClosures::closureReturnTypes` reads a closure's PHP return hint, which TypeScript erases. `inject` declares parameters only. Option 1 adds a `returns(<Spec>, fn)` declaration under a new DIV-3 clause. Option 2 skips the six tests under DIV-3. Work on these Test IDs stops here.
