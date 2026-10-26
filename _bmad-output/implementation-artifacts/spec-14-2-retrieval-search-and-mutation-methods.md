---
title: 'Story 14.2: Retrieval, search and mutation methods'
type: 'feature'
created: '2026-10-26'
status: 'blocked'
baseline_revision: '44de038fc83fd13f2a00e7dba7ffa35064f5ff6d'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/PORTING.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-14-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-14-1-enumerable-core-construction-conversion-and-serialization.md'
  - '{project-root}/decisions/DIV-9.md'
  - '{project-root}/decisions/DIV-12.md'
  - '{project-root}/packages/runtime/docs/php-functions.md'
  - '{project-root}/conformance/review/fidelity.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The 171 Test IDs of Story 14.2 (SCT `testFirst*`, `testLast*`, `testSole*`, `testHas*`, `testContains*`, `testSearch*`, `testBefore*`, `testAfter*`, `testNth*`, `testRandom*`, `testPluck*`, `testOnly`, `testExcept*`, `testSelect*`, `testPop*`, `testShift*`, `testPull*`, `testPut*`, `testPush*`, `testPrepend`, `testUnshift*`, `testAdd`, `testForget*`, `testSplice`, `testValue*`, `testKeys`, `testGetOrPut*`, `testGetPluckValueWithAccessors`) and XT-collections-4/5 are `not-ported-yet`. Collection and LazyCollection lack the methods that read, find, add and remove items.

**Approach:** Port the members below line for line over `@xaravel/runtime`, on both `Collection` and `LazyCollection` where Upstream has them, plus `ItemNotFoundException` and `MultipleItemsFoundException`. Port the tests with the `collectionClassProvider` dataset. Planning found three gaps the Story cannot close within `packages/collections/**`, raised as ESC-14.2-1..3. ESC-14.2-1 (runtime builtins) holds 145 Test IDs, including the shared paths `Arr::first`, `contains` and `operatorForWhere`, so the build waits for the rulings.

## Boundaries & Constraints

**Always:**
- Edit only `packages/collections/**`, the Story's lines in `conformance/expectations/collections/framework/tests/Support/SupportCollectionTest.jsonl`, `conformance/oracle-requests/14.2.jsonl` and `conformance/escalations/ESC-14.2-<n>.md`, plus orchestrator bookkeeping (this spec, sprint status, `stories/14.2.md` status).
- Every PHP builtin comes from `@xaravel/runtime` under its PHP name (epic context, `decisions/MAINT-2026-10-26-runtime-builtins.md`). `func_num_args()` is `arguments.length` in a method (never an arrow function), and `func_get_args()` forwards `...arguments` unchanged (Conditionable.ts:190 precedent).
- Ported Tests use `portedTest(...)`, `@xaravel/assert` and the 14.1 dataset; each changed line carries `// adapted:DIV-<n>.<k>`, and its Expectations line the same clause.

**Never:**
- Never edit another package, never write a private copy of a PHP builtin in `packages/collections`, never port an escalated Test ID before its ruling, never use a JS `Proxy` (AD-7).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Loose vs strict | `collect([1])->contains('1')`, `->containsStrict('1')` | `true`, `false` (XT-collections-4) | — |
| sole | zero matches / two matches | — | `ItemNotFoundException` / `MultipleItemsFoundException` with `getCount()` 2 (XT-collections-5) |
| firstOrFail | zero matches | — | `ItemNotFoundException` |
| Lazy strict before/after | `before([], true)` on a lazy source holding `[]` | the key before it (PHP `===` on arrays) | — |
| nth | step 0, or a negative step | — | `InvalidArgumentException('Step value must be at least 1.')` |
| random | an amount larger than the count | — | `InvalidArgumentException` with Upstream's message |
| shift | a negative count | — | `InvalidArgumentException('Number of shifted items may not be less than zero.')` |

</intent-contract>

## Code Map

- `conformance/upstream/framework/src/Illuminate/Collections/Collection.php` -- contains :196, containsStrict :216, doesntContain :237, doesntContainStrict :250, except :404, first :443, forget :475, getOrPut :515, has :611, hasAny :624, containsOneItem :740, containsManyItems :753, keys :793, last :807, pluck :819, nth :961, only :988, select :1009, pop :1030, prepend :1064, push :1079, unshift :1096, pull :1132, put :1148, random :1164, search :1216, before :1232, after :1256, shift :1281, slice :1382, sole :1458, hasSole :1487, firstOrFail :1509, sortBy :1601 (reached only by testValueRetrieverAcceptsDotNotation), splice :1768, take :1783.
- `.../LazyCollection.php` -- contains :245, containsStrict :276, doesntContain :305, doesntContainStrict :318, except :435, first :470, has :594, hasAny :615, containsOneItem :703, containsManyItems :715, keys :737, last :755, pluck :775, nth :926, only :951, select :986, random :1041, search :1100, before :1125, after :1154, skip :1240, slice :1299, sole :1336, hasSole :1358, firstOrFail :1381, sortBy :1516, take :1563, explodePluckParameters :1919, passthru :1935. `skip` / `take` copy their captured count into a local on each enumeration (the 14.1 `range` lesson). LazyCollection has no pop/shift/push/put/pull/prepend/unshift/splice; those tests have no provider.
- `.../Traits/EnumeratesValues.php` -- some :239, firstWhere :333, hasMany :346, value :368, where :657, operatorForWhere :1138 (enum_value, data_get, `array_filter` with the `is_object` function, `Stringable`, `in_array`, `looseEquals`, `spaceship`, PHP `===`).
- `.../Arr.php` -- except :233, first :293, last :340, forget :426 (`Ref<T>`, DIV-9.2), get :497, only :752, select :781, pluck :808, explodePluckParameters :847, prepend :932, pull :951 (`Ref<T>`), random :981. `.../helpers.php` -- data_has :45. `.../ItemNotFoundException.php`, `MultipleItemsFoundException.php` -- new files `src/ItemNotFoundException.ts`, `src/MultipleItemsFoundException.ts` over the runtime's `RuntimeException`, registered under their Upstream FQCNs.
- `packages/collections/src/*` -- 14.1's port: `Collection.ts`, `LazyCollection.ts`, `Traits/EnumeratesValues.ts` (`DEFAULT_PROXIES` already lists contains / hasSole / hasMany / doesntContain), `Arr.ts` (`exists` calls `has` through the `Enumerable` type: the 14.1 deferral this Story closes), `helpers.ts`, `support/callables.ts` (`arrayRead`, `propertyRead`, `propertyIsSet` for `isset($o->{$k})`), `Enumerable.ts` (add the shared members; `has`, `hasAny`, `except` become variadic).
- `packages/collections/tests/ported/framework/tests/Support/SupportCollectionTest.test.ts` -- add the Story's tests; test-local fixtures `StaffEnum` (SCT:6655, AD-26 enum, `Illuminate\Tests\Support\StaffEnum`), `TestAccessorEloquentTestStub` (SCT:6550, `__get` / `__isset`, a plain class: not blocked-by database) and `TestArrayAccessImplementation` (SCT:6586) are in neither `Fixtures/Common.ts` nor `Fixtures/Enums.ts`.
- `packages/runtime/src/php/index.ts` -- exports used: `in_array`, `array_filter`, `array_keys`, `array_values`, `array_key_exists`, `count`, `abs`, `explode`, `is_string`, `is_array`, `is_object`, `is_callable`, `toPhpArray`, `looseEquals`, `spaceship`, `toBool`, `stdClass`, `Stringable`, `UnitEnum`, `RuntimeException`, `InvalidArgumentException`, `yieldFrom`, `keyed`, `Ref`. Missing ones are ESC-14.2-1's list.

## Tasks & Acceptance

**Execution (after ESC-14.2-1..3 are ruled and any runtime item lands):**
- `packages/collections/src/{Collection,LazyCollection,Enumerable,Arr,helpers}.ts`, `Traits/EnumeratesValues.ts`, `ItemNotFoundException.ts`, `MultipleItemsFoundException.ts`, `index.ts` -- port the Code Map members line for line; replace Arr.exists' 14.1 `has` note with the real call.
- `packages/collections/tests/ported/.../SupportCollectionTest.test.ts` -- port the 171 Test IDs; testValueWithObjects#0/#1 keep Upstream's body in a case whose `setUp` throws `BlockedByComponentError('support')` (`literal()` is Support's helper, `src/Illuminate/Support/helpers.php:190`).
- `packages/collections/tests/xaravel/collections.test.ts` -- XT-collections-4 (contains loose / strict through `looseEquals`) and XT-collections-5 (sole / firstOrFail exceptions, `fqcn()` of each is its Upstream FQCN), citing FR-23's consequences.
- `packages/collections/docs/collections.md` -- document the new members and any new DIV clause.
- Expectations -- each ported ID `pass` with its clause; testValueWithObjects#0/#1 `skip` / `blocked-by:support`; `escalation` back to `null` once ruled.

**Acceptance Criteria:**
- Given `bun run harness --story 14.2`, when it runs, then no line differs and none is `not-ported-yet`.
- Given `bun run story:check 14.2`, when it runs, then every clause passes, two Fidelity `pass` verdicts included.

## Spec Change Log

## Review Triage Log

## Design Notes

Planning traced every Test ID through Upstream and the test bodies, and checked each PHP name against the runtime's exports at 44de038f (the Epic 11 and 13 lessons: raise every follow-on question in one round).

- **ESC-14.2-1 (contract, 145 Test IDs and XT-collections-4/5).** Missing: `array_any`, `array_all`, `array_find_key`, `array_first`, `array_last`, `array_search`, `array_flip`, `array_slice`, `array_reverse`, `array_intersect_key`, `array_intersect_assoc`, `array_shift`, `array_pop`, `array_unshift`, `array_splice`, `min`, `str_contains`, `strlen`, `lcfirst`, `property_exists`, `method_exists`, `Random\Randomizer`, `SortDirection`, `asort` / `arsort`, an exported `identical` (PHP `===` on arrays), and the PHP names `is_numeric` / `is_float`. It qualifies for the standing rule `decisions/MAINT-2026-10-26-runtime-builtins.md`.
- **ESC-14.2-2 (divergence, testPushWithMultipleItems, testUnshiftWithMultipleItems).** `push(...[11 => 'Jonny', …])`: the literal is a `PhpArray` whose iterator yields `[key, value]` pairs, so `...a` passes pairs; `...array_values(a)` changes the line and no DIV clause covers it.
- **ESC-14.2-3 (divergence, XT-collections-4/5).** `api-surface:gate` (tools/api-surface/api-surface.ts:40) requires an options-form overload for members with two or more optional parameters; `contains`, `first`, `sole`, `firstOrFail`, `where` and the like take a PHP value first and read `func_num_args()`, the DIV-12.13 clash. Story 14.8's gate AC needs the ruling.

Settled without an Escalation:
- **`new $collection` on the reassigned instance** (testHasSole, testHasMany). Upstream rebinds `$collection` to an instance, then calls `new $collection([...])`, which in PHP builds another instance of the same class. The port keeps the dataset constructor under its own name and gives the instance a new local name, so `new collection([...])` is PORTING.md's data-provider rule as written; no value or assertion changes.
- **`->contains->a`, `->hasSole->verified`, `->hasMany->verified`, `->doesntContain->a`** are `__get('…')` reads marked DIV-12.16 (testContains, testDoesntContain, testHasSole, testHasMany, both datasets).
- **`isset($c->all()[k])`** after `forget` reads the PHP array through `arrayEntries` (PORTING.md § Reading a PHP array); `(object) [...]` is `Object.assign(new stdClass(), …)` (PORTING.md:146); a `null`-keyed literal is a `PhpArray` (DIV-9.2, no marker).
- **testValueWithObjects** is `blocked-by:support` (`literal()`); `tools/expectations/reasons.ts` accepts it because support is a later Phase. Epic 19 re-verifies it under `epics.md`'s global rule.
- **Not held by an Escalation** (22 Test IDs): testAdd, testPut, testPutWithNoKey, testPutAddsItemToCollection, testValues#0/#1, testValuesResetKey#0/#1, testForget* (3), testGetOrPut / WithNoKey, testKeys#0/#1, testPushWithOneItem, testSelectWith{Arrays,ArrayAccess,Objects}#0/#1. They are built in the same pass as the rest once the rulings land, so the Fidelity Review sees one tree and `Enumerable.ts` is written once.

## Verification

**Commands:**
- `bun run escalations:check`, `bun run expectations:check` -- expected: OK.
- `bun run harness --story 14.2`, `bun run harness --xaravel --component collections`, `bun run typecheck`, `bun run lint`, `bun run divergence:check` -- expected: no difference, no error.
- `bun run story:check 14.2` -- expected: every clause passes.

## Auto Run Result

Status: blocked
Blocking condition: ESC-14.2-1 (runtime builtins, contract; qualifies for the monitor under `decisions/MAINT-2026-10-26-runtime-builtins.md`) holds 145 Test IDs and XT-collections-4/5, including the shared `Arr::first` / `contains` / `operatorForWhere` paths. ESC-14.2-2 (keyed-array spread, divergence) and ESC-14.2-3 (options-form overloads, divergence) wait on the Maintainer. No package code was written. The 147 escalated Expectations lines name their Escalation; `escalations:check` and `expectations:check` pass.
