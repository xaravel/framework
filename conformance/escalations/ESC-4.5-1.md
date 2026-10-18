---
test_ids:
  - XT-mockery-2
  - XT-mockery-3
trigger: contract
proposed: >-
  (1) Accept the test-finish protocol: `@xaravel/mockery` installs
  `globalThis[Symbol.for('xaravel.mockery.run')]` on load, and `portedTest`
  and `xaravelTest` run each test through it, inside the scope frame.
  `Mockery.close()` records one assertion of kind `mockeryExpectation` per
  call-count-constrained expectation. Story 5.3's assertion floor accepts
  that kind although the Inventory never records it, and Epic 57's TestCase,
  whose `tearDown` calls `Mockery.close()`, adds no count of its own. (2)
  Give the SPL classes (`\BadMethodCallException`,
  `\UnexpectedValueException`, `\OutOfBoundsException`,
  `\InvalidArgumentException` and their parents) one shared owner, joining
  ESC-4.3-1 item 14. Proposed owner: the Epic 9 runtime, read by the grader
  through a `Symbol.for` protocol. Until then the grader's copies stay
  internal. (3) Epic 10 contract tokens carry
  `Symbol.for('xaravel.contract.methods')`, and the grader reads it to tell
  a declared method from an undeclared one and to set `instanceof`. (4) Read
  Story 4.5 AC 3 as Mockery behaves: `BadMethodCallException` for a method
  with no expectation, and `NoMatchingExpectationException` for a method
  whose expectations match none of the call's arguments. (5) Accept that the
  mock Proxy does not intercept symbol keys, or `then` unless `then` has an
  expectation. (6) Story 4.6 owns the `Container::mock` forms Story 4.5 does
  not build, `times()`'s deprecation after `never()`, `because()`, and
  `andThrow()` with a class-name string, through its coverage report (AC 3).
  `alias:` and `overload:` go through its PHP-only exclusion Escalation. (7)
  Amend XT-conformance-8 so a grader package may depend on another grader
  package, as tools/graph/graph.ts and AD-2 ("the grader depends on nothing
  graded") already allow, so that `@xaravel/mockery` can list
  `"@xaravel/assert": "workspace:*"` in `dependencies`. Story 4.5 stays
  blocked until the Maintainer rules; its built code is kept in
  `_bmad-output/implementation-artifacts/xt45-attempt-1.patch`.
evidence: >-
  (1) Mockery's PHPUnit integration adds
  `Container::mockery_getExpectationCount()` (Container.php 312-320) to the
  test's assertion count before `Mockery::close()`
  (Adapter/Phpunit/MockeryPHPUnitIntegration.php:34), so an unmet expectation
  counts as an assertion and still fails the test. The Inventory comes from
  PHPUnit's per-assertion events, and these counts have no event of their
  own. (2) Mockery's exceptions extend PHP's SPL classes
  (Exception/BadMethodCallException.php:13, Exception.php:16,
  CountValidator/Exception.php:16). The grader may not import a graded
  package (AD-2), so its copies (`packages/mockery/src/php/`) are not the
  classes a Ported Test names in `expectException(\BadMethodCallException::class)`.
  (3) Mockery picks its message from Reflection (Mock.php 1103-1107):
  "Received …, but no expectations were specified" for a declared method,
  "does not exist on this mock object" otherwise. A token
  (`Symbol.for('<FQCN>')`) has no prototype to read. Mockery also names an
  unresolvable class-name string with a leading `\` (`Mockery_2__NoSuch_Thing`).
  Story 4.5 uses the string as it is given (`Mockery_<n>_NoSuch_Thing`). (4)
  ExpectationDirector.php 85-107 throws NoMatchingExpectationException, a
  `Mockery\Exception` and so an `UnexpectedValueException`. Mock.php
  1007-1114 throws BadMethodCallException only when the method has no
  director. (5) `await mock` reads `then`. Treating that read as a call to
  an unexpected method would throw where PHP never calls anything. (6)
  Container.php 220-271 parses quick-definition arrays, constructor
  arguments, trailing closures, `Foo[m]` partials, `'A, B'` interface lists
  and `alias:`/`overload:` prefixes. `times()` raises E_USER_DEPRECATED
  (Expectation.php:696), and the grader has no PHP error channel. JS
  cannot resolve a class-name string to a class. (7) XT-conformance-8
  (conformance/tests/xaravel/scaffold.test.ts:294-295) expects a grader
  package to have no `@xaravel/*` dependency, so it fails on
  `@xaravel/mockery -> @xaravel/assert`, which graph.ts accepts and which
  ESC-4.4-1's ruling anticipates ("Mockery depends on `@xaravel/assert`").
  Relaxing that expected value weakens a test, which only the Maintainer
  may approve (MAINT-2026-10-16). Declaring the edge as a peer dependency
  instead, to pass the test's letter, was refused as a CI bypass.
---

# ESC-4.5-1: Mockery's test-finish contract, SPL parents and the Story 4.5 boundaries

Story 4.5 ports Mockery 1.6.15's core. Seven points need a ruling from outside the Story: a protocol and a count kind that later Epics must honour, classes the grader cannot own, forms the Story leaves to Story 4.6, and a Protected test that forbids the package edge the Story needs. The item numbers match `proposed`.

1. **The test-finish protocol and the `mockeryExpectation` count (XT-mockery-2).** When `@xaravel/mockery` loads, it installs `globalThis[Symbol.for('xaravel.mockery.run')](fn)`. That function runs `fn` with a fresh container. If `fn` rejects, it purges the container without verifying it and rethrows. If `fn` resolves, it calls `Mockery.close()`. `close()` records `mockeryExpectation` once per call-count-constrained expectation, then verifies, so an unmet expectation fails the test and is still counted. `portedTest` and `xaravelTest` call the protocol when the global is a function.
   - Story 5.3's floor compares a test's kinds with the Inventory, and the Inventory never records `mockeryExpectation`. The floor must accept the kind.
   - Epic 57's TestCase calls `Mockery.close()` in `tearDown`, as Laravel's does. That close counts the expectations and detaches the container, so the protocol's own close then does nothing. The TestCase must not add the count again.
2. **SPL parents are grader-internal (XT-mockery-3).** Mockery's `BadMethodCallException` extends PHP's `\BadMethodCallException`, and its `Exception` extends `\UnexpectedValueException`. The grader cannot import those classes from a graded package (AD-2), so it keeps unexported copies. A Ported Test's `expectException(\BadMethodCallException::class)` therefore cannot match Mockery's exception until one owner supplies shared SPL classes. This joins ESC-4.3-1 item 14. Proposed owner: the Epic 9 runtime, read by the grader through a `Symbol.for` protocol.
3. **Contract tokens and unresolvable class-name strings.** A token or a string carries no method list, so a declared method without expectations reports "does not exist on this mock object" instead of "Received …, but no expectations were specified", and `instanceof` against the token is not set. Proposed: Epic 10 tokens carry `Symbol.for('xaravel.contract.methods')`, and the grader reads it. For a class that no PHP code declares, Mockery names the mock with a leading `\` (`Mockery_2__NoSuch_Thing`). Story 4.5 uses the string as given (`Mockery_2_NoSuch_Thing`).
4. **AC 3's wording.** AC 3 reads "a call that matches no expectation throws `BadMethodCallException`, as Mockery does". Mockery throws `BadMethodCallException` when the method has no expectation. When the method has expectations but none matches the arguments, it throws `NoMatchingExpectationException`, which is a `Mockery\Exception` and so an `UnexpectedValueException`. Story 4.5 follows Mockery, and XT-mockery-3 checks both against the Oracle. Proposed: read AC 3 that way.
5. **What the Proxy leaves alone.** The mock is a Proxy. A symbol key, and `then` when it has no expectation, are read from the object rather than dispatched as method calls. `then` is how `await` checks for a promise, not a method call. A `then` with an expectation is dispatched.
6. **Forms left to Story 4.6.** Story 4.6 owns the following through its AC 3 coverage report. `alias:` and `overload:` go through its PHP-only exclusion Escalation.
   - The `Container::mock` forms that Story 4.5 rejects: quick-definition arrays, constructor arguments, a trailing closure, `Foo[m]` partials, `'A, B'` interface lists, and `alias:`/`overload:`.
   - `times()`'s E_USER_DEPRECATED after `never()`. The grader has no PHP error channel.
   - `because()`.
   - `andThrow()` with a class-name string, which JS cannot resolve. A class or an error object works.
7. **XT-conformance-8 forbids the Mockery → assert edge.** `@xaravel/mockery` counts expectations through `@xaravel/assert`'s public `recordAssertion` and matches arguments through `phpLooseEquals`, so it lists `"@xaravel/assert": "workspace:*"` in `dependencies`. ESC-4.4-1's ruling assumes exactly this edge. XT-conformance-8 (`conformance/tests/xaravel/scaffold.test.ts:294-295`) expects every grader package to have no `@xaravel/*` dependency, so it fails, although `tools/graph/graph.ts` and AD-2 allow grader-to-grader edges. Relaxing the test's expected value weakens a test, so it waits for the Maintainer. Declaring the edge as a peer dependency to pass the test's letter was refused as a CI bypass. Proposed: an Infrastructure Story amends XT-conformance-8 to allow `@xaravel/mockery -> @xaravel/assert` (or grader-to-grader edges generally). Until then Story 4.5 is blocked; its built and locally verified code (0 mismatches over 50 Oracle cells, unsigned) is kept in `_bmad-output/implementation-artifacts/xt45-attempt-1.patch`.
