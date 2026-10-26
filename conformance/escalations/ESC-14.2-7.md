---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testGetPluckValueWithAccessors#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testGetPluckValueWithAccessors#1"
trigger: contract
proposed: >-
  Option 1 (recommended): one more runtime item, in `packages/runtime` only,
  as epic-14-item-5 and epic-14-item-6 were. `@xaravel/runtime/php` gives
  PHP's dynamic method call `$object->$name(...$args)`: a function (for
  example `callMethod(object, name, ...args)`) that resolves `name` as PHP
  does, exactly and then case-insensitively over the object's methods (the
  lookup `method_exists` already makes, objectFunctions.ts:143), falling
  back to the object's `__call` port, and throwing PHP's `Error` `Call to
  undefined method <class>::<name>()` otherwise, with XT-runtime cases
  against PHP's results. A PORTING.md idiom-table row for `$o->$name(...)`
  names the helper. PORTING.md is Protected, and the helper is not a PHP
  function name, so this option does not qualify under the runtime-builtins
  standing rule: it needs the Maintainer. The two Test IDs then port as
  Upstream wrote them, with the fixture `TestAccessorEloquentTestStub`
  calling `$this->$accessor()` through the helper. Option 2: the fixture
  calls `this[accessor]()` with the accessor name re-cased by hand
  (`getSomeAttribute`), which changes Upstream's `'get'.lcfirst($attribute).'Attribute'`
  with no PORTING.md row or DIV clause to cover it. Option 3: the runtime
  exports PHP's `call_user_func` / `call_user_func_array`, which resolve an
  `[object, name]` callable case-insensitively and would qualify under the
  standing rule, but the fixture would then be rewritten from
  `$this->$accessor()` to `call_user_func([$this, $accessor])`, a change to
  Upstream's code that no PORTING.md row covers either.
evidence: >-
  Story 14.2's third round, at e5ee034d, ported testGetPluckValueWithAccessors
  (SupportCollectionTest.php:3360) and its fixture TestAccessorEloquentTestStub
  (:6550) as the spec asked. The fixture's `__get` / `__isset` build
  `$accessor = 'get'.lcfirst($attribute).'Attribute'`, which for `'some'` is
  `getsomeAttribute`, then call `method_exists($this, $accessor)` (true: PHP
  method names are case-insensitive, and the runtime's `method_exists`
  matches case-insensitively) and `$this->$accessor()`, which PHP dispatches
  to `getSomeAttribute()`. In JavaScript `this['getsomeAttribute']` is
  `undefined`, so the harness fails both rows with `this[accessor] is not a
  function`. The runtime exports no case-insensitive method call, and no
  `call_user_func`. A private lookup in the test file or in
  packages/collections would re-implement PHP semantics there, which the
  epic 14 context and decisions/MAINT-2026-10-26-runtime-builtins.md forbid.
  The two Expectations lines stay `not-ported-yet` with this Escalation, not
  `blocked-by:runtime`, for the reason ESC-14.2-4 gives
  (tools/expectations/reasons.ts:270-282). Option 1 adds no DIV clause and
  changes no expected value or grader file, but its PORTING.md row and its
  non-PHP helper name put it outside the runtime-builtins standing rule, so
  it waits for the Maintainer.
---

# ESC-14.2-7: Story 14.2 needs PHP's case-insensitive dynamic method call from the runtime

The third round ported testGetPluckValueWithAccessors#0/#1 and its fixture as Upstream wrote them. The fixture's `__get` / `__isset` call `$this->$accessor()` with the name `getsomeAttribute`, which PHP resolves case-insensitively to `getSomeAttribute()`. JavaScript property lookup is case-sensitive, and the runtime exports no PHP method call that folds case, so both rows fail. Option 1 adds one to `packages/runtime`, with a PORTING.md row, so the Maintainer rules on it. This Escalation holds only these two Test IDs. The other eight Test IDs of the round pass.
