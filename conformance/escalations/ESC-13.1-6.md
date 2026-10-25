---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportReflectorTest::testIsCallable"
trigger: divergence
proposed: >-
  Option 1 (recommended): port `Reflector.isCallable` line for line over
  callable arrays, as PORTING.md's idiom already writes them
  (`[UserController, 'index']`). A class is a constructor, or an FQCN
  string resolved through the Class Registry, so `class_exists` is a
  registry lookup. `method_exists` is a function-valued member on the
  prototype chain (instance) or on the constructor (static). `__call` /
  `__callStatic` are methods of those names. A new DIV-9 clause records
  the two edges JavaScript cannot show. (a) Visibility: TypeScript's
  `private` / `protected` are erased, so any method reachable by name
  counts as public. A `#private` method is not reachable, so it is not
  callable, as in PHP. (b) A non-array string names a PHP global function.
  No runtime table of PHP functions exists (DIV-9.13), so `isCallable`
  returns `true` for a `'Class::method'` string that the registry and the
  rules above resolve, and `false` for any other string. With
  `syntaxOnly`, it returns `true` for any string, as PHP does.
  testIsCallable then passes unchanged. Its fixtures are registered with
  `registerTestClass`, and `[B::class, 'f']` becomes `[B, 'f']` by the
  mechanical rule. Option 2: a non-array string throws PHP's `TypeError`,
  as DIV-9.13 does for `when` / `unless`. `isCallable` is a predicate, and
  Upstream never throws there.
evidence: >-
  Upstream's `isCallable` passes any non-array to PHP's `is_callable`. For
  arrays, it checks `class_exists`, `method_exists`,
  `ReflectionMethod::isPublic`, and `__call` / `__callStatic`
  (framework/src/Illuminate/Reflection/Reflector.php:13-55). testIsCallable
  (SupportReflectorTest.php:65-76) covers closures, class and instance
  arrays, `__call` / `__callStatic`, a missing class, and `syntaxOnly`.
  It does not cover visibility or PHP function-name strings, but both are
  reachable through the public API. PHP's `is_callable('strrev')` is
  `true`, and JavaScript has no functions addressed by name. DIV-9.13
  covers callable strings and arrays only for `when` / `unless`, and says a
  later shared resolver supersedes it through an Escalation. TS access
  modifiers do not exist at runtime. The epic-11 lesson (lessons.md) says a
  silent difference from PHP needs a DIV clause, not a docs note.
---

# ESC-13.1-6: `Reflector::isCallable` cannot see PHP visibility or PHP function names

The tested behaviour of `isCallable` ports directly. Two untested edges have no JavaScript equivalent: method visibility, which TypeScript erases, and strings that name PHP global functions. Option 1 records both under a new DIV-9 clause and ports the rest line for line. Option 2 throws on strings. Work on this Test ID stops here, so it does not ship a silent divergence.
