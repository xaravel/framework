---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportReflectorTest::testParameterSubclassOfInterface"
trigger: contract
proposed: >-
  Option 1 (recommended): the runtime gains a lookup from a contract
  token's FQCN to the token, written when `contract(...)` builds the token
  (or read from a token table the runtime owns). Then a class name that
  `Reflector::getParameterClassName` returns resolves for an interface as
  it does for a class. `class_exists($n) || interface_exists($n)` becomes
  "the Registry or the token table holds `n`". `new
  ReflectionClass(<token FQCN>)` reflects the token, and
  `isParameterSubclassOf` ports line for line, with Upstream's `IA` /
  `IB` written as `contract(...)` tokens (`IB` listing `IA` as its
  parent). This is a runtime (and possibly contracts) change, so it needs
  a Maintainer-approved Infrastructure change, as
  epic-13-item-1-runtime-reflection did. Option 2: port the test's PHP
  interfaces `IA` / `IB` as registered abstract classes. The assertion
  passes today, but a PHP interface stops being a contract token. That
  diverges from PORTING.md and needs a new DIV clause. And every
  token-typed parameter in framework code (Events, Container) still gets
  `false`.
evidence: >-
  `Reflector::isParameterSubclassOf` reads the parameter's class name
  string, checks `class_exists($n) || interface_exists($n)`, and then
  builds `new ReflectionClass($n)`
  (framework/src/Illuminate/Reflection/Reflector.php:176-183). The test
  hints `IB`, an interface extending `IA`
  (framework/tests/Support/SupportReflectorTest.php:57-62, 147-163).
  `ReflectionNamedType::getName()` gives a token's FQCN, but the Class
  Registry holds classes only. ESC-10.1-3 rules that a token is never
  registered, so `new ReflectionClass('<token FQCN>')` throws
  `ReflectionException`. packages/runtime/docs/reflection.md says "A
  token's FQCN is not in the Registry, so a token resolves only as a
  value". The runtime item's spec deferred exactly this to Story 13.1
  (_bmad-output/implementation-artifacts/spec-retro-13-runtime-reflection.md,
  `deferred`). The Story may not edit packages/runtime or
  packages/contracts.
---

# ESC-13.1-7: an interface's name does not resolve, so `isParameterSubclassOf` cannot port for a token hint

`isParameterSubclassOf` works on the class name that `getParameterClassName` returns. For an interface hint, that name is a contract token's FQCN, and nothing in the runtime maps it back to the token. Option 1 adds that lookup to the runtime. Option 2 rewrites the test's interfaces as classes under a new DIV clause. Work on testParameterSubclassOfInterface stops here. `isParameterSubclassOf` itself is ported line for line, so it already works for a class-typed parameter.
