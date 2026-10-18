---
test_ids:
  - XT-mockery-4
  - XT-mockery-5
  - XT-mockery-6
trigger: contract
proposed: >-
  Adopt the contracts Story 4.6 builds to, as written here, and name owners
  for items (1), (2), (6), (9) and (10). (1) `MODEL_STATE` is
  `Symbol.for('xaravel.model.state')`, declared on `Model.prototype`; a
  mocked model keeps members defined through the mock in
  `instance[MODEL_STATE][Symbol.for('xaravel.mockery.members')]` and never
  calls the model Proxy's `defineProperty` trap with a string key; a
  string-keyed `set` goes to the model's own set path, so Story 36.1's Model
  Proxy must handle string-keyed `set` itself, and 36.1 rules on a fresh
  string-keyed `set` on a constructor-less model mock, which has no model
  Proxy and lands on the bare instance (binds Story 36.1). (2) `Mockery.capture(ref)` writes `ref.value`; Story 9.5's
  `Ref<T>` keeps a writable `value` (AD-9's by-reference rule). (3) `alias:`
  and `overload:` mocks are `php-only` under DIV-6 and throw
  `InvalidArgumentException` naming this Escalation; their one Upstream use
  is skipped as `php-only` when ported; proposed DIV-6 clause: "DIV-6
  php-only: Mockery `alias:`/`overload:` mocks (class aliasing, autoload
  interception)". (4) TS visibility does not exist at run time, so every
  method is mockable and `shouldAllowMockingProtectedMethods()` only sets its
  flag; proposed DIV-6 clause: "DIV-6 php-only: run-time method visibility
  (Mockery's protected/private guards)". (5)
  `shouldIgnoreMissing()` without a default returns null (no return types);
  recursive mode returns an ignore-missing mock for every missing call. (6)
  `returns`, `throws` and `resolves` are `jasonmccreary/double`'s; the
  Maintainer names an Infrastructure Story that ports Double into the
  grader, and until then `mockery:coverage` lists them as pending. (7) The
  `mockery:coverage` step is advisory like `assert:coverage` (ESC-4.4-2 item
  4). (8) Of several class targets (`'A, B'`, `mock(A, B)`) only the first
  class is in the prototype chain, so `instanceof` holds for it only;
  interface names are display-only parts of the mock's name. (9) Class-name
  strings: `andThrow('<FQCN>')` resolves only the exception classes the
  grader defines, and `Container::mock` resolves a class-name string or a
  `'Foo[m]'` partial only through
  `globalThis[Symbol.for('xaravel.class.lookup')](fqcn)`, a function
  returning the registered class or null; Story 9.4's class registry
  installs it, and the grader reads it for the rest. (10) Story 4.6's AC
  names `partialMock()`: that is Laravel's
  `InteractsWithContainer::partialMock`, not Mockery's (Mockery's form is
  `Mockery::mock(...)->makePartial()`, which 4.6 builds); proposed owner:
  the Epic 57 testing TestCase.
evidence: >-
  (1) AD-7 forbids defining mock members through an Eloquent model's
  `defineProperty` trap, and no `MODEL_STATE` symbol exists yet (Story 36.1
  defines Model). XT-mockery-5 runs a local model double whose trap throws
  on a string key, mocked plainly, as a `[m]` partial, with `makePartial`,
  as a spy and with constructor arguments. (2) Mockery.php:140 takes
  `&$reference`; JS has no by-reference argument. (3) Container.php 698-712
  aliases a class name (`class_alias`) or intercepts its autoload;
  FoundationDevCommandsTest.php:377 is the one Upstream use. (4) Mock.php
  238-247 and 1036-1056 read Reflection visibility. (5) Mock.php 810-867
  builds the default from the method's declared return type, which JS does
  not have. (6) The ai, mcp and boost suites call `->returns()`,
  `->throws()` and `->resolves()` on `JMac\Testing\Double` (161 calls in
  conformance/scans/mockery-api.jsonl), not on a Mockery object. (7) CI's
  `check` job is not a required check (ESC-4.4-2 item 4). (8) A JS class has
  one prototype chain; PHP's generated class extends the class and
  implements the interfaces (MockConfiguration::generateName gives
  `Mockery_<n>_XtFoo_XtIface`, which the port reproduces). (9) PHP's
  `new $name` and `class_exists($name)` resolve names through the autoloader;
  the grader may not import the graded class registry (AD-2), and there are
  0 Upstream string-literal `andThrow` uses (`X::class` is a class value in
  TS). (10) `partialMock` is declared in
  `Illuminate\Foundation\Testing\Concerns\InteractsWithContainer` and
  calls `Mockery::mock(...)->makePartial()`; it is not in
  conformance/scans/mockery-api.jsonl.
---

# ESC-4.6-1: Mockery's mocked-model, by-reference, PHP-only and class-name contracts

Story 4.6 completes `@xaravel/mockery` with the rest of Mockery 1.6.15's scanned API. Ten points need a ruling or an owner outside the Story: a symbol protocol later Stories must honour, a by-reference box, PHP-only forms, visibility and return types JS lacks, three scanned names that are not Mockery's, the advisory CI step, multiple class targets, class-name strings, and an AC name that is Laravel's rather than Mockery's. The item numbers match `proposed`.

1. **`MODEL_STATE` and mocked models (XT-mockery-5, binds Story 36.1).** `MODEL_STATE` is `Symbol.for('xaravel.model.state')`, declared on `Model.prototype`. A model instance is one where `MODEL_STATE in instance`.
   - When the mock's instance has no own `MODEL_STATE` slot (the constructor did not run, or did not set one), Mockery defines one (`{}`) by symbol key.
   - A string-keyed `defineProperty` on the mock is stored in the escape slot `instance[MODEL_STATE][Symbol.for('xaravel.mockery.members')]` (a null-prototype record of descriptors), and the mock's `get` reads it. A non-configurable definition is refused, because a Proxy may not report a non-configurable property its target lacks.
   - A string-keyed `set` of a member defined through the mock updates it in the escape slot. Any other string-keyed `set` goes to the model itself (`Reflect.set` on the instance), the model's own set path, as PHP's `__set`. XT-mockery-5 checks both, with a model double whose `set` trap records string keys.
   - Story 36.1's Model Proxy must handle a string-keyed `set` itself, in its `set` trap. Otherwise ordinary [[Set]] reaches its `defineProperty` trap.
   - On a plain (constructor-less) model mock no model Proxy exists, so a fresh string-keyed `set` lands on the bare instance. Proposed: Story 36.1 rules on that path (for example, a Model whose attribute storage works without its constructor).
   - Symbol keys and non-model targets use `Reflect.defineProperty`. Mockery never defines a string-keyed property on a mock instance itself.
2. **`Mockery.capture(ref)`.** PHP's `capture(&$reference)` writes a caller's variable. The port writes `ref.value`, so a Ported Test passes a `{ value }` box. Story 9.5's `Ref<T>` must keep a writable `value` (AD-9's by-reference rule).
3. **`alias:` and `overload:` are PHP-only (DIV-6).** They rely on PHP class aliasing and autoload interception, which JS has no analogue for. They throw `InvalidArgumentException` naming this Escalation. The one Upstream use (FoundationDevCommandsTest.php:377) is skipped as `php-only` when it is ported. Proposed DIV-6 clause: "DIV-6 php-only: Mockery `alias:`/`overload:` mocks (class aliasing, autoload interception)".
4. **No run-time visibility (DIV-6).** TS `protected` and `private` do not exist at run time, so every method is mockable. Mockery's private-method and protected-method guards have nothing to read, and `shouldAllowMockingProtectedMethods()` only sets its flag and returns the mock. Proposed DIV-6 clause: "DIV-6 php-only: run-time method visibility (Mockery's protected/private guards)".
5. **`shouldIgnoreMissing` defaults.** Without a default value, Mockery derives one from the method's declared return type. JS has none, so a missing call returns null. With `recursive` set, every missing call returns a new ignore-missing mock, because no return type says which calls return objects.
6. **`returns`, `throws` and `resolves` are not Mockery's.** They are `jasonmccreary/double`'s (`JMac\Testing\Double`), which the ai, mcp and boost suites use. `bun run mockery:coverage` lists them as `pending ESC-4.6-1: <name> (JMac\Testing\Double)` and does not fail on them. Proposed: the Maintainer names an Infrastructure Story that ports Double into the grader.
7. **The coverage step is advisory.** `bun run mockery:coverage` runs in CI's `check` job ("Report Mockery API coverage"), which is not a required check, as for `assert:coverage` (ESC-4.4-2 item 4).
8. **Several class targets.** For `'A, B'`, `'A|B'`, `mock(A, B)` and `spy(A, B)`, only the first class is in the generated class's prototype chain, so `instanceof` holds for it only. Interface names are display-only parts of the mock's name, which matches Mockery's (`Mockery_<n>_A_B`).
9. **Class-name strings.** JS cannot resolve a PHP class name to a class.
   - `andThrow('<FQCN>')` (and `andThrows`) resolves only the exception classes the grader defines: PHP's SPL parents, `Exception` and Mockery's exceptions. Any other name throws PHP's `Class "<name>" not found` at setup. There are 0 Upstream string-literal uses; `X::class` is a class value in TS.
   - `Container::mock` resolves a class-name string, including a `'Foo[m1,!m2]'` partial, through `globalThis[Symbol.for('xaravel.class.lookup')](fqcn)`, a function that returns the registered class or null. An unresolved name is a display-only part of the mock's name, as in Story 4.5, and an unresolved partial throws Mockery's `Can only create a partial mock from an existing class or interface`. Proposed: Story 9.4's class registry installs the lookup. Until then XT-mockery-4's twins install a test-side stand-in for their own names.
10. **`partialMock()` is Laravel's, not Mockery's.** Story 4.6's AC names `partialMock()`. That is `Illuminate\Foundation\Testing\Concerns\InteractsWithContainer::partialMock`, which calls `Mockery::mock(...)->makePartial()`. Story 4.6 builds Mockery's `makePartial()` and `'Foo[m]'` partials; `partialMock` is not in `conformance/scans/mockery-api.jsonl`. Proposed owner: the Epic 57 testing TestCase.
