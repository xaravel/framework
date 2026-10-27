---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAString"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAnInteger"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAFloat"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testItGetsABoolean"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testItGetsAnArray"
  - "Illuminate\\Tests\\Support\\SupportArrTest::testPush"
trigger: contract
proposed: >-
  Extend public bindPhpArguments with ArrayAccess|array declaration validation and PHP TypeError declaration text. Preserve PHP coercive binding and add bounded XT-runtime comparisons against PHP for branded ArrayAccess instances, PHP array forms, invalid inputs and unused invalid defaults. No DIV, grader or expected-value change.
evidence: >-
  packages/runtime/src/php/userlandArguments.ts coerce recognizes only scalar, array and null members; declaration filters unknown members away. bindPhpArguments therefore rejects a valid ArrayAccess object for ArrayAccess|array, and reports only array for invalid inputs. All five typed Arr accessors declare ArrayAccess|array; push calls static::array. Do not implement nominal PHP declaration semantics in collections. Runtime is earlier, so six IDs remain not-ported-yet with this contract hold.
---

# ESC-14.6-5: Runtime ArrayAccess union argument binding

The public binder delivered by decisions/ESC-14.6-3.md handles scalar/array declarations but not this required interface union. For example, binding `new ArrayObject()` to `ArrayAccess|array` must accept the object; binding `null` must report `must be of type ArrayAccess|array, null given`, rather than dropping `ArrayAccess` from the declaration. The runtime should resolve the shared ArrayAccess identity, preserve object handle semantics and validate every supplied argument before executing the accessor body.

Hold `Arr.array`, `boolean`, `float`, `integer`, `string` and `push` whole and absent. The exact original tests, translated accessor bodies and pending bigint/tagged-float/class-token/default regression inputs remain preserved in [ESC-14.6-3](ESC-14.6-3.md); the exact push test remains in [ESC-14.6-1](ESC-14.6-1.md). Those historical records are retained unchanged.

Recommended under decisions/MAINT-2026-10-26-runtime-builtins.md's language-construct amendment: one bounded runtime binder extension with PHP comparisons, no local validator or other-component implementation in collections.
