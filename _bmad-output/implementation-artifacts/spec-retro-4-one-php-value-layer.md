---
title: 'Retro 4 item 3: Mockery uses @xaravel/assert''s PHP value helpers'
type: 'refactor'
created: '2026-10-18'
status: 'done'
baseline_revision: '3fa816e89700132e2e7d4fb0e2358ae2a70c7062'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `packages/mockery/src/support/values.ts` reimplements the PHP value predicates and formatters of `@xaravel/assert` (`comparison/PhpComparison.ts`, `comparison/PhpValues.ts`, `exporter/VarExport.ts`, `exporter/Exporter.ts`), because assert exports only the two comparisons. The copies disagree: (1) a plain object with `[Symbol.for('xaravel.php.props')]` is an object in assert and an array in Mockery; (2) an object of an unregistered subclass of an FQCN-branded class is the parent's FQCN in assert and the JS name in Mockery; (3) an anonymous-class object is `class@anonymous` in assert and `stdClass` in Mockery; (4) `-0` prints `0` in assert (DIV-9: an integral float reads as an int) and `-0`/`-0.0` in Mockery. `zend_gcvt`, `var_export`, string-key normalisation and the object-handle WeakMap are duplicated too. Epic 4 retrospective findings A1/A2, action item `epic-4-retro-item-3-one-php-value-layer`.

**Approach:** Add a `./php` subpath export to `@xaravel/assert` (`src/php.ts`) that re-exports the existing internal helpers, frozen on load like `index.ts`. Rewrite `values.ts` so every PHP value predicate, class name of an object, number/scalar string, array entry list, property list, `var_export` and object id comes from that subpath; keep only Mockery-specific logic (class-token helpers, `formatArgument`, `objectToArray`'s Mockery shape). Assert's behaviour is the reference wherever they differ.

## Boundaries & Constraints

**Always:** Keep every exported name and signature of `values.ts` that Mockery modules import, so no other Mockery file needs to change beyond imports. Assert's existing behaviour stays byte-identical (re-export only; at most export an already-internal helper or add one tiny `isBrandedArray` predicate in `PhpComparison.ts`). Freeze each function the subpath exports. Mockery's class-token helpers (`classNameOf(ctor)` with own-FQCN-only lookup and `null` for a nameless class, `instanceOfName`, `isClass`, `isClosure`, `isPhpClass`, `shortClassName`) keep their current semantics: they name class tokens, not values. All existing mockery and assert tests stay green with unchanged assertions; Oracle-backed XT-mockery-1..4 cells must still match the signed fixtures.

**Never:** Touch `conformance/expectations/**`, Oracle requests, signed fixtures, `scenarios.ts`/`cells.ts` expectations, or any assertion. Add a dependency edge other than the existing mockery → assert. Import any graded package. Change `tools/**`, `AGENTS.md` or the spine.

## I/O & Edge-Case Matrix

Observed through `NoMatchingExpectationException` messages of `m.bar(arg)` on a mock with `shouldReceive('bar').with('nope')`.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| props object | `{ [xaravel.php.props]() { return { a: 1 }; } }` | args print `object(stdClass)`; Objects block lists `'a' => 1` | No error expected |
| subclass of branded class | `new Sub()`, `Sub extends Reg`, `Reg[FQCN] = 'App\\Reg'` | `object(App\Reg)` | No error expected |
| anonymous class | `new (class {})()` | `object(class@anonymous)` | No error expected |
| negative zero | `-0`, `[-0]`, object with property `p: -0` | `bar(0)`, `bar([0 => 0])`, `'p' => 0` in the Objects block | No error expected |
| int-like string key | `{ "0": "x" }` | `bar([0 => 'x'])` | No error expected |
| same object, two packages | an object shown in an assert export and in a Mockery identity | one shared handle counter (`objectHandle`) | No error expected |

</intent-contract>

## Code Map

- `packages/assert/package.json` -- `exports` stays exactly `{ ".": "./src/index.ts" }`: XT-conformance-7 (`conformance/tests/xaravel/scaffold.test.ts:239`, Protected) requires it of every package.
- `packages/assert/src/index.ts` -- freeze-on-load loop; the helpers are exported here as flat `php*` names.
- `packages/assert/tests/xaravel/comparison.test.ts:235` -- XT-assert-3 pins the sorted export list and checks each export is a frozen function; the new names are added to that list, every check still runs on them.
- `packages/assert/src/comparison/PhpComparison.ts:158,189,490-506` -- `arrayEntries` (normalises keys), `objectProps` (props protocol), `isPhpArray` (props-aware); internal `isBranded` at ~100 (add exported `isBrandedArray`).
- `packages/assert/src/comparison/PhpValues.ts` -- `isPhpObject`, `isResource`, `classNameOf(value)` (inherited FQCN, `class@anonymous`), `formatDouble`, `phpToString`, `CLASS_FQCN`.
- `packages/assert/src/exporter/VarExport.ts:69` -- `varExport(value)`; accepts branded PHP arrays.
- `packages/assert/src/exporter/Exporter.ts:12-21` -- `objectHandle` WeakMap.
- `packages/mockery/src/support/values.ts` -- the duplicate layer: `isBrandedArray`, `isPhpArray`, `isPhpObject`, `isResource`, `getClass`, `objectId`, `gcvt`, `phpNumber`, `phpString`, `arrayEntries`, `publicProperties`, `Pairs`, `varExport`, `exportString`.
- `packages/mockery/src/Mockery.ts:95-123` -- `formatArgument`/`objectToArray`/`varExport` users (the "Objects: (" block).
- `packages/mockery/src/Mockery/Mock.ts:105,114,466,529` -- `getClass`, `objectId` users; mock classes carry an own FQCN, so `getClass` is unaffected for mocks.
- `packages/mockery/tests/xaravel/mockery.test.ts:252` -- fixture-free test style (plain `bun:test`, `thrown()` helper) for the new test.
- `tools/graph/graph.ts:87` -- `packageOf` maps `@xaravel/assert/php` to `@xaravel/assert`; no graph change.

## Tasks & Acceptance

**Execution:**
- `packages/assert/src/comparison/PhpComparison.ts` -- export `isBrandedArray(value: unknown)` (object, non-null, brand `in` value) next to `isBranded` -- Mockery's Container and Type matcher need it.
- `packages/assert/src/index.ts` + `packages/assert/tests/xaravel/comparison.test.ts` -- export `phpArrayEntries`, `phpIsBrandedArray`, `phpIsArray`, `phpObjectProps`, `phpIsObject`, `phpIsResource`, `phpClassNameOf`, `phpFormatDouble`, `phpToString`, `phpVarExport`, `phpObjectHandle` (and types `PhpKey`, `PhpEntries`) through the freeze loop; add the names to XT-assert-3's export list.
- `packages/mockery/src/support/values.ts` -- delegate: predicates and `arrayEntries` to the subpath; `getClass` to `classNameOf`; `objectId` to `objectHandle`; numbers in `phpString` to `phpToString`; `publicProperties` to `objectProps`; make `Pairs` a branded PHP array (`[Symbol.for('xaravel.php.array')]` + `[Symbol.iterator]` over its entries) and `varExport` assert's; delete `gcvt`, `phpNumber`, `exportString`, `isPlainObject` and the local WeakMap.
- `packages/mockery/tests/xaravel/mockery.test.ts` -- add a fixture-free test "Epic 4 retro A1: Mockery prints PHP values as @xaravel/assert does" covering every I/O matrix row, including one that compares an object's Mockery identity hash with `md5(<class>_<objectHandle>)` from the subpath.

**Acceptance Criteria:**
- Given the changes, when `bun test packages/mockery packages/assert` runs, then every test passes, including XT-mockery-1..6 against the signed fixtures and the new A1 test.
- Given `values.ts`, when searched, then it defines no float formatter, no `var_export` string escaper and no WeakMap of its own.
- Given `@xaravel/assert`, when code assigns to one of the new `php*` exports or a property of one, then it throws a `TypeError` (XT-assert-3).
- Given the repository, when `bun run graph:check`, `bun run typecheck` and `bun run lint` run, then each passes.

## Spec Change Log

### 2026-10-18 — implementation finding: no subpath export
- Trigger: the first implementation added `"./php"` to `packages/assert/package.json`; full `bun test` then failed XT-conformance-7 (`conformance/tests/xaravel/scaffold.test.ts:239`, Protected), which requires every package's `exports` to equal `{ ".": "./src/index.ts" }`. A module-namespace export (`export * as php`) then failed XT-assert-3, which requires every index export to be a frozen function.
- Amended: Code Map, Tasks and AC now export the helpers from the index as flat `php*` names and add them to XT-assert-3's export list. The intent-contract's "subpath" wording is superseded by this entry; the intent (one shared PHP value layer) is unchanged.
- Known-bad state avoided: changing a Protected conformance test, or a relative import into `packages/assert/src` from Mockery that would bypass the graph check.
- KEEP: `values.ts` delegation, branded `Pairs`, class-token helpers unchanged, and the A1 test.

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 30 findings — high 0, medium 4, low 14, false 10, maybe-false 0 (two spec-edit findings rejected without a severity are counted as low)
- findings:
  - `[low]` `[reject]` (blind) `Container.parseArrayArgument` keeps its own entry logic — grouped with verification-gap 3 below and patched there.
  - `[medium]` `[patch]` (blind) Container/Type now treat props objects as objects, untested — A1 test now checks `type('object')`/`type('array')` on a props object and `mock({"0": "a"})` parsing.
  - `[false]` `[reject]` (blind) `isBrandedArray` now uses `in` — the intent makes assert's behaviour the reference; recorded in the Auto Run Result.
  - `[low]` `[reject]` (blind) a symbol property prints as `\Symbol::__set_state` in the Objects block — symbols are not AD-9 values, assert already prints them so, and the fix would change assert's exporter.
  - `[false]` `[reject]` (blind) shared handle counter shifts Mockery ids — sharing is the intent (A2 object handles); no test or fixture pins a concrete id (full suite green).
  - `[low]` `[patch]` (blind) `phpFormatDouble` and `PhpEntries` exported but unused — removed from index and XT-assert-3's list.
  - `[low]` `[reject]` (blind) spec wording stale after the amendment — fix is a spec edit; the Spec Change Log supersedes the subpath wording.
  - `[low]` `[reject]` (blind) spec cites XT-mockery-1..4 vs 1..6 — fix is a spec edit; 1..4 are Oracle-backed, 5..6 fixture-free, both ran green.
  - `[low]` `[reject]` (blind) var_export layout change has no direct test — XT-mockery-1..4 Objects blocks against signed fixtures and the A1 nested-properties row still pass.
  - `[false]` `[reject]` (blind) branded `Pairs` may throw on duplicate normalised keys — every `set` caller passes already-normalised keys (from `arrayEntries`/`objectProps` or literal names); no reachable path shown.
  - `[low]` `[patch]` (blind) A1 identity check reuses `sub`, cannot prove one counter — now takes `phpObjectHandle` of a fresh object before Mockery sees it. Regex-escape and import-grouping notes rejected as cosmetic.
  - `[low]` `[reject]` (blind) wrapper/copy cruft in `values.ts` — cosmetic, no named harm.
  - `[low]` `[reject]` (edge) malformed props protocol now throws assert's TypeError instead of being printed empty — loud failure on a contract violation, the same TypeError assert's comparisons raise.
  - `[false]` `[reject]` (edge) malformed branded array throws while formatting — the same contract violation assert rejects; not a mismatch being hidden.
  - `[false]` `[reject]` (edge) `[xaravel.php.array]: false` is now branded — assert is the reference (intent).
  - `[false]` `[reject]` (edge) Objects block collides for two anonymous classes — keyed by class name as upstream `formatObjects` keys by `get_class`; same-class objects already collided.
  - `[low]` `[reject]` (edge) partial of an unregistered subclass is named `Mockery_N_App_Reg_Sub` — cosmetic, only for unregistered subclasses of branded classes, no PHP twin; changing `Mock.ts` class-token naming is outside the value layer.
  - `[false]` `[reject]` (edge) symbol property printing — duplicate of the blind symbol row; see there (assert's established behaviour).
  - `[low]` `[patch]` (edge) A1 test never calls `Mockery.close()` — added.
  - `[low]` `[reject]` (edge) no test with two anonymous objects in one call — the collision is upstream-faithful (see above).
  - `[medium]` `[patch]` (verification-gap 1) partial mock names changed with no test — A1 test pins `mock(new (class {})())` name containing `class@anonymous`.
  - `[medium]` `[patch]` (verification-gap 2) Container/Type props-object behaviour untested — same patch as the blind row.
  - `[medium]` `[patch]` (verification-gap 3) `parseArrayArgument` reads keys its own way — now uses `arrayEntries`; test fails without the fix (checked by stashing `Container.ts`).
  - `[low]` `[reject]` (verification-gap other) malformed props throws a different error — see the edge row.
  - `[low]` `[patch]` (verification-gap other) stale "Not re-exported by index.ts" comment in `PhpComparison.ts` — reworded.
  - `[false]` `[reject]` (verification-gap other) mock ids no longer Mockery-local — intended sharing; nothing pins them.
  - `[low]` `[reject]` (intent) entry point is the index, not a subpath — forced by Protected XT-conformance-7; recorded in the Spec Change Log; the intent's goal (one shared layer) is met.
  - `[low]` `[reject]` (intent) matching-side changes untested — patched via the verification-gap rows.
  - `[false]` `[reject]` (intent) `isBrandedArray` edge untested — adopted per intent; same as the blind row.
  - `[low]` `[reject]` (intent) duplicates inside assert (`encodeDouble`, `exportString`/`exportFloat` twice) remain — the retro folds A2 into item 3 only "where they touch PHP values" between the packages and defers the rest; `encodeDouble` uses JSON's `e` exponent, a different format.

## Design Notes

Making `Pairs` a branded array lets assert's `isPhpArray`/`arrayEntries`/`varExport` consume Mockery's `objectToArray` output unchanged; `brandedKey` normalises its keys exactly as PHP stores them. Assert's `var_export` prints an object's properties inside `__set_state(array(...))` where Mockery printed it empty; that is PHP's output and becomes Mockery's.

## Verification

**Commands:**
- `bun test packages/mockery packages/assert` -- expected: all pass
- `bun run typecheck` -- expected: no errors
- `bun run lint`, `bun run graph:check`, `bun run mockery:coverage`, `bun run assert:coverage` -- expected: clean

## Auto Run Result

Status: done

**Summary:** `@xaravel/assert` now exports its PHP value layer from the index as frozen `php*` functions (`phpArrayEntries`, `phpIsArray`, `phpIsBrandedArray`, `phpIsObject`, `phpIsResource`, `phpObjectProps`, `phpClassNameOf`, `phpToString`, `phpVarExport`, `phpObjectHandle`, type `PhpKey`). `packages/mockery/src/support/values.ts` reads every PHP value predicate, an object's class name, scalar strings, array entries, properties, `var_export` and object handles through them; its own `gcvt`, `phpNumber`, `exportString`, plain-object check and WeakMap are gone. Mockery now agrees with assert on all four A1 cases (props object, unregistered subclass, anonymous class, `-0`), on int-like string keys, and on `isBrandedArray` (brand present, as assert).

**Files changed:**
- `packages/assert/src/index.ts` -- exports and freezes the `php*` helpers.
- `packages/assert/src/comparison/PhpComparison.ts` -- exported `isBrandedArray`; comment on the internal exports.
- `packages/assert/tests/xaravel/comparison.test.ts` -- XT-assert-3's pinned export list gains the new names; every frozen-function check runs on them (no assertion removed or weakened).
- `packages/mockery/src/support/values.ts` -- delegates to the shared layer; `Pairs` is a branded PHP array.
- `packages/mockery/src/Mockery/Container.ts` -- `parseArrayArgument` uses the shared `arrayEntries`.
- `packages/mockery/tests/xaravel/mockery.test.ts` -- new fixture-free test "Epic 4 retro A1" covering every I/O matrix row plus the Type matcher, `mock()` array parsing and anonymous partial names.

**Review:** 30 findings; 8 patched (4 medium, 4 low), 0 deferred, 22 rejected with reasons in the triage log.

**Follow-up review:** false. Two medium entries were patched, but both are test additions plus a one-line `arrayEntries` swap, verified by the full suite and by the new test failing without the fix; no unverified risk remains to name.

**Verification:** `bun test` 154 pass, 0 fail (includes XT-mockery-1..6 against signed fixtures, XT-assert-3, XT-conformance-7); `bun run typecheck`, `bun run lint`, `bun run graph:check`, `bun run mockery:coverage`, `bun run assert:coverage` all exit 0.

**Residual risks:** the deviation from the action item's "(a subpath)" wording (forced by XT-conformance-7) is recorded in the Spec Change Log; a partial mock of an unregistered subclass of a branded class is named `Mockery_N_App_Reg_Sub` (cosmetic).
