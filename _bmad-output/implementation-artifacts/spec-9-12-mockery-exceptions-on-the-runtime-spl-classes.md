---
title: "Story 9.12: Mockery exceptions on the runtime's SPL classes"
type: 'feature'
created: '2026-10-22'
baseline_revision: '553464e33da57f48164bd072d1b806c8b21392d2'
status: 'in-review'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/stories/9.12.md'
  - '{project-root}/decisions/ESC-9.11-1.md'
  - '{project-root}/decisions/ESC-4.5-1.md'
  - '{project-root}/packages/runtime/docs/exceptions.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** `@xaravel/mockery` keeps grader-internal copies of PHP's `\Exception` and seven SPL classes (`packages/mockery/src/php/`) that extend the JS `Error`. A Mockery failure is therefore never `instanceof` the runtime's `\RuntimeException`, `\BadMethodCallException`, … and a Ported Test's `expectException(\BadMethodCallException::class)` cannot match it (ESC-4.5-1 item 2, the Mockery half of DIV-9.8 after ESC-9.11-1).

**Approach:** As the grader does in Story 9.11 (`packages/assert/src/Framework/Exception/RuntimeExceptionParent.ts`), put one internal, unexported, unfrozen parent class between each copy and its PHP parent. When `globalThis[Symbol.for('xaravel.php.classes')]` is published, each parent's constructor and prototype are re-parented onto the runtime class of the same PHP name. With no map, the chain is today's (plus the internal parent).

## Boundaries & Constraints

**Always:**
- Edit only `packages/mockery/**`, this spec, and the Story's status lines (`sprint-status.yaml`, `stories/9.12.md` `status:`).
- Grader isolation (AD-2): nothing in `packages/mockery/src` imports `@xaravel/runtime`; the map is read by its symbol only, and a test that needs the runtime loads it only in a child `bun` process.
- **Copies and PHP parents** (PHP's SPL tree): `Exception` (root, parent JS `Error`), `RuntimeException` and `LogicException` (`Exception`), `InvalidArgumentException` and `BadFunctionCallException` (`LogicException`), `BadMethodCallException` (`BadFunctionCallException`), `OutOfBoundsException` and `UnexpectedValueException` (`RuntimeException`). Unlinked, each copy extends its parent copy through its internal parent; linked, the internal parent of copy `N` sits on the runtime's `map[N]`, so every Mockery exception is `instanceof` the runtime SPL classes PHP's Mockery 1.6.15 reaches, `map.Exception`, the JS `Error`, and never `map.Error`.
- **When it links:** at module load when the map is already published, else on the first construction of any copy or subclass, an `instanceof` on a copy, or `graderExceptionClass()` after it appears. All eight parents link together; linking is one-way.
- **`instanceof` a copy:** once linked, `v instanceof <copy N>` is `v instanceof map[N]` (the copies stand for PHP's one class of that name, so a runtime `\RuntimeException` is also `instanceof` Mockery's copy, and a `RuntimeException` copy instance is `instanceof` the `Exception` copy). Only the copy itself delegates; a subclass (Mockery's own exceptions) keeps the default `instanceof`. Unlinked, the default.
- **Same behaviour in both modes:** `getMessage()`, `getCode()`, `getPrevious()`, the JS `message`, `name` (the short class name, as today) and `Reflect.ownKeys` are the same with and without the map. `code` is an own, writable, non-enumerable property and a non-null `previous` is the JS `cause`, in both modes (as the grader's parent does). Linked, construction runs the runtime constructor, so its PHP argument coercion applies (string message, int code, `Error | null` previous).
- The copies stay frozen and unexported as today (`src/index.ts` freeze loop); the internal parents are never exported or frozen.
- Comments in each copy cite its PHP parent and this Story; `packages/mockery/README.md` states the SPL linking, when it applies and its late-load limit.
- Xaravel Test conventions of `packages/mockery/tests/xaravel/*.test.ts`: header naming the Story, the F-10 note (no Upstream test inputs: this is the follow-up of ESC-4.5-1 item 2, as ESC-9.11-1 splits it), children with a `timeout`.

**Never:**
- Edit `packages/assert/**`, `packages/runtime/**`, `decisions/**`, `PORTING.md`, `docs/**`, `conformance/**`, `tools/**`, or `stories/**` beyond the status line. Closing DIV-9.8 is the planning change ESC-9.11-1 names, not this Story.
- Import the runtime from `src/`, export the internal parents, or unfreeze a copy.
- Edit an existing test's expected value; XT-mockery-1..11 pass unchanged.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No map | child `bun`, no runtime: each copy built with `("m", 5, prev)` and Mockery's own exceptions (`BadMethodCallException`, `NoMatchingExpectationException`, `InvalidCountException`, `Mockery\Exception\RuntimeException`, `InvalidArgumentException`) | chain copy → internal parent → parent copy … → JS `Error`; getters `m`/`5`/`prev`; `name` short class name; `instanceof` each copy along the PHP chain | — |
| Runtime first / Mockery first | child loads the runtime then Mockery; and Mockery, then the runtime, then builds | every row `instanceof` its runtime SPL classes along PHP's chain, `map.Exception`, `Error`, not `map.Error`; getters, `message`, `name`, own keys equal to the no-map run; copies frozen | — |
| Late load | Mockery exceptions built, runtime loaded, nothing new built; then an `instanceof` on a copy | after the copy `instanceof`, the earlier instances are `instanceof` the runtime classes; getters unchanged | — |
| expectException | linked: a Mockery `BadMethodCallException` from an unexpected call; grader `Constraint\Exception(map.BadMethodCallException)`, `assertInstanceOf(map.BadMethodCallException, e)`; a TestCase body under `expectException(map.BadMethodCallException)` that makes the call; same under `expectException(map.RuntimeException)` | match; passes; test passes (PHPUnit verifies a non-PHPUnit exception); fails with the grader's `Constraint\Exception` failure, whose message names `Mockery\Exception\BadMethodCallException` and `RuntimeException` (it is a `\LogicException`, as in PHP) | — |
| Delegated instanceof | linked: `new map.RuntimeException("x") instanceof <RuntimeException copy>`; `<RuntimeException copy instance> instanceof <Exception copy>`; a `NoMatchingExpectationException` `instanceof BadMethodCallException` (Mockery's) | true; true; false | — |
| Coercion | linked: a copy built with a non-int code | the runtime's `TypeError` (PHP's message) | thrown |

</intent-contract>

## Code Map

- `packages/mockery/src/php/Exception.ts:1-30` -- the root copy: its constructor, `#code`/`#previous` and getters move to the internal parent; it keeps `static [FQCN] = "Exception"`.
- `packages/mockery/src/php/{RuntimeException,LogicException,InvalidArgumentException,BadFunctionCallException,BadMethodCallException,OutOfBoundsException,UnexpectedValueException}.ts` -- 7-line copies, `extends` their parent copy; each switches to `extends splParent("<Name>", <ParentCopy>)` (or the module's equivalent).
- `packages/mockery/src/support/values.ts:26` (`FQCN = Symbol.for("xaravel.class.fqcn")`), `shortClassName`, `classNameOf:66` (own brand only).
- `packages/mockery/src/support/classes.ts:48-70` -- `graderExceptionClass`: link before resolving.
- `packages/mockery/src/index.ts:107-215` -- imports and freezes the copies; the header comment (`:15-16`) says they are not exported.
- `packages/mockery/src/Mockery/Exception.ts`, `Mockery/Exception/*.ts`, `Mockery/CountValidator/Exception.ts`, `JMac/Testing/Exceptions/DoubleException.ts` -- Mockery's own exceptions on the copies (string-only `super` calls).
- `packages/assert/src/Framework/Exception/RuntimeExceptionParent.ts` (read-only) -- the reference linking pattern (lazy link, `delete` runtime `name`, own `code`, getters on the parent).
- `packages/runtime/src/php/phpClasses.ts:40-84`, `Exception.ts`, `throwableArguments.ts:134-175` (read-only) -- the map (all eight names present), the constructor coercion, `initThrowable` (own `name` = brand, own `code`).
- `packages/assert/tests/xaravel/exceptions-spl.test.ts` (read-only) -- the child-process idiom, `runTest` body runner and `Reflect.ownKeys` comparison to follow.
- `packages/mockery/tests/xaravel/mockery.test.ts:710-727` (XT-mockery-3) -- `instanceof` the copies; must stay green.

## Tasks & Acceptance

**Execution:**
- `packages/mockery/src/php/SplParent.ts` (new, internal) -- the parent factory, the map reader, `link()` and the delegated static `Symbol.hasInstance`.
- `packages/mockery/src/php/*.ts` -- each copy on its internal parent; comments cite PHP parent, Story 9.12.
- `packages/mockery/src/support/classes.ts` -- link in `graderExceptionClass`.
- `packages/mockery/README.md` -- the SPL linking paragraph.
- `packages/mockery/tests/xaravel/exceptions-spl.test.ts` (new) -- XT-mockery-12, the matrix rows above in child processes.
- `stories/9.12.md` -- `status:` line only.

**Acceptance Criteria:**
- Given Story 9.10's SPL protocol and Story 9.11's grader side, when Mockery throws or compares exceptions, then its exceptions extend the runtime's SPL classes when the map is published and keep today's chain when it is absent, and `expectException` on a Mockery failure matches as in PHP (XT-mockery-12).
- Given the whole grader suite, when it runs, then XT-mockery-1..11 and XT-assert-1..21 still pass.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why a parent per copy.** The copies are frozen (`src/index.ts`), so their own `[[Prototype]]` cannot change; and PHP's tree has eight levels Mockery needs (`\OutOfBoundsException` for `CountValidator\Exception`, `\UnexpectedValueException` for `Mockery\Exception`, …), so one shared parent (the grader's single `RuntimeExceptionParent`) is not enough.
- **Why `Symbol.hasInstance`.** Linked, copy `RuntimeException`'s chain runs through `map.RuntimeException`, not through copy `Exception`, so without delegation `new RuntimeException() instanceof <Exception copy>` would turn false only when the runtime is loaded.

## Verification

**Commands:**
- `bun test packages/mockery packages/assert` -- expected: pass, XT-mockery-12 included.
- `bun run harness --xaravel --id 'XT-mockery-*'` -- expected: no difference.
- `bun --bun tsc -b`, `bun run lint`, `bun run graph:check`, `bun run registration:check` -- expected: clean.
