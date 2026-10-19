---
test_ids:
  - XT-assert-15
  - XT-assert-16
trigger: contract
proposed: >-
  Adopt the contracts Story 4.7 builds to, as written here, and name owners
  for items (4) and (5). (1) The kind-less count: `addToAssertionCount(n)`
  and mock object verification count toward a test's total (FR-113's
  zero-assertion rule and `expectNotToPerformAssertions`) but never appear
  in the report's `assertions`; the report keeps its four keys and Story
  5.3 reads it unchanged. (2) A DIV-6 clause, "DIV-6 php-only: PHP run-time
  types and reflection in test doubles": an unconfigured call returns null,
  `willReturn` is not type-checked and `Invocation::toString` has no
  `: <type>` suffix; parameter names come from the JS source text; a
  double made without the constructor runs no JS field initializer, so a
  declared field reads undefined where PHP has its declared default, a real
  method of a partial mock that touches a `#private` field throws, and a
  built-in subclass's double lacks its internal slots; an
  omitted declared argument is null, so `willReturnMap` rows are normalized
  with null as every parameter's default; "final or static" never applies;
  every JS error reaching the invocation handler is treated as PHP's
  `\Exception`; Ported Tests that rely on a generated return value configure
  it, as an `adapted:DIV-6` change. (3) PHPUnit's notices and deprecations
  for test doubles are not emitted (the no-expectations notice, the `any()`
  deprecation, `with()` without `expects()`): an outcome-neutral,
  message-only difference, like ESC-4.4-2 item 3. (4) Story 4.8
  (`component: mockery`) removes the now-unused
  `globalThis[Symbol.for('xaravel.mockery.mock')]` hook and its test, and
  the Maintainer reconciles `epics.md:2110-2112` with `epics.md:114`. (5)
  Story 10.1's contract tokens carry their method names at
  `Symbol.for('xaravel.contract.methods')` (ESC-4.5-1 item 3) and, for test
  doubles, each method's parameter names; a bare symbol target has no
  method list.
evidence: >-
  (1) The Inventory records kinds only at an outermost `Assert::assert*`
  call (tools/baseline/recorder.php:11-17), so a test whose only checks are
  mock expectations or `addToAssertionCount` has `"assertions":{}`; 425 such
  Inventory entries pass. PHPUnit counts mock verification through
  `TestCase::addToAssertionCount` (MockObjectRegistry.php:102 and 125,
  Rule/Parameters.php:256-263).
  (2) PHPUnit's generated doubles read return types, parameter names and
  default values by reflection, and PHP's newInstanceWithoutConstructor
  still initializes declared property defaults, which JS's Object.create
  cannot (Generator/DoubledMethod.php,
  ReturnValueGenerator.php, AbstractInvocationImplementation.php:241-308,
  Rule/Parameters.php:268-288); JS has none of them at run time. A local
  Oracle run (PHP 8.5.11) shows PHPUnit's generated method passes every declared parameter
  (`XtDouble::bar(1, null)` for `bar(1)`) and pads `willReturnMap` rows with
  the declared defaults (`[[1, 'a']]` matches `bar(1)` on `bar($x = null,
  $y = null)`); the port reproduces both with null. InvocationHandler.php:236
  catches `\Exception`, not `\Error`. (3) MockObjectRegistry.php:84-99,
  TestCase.php:833-841 and InvocationMockerImplementation.php:135-145 emit
  events that change no test outcome; `#[AllowMockObjectsWithoutExpectations]`
  (102 Upstream lines) only silences the first. (4)
  packages/mockery/src/Mockery.ts:200-227 installs the hook and
  packages/mockery/tests/xaravel/mockery.test.ts:141-180 pins it; Story 4.7
  may not edit `packages/mockery/**`. epics.md:2110-2112 (Story 4.4's AC
  "delegates to `@xaravel/mockery`") contradicts `decisions/ESC-4.4-2.md`
  item 6. (5) A symbol is a primitive and carries no properties, and the
  AD-1 token protocol names no parameter list, so a token double names a
  mismatched parameter by its index (`Parameter 0`) where PHP names it
  (`Parameter $key`), and does not pad omitted arguments.
---

# ESC-4.7-1: PHPUnit test doubles: the kind-less count, PHP-only reflection, notices, two leftovers and contract tokens

Story 4.7 ports PHPUnit 13.4.3's test doubles into `@xaravel/assert`, under `decisions/ESC-4.4-2.md` item 6. Five points need a ruling or an owner outside the Story. The item numbers match `proposed`.

1. **The kind-less count.** PHPUnit counts mock verification and `addToAssertionCount(n)` without an assertion kind. The Inventory records kinds only for outermost `Assert::assert*` calls, so a mock-only or `addToAssertionCount`-only test has `"assertions":{}`. The port adds a kind-less count to the counting context: `addToAssertionCount(n)`, one per verified mock object with an invocation count rule, one per constrained argument of a matched call (or one for a too-short call), and one per over-count failure the test ends with. It counts toward FR-113's zero-assertion rule and toward `expectNotToPerformAssertions` (a verified mock makes such a test risky, as in PHPUnit), but never appears in the report's `assertions`. The report keeps its four keys, and Story 5.3 reads it unchanged.
2. **No PHP run-time types or reflection (proposed DIV-6 clause).** PHPUnit's generated doubles read the target's declared types, parameter names and default values.
   - With no declared return types, an unconfigured call returns `null` instead of a generated value (`''`, `0`, a stub of the return type, …). `willReturn` is not type-checked, and `Invocation::toString` has no `: <type>` suffix.
   - Parameter names come from the method's JS source: `x` and `x = default` are `$x`, a trailing `...rest` is the variadic and not a declared parameter, and a destructured parameter makes every parameter named by its index.
   - A double made without the original constructor (`createMock`, `createStub`, `createPartialMock`, `disableOriginalConstructor()`) is `Object.create` of the double class, so no JS field initializer runs. A declared field reads `undefined` where PHP's `newInstanceWithoutConstructor` gives its declared default. A real (not doubled) method of a partial mock that touches a `#private` field throws a `TypeError`, and the double of a built-in subclass (`Map`, `Error`, …) lacks the built-in's internal slots. Ported Tests read such a field as `?? null` or configure the double, as an `adapted:DIV-6` change.
   - PHPUnit's generated method passes every declared parameter, its default when omitted. The port passes an omitted declared argument as `null` (JS's `undefined`, AD-9). For the same reason, a `willReturnMap` row with fewer or more elements than the declared parameters plus the return value is normalized as PHPUnit's `normalizeValueMap` does, with `null` as each default. The Story's spec proposed leaving rows unpadded; a local Oracle run (PHP 8.5.11) shows PHP pads them, so the port follows it.
   - "final or static" in PHPUnit's messages never applies.
   - The invocation handler collects every JS error a matcher throws, where PHP collects only `\Exception` and lets an `\Error` propagate at once.
   - Ported Tests that rely on a generated return value configure it, as an `adapted:DIV-6` change.
3. **Notices and deprecations are not emitted.** This covers the "No expectations were configured" notice (which `#[AllowMockObjectsWithoutExpectations]`, 102 Upstream lines, silences), the `any()` deprecation, and `with()` without `expects()`. None changes a test's outcome. Proposed: accept this as an outcome-neutral, message-only difference, like ESC-4.4-2 item 3.
4. **Two leftovers outside this Story's paths.**
   - `packages/mockery/src/Mockery.ts:200-227` still installs `globalThis[Symbol.for('xaravel.mockery.mock')]`, and `packages/mockery/tests/xaravel/mockery.test.ts:141-180` pins it. `createMock` no longer reads it. Proposed owner: Story 4.8 (`component: mockery`) removes both.
   - `epics.md:2110-2112` (Story 4.4's AC "delegates to `@xaravel/mockery`") contradicts the ruling. Proposed: the Maintainer reconciles it with `epics.md:114`.
5. **Contract tokens as double targets.** A class target's methods come from its prototype chain. A contract token (AD-1: an object with `Symbol.hasInstance`) gives its method names at `token[Symbol.for('xaravel.contract.methods')]` (ESC-4.5-1 item 3), and its double carries the token's brand getter, so `instanceof` holds. The names carry no parameter list, so a token double names a mismatched parameter by index and does not pad omitted arguments. A bare symbol, which Mockery accepts as a token, carries no method list at all, so its double has no configurable method. Proposed: Story 10.1 makes every token carry its method names, and the parameter names of each, where test doubles read them.
