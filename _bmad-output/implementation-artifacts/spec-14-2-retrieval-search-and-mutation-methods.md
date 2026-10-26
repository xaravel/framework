---
title: 'Story 14.2: Retrieval, search and mutation methods'
type: 'feature'
created: '2026-10-26'
status: 'in-progress'
baseline_revision: 'b5938e16327974bf60454c2d8f3e4457c6c5d576'
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
  - '{project-root}/decisions/MAINT-2026-10-26-story-14-2.md'
  - '{project-root}/conformance/escalations/ESC-14.2-4.md'
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
- ESC-14.2-1's exports, landed in b5938e16 (epic-14-item-5), read-only here. `packages/runtime/src/php/arrayFunctions.ts`: `array_any` :594, `array_all` :602, `array_find_key` :610, `array_first` :624, `array_last` :629, `array_search(needle, haystack, strict = false)` :638 (returns `false` when absent), `array_flip` :651, `array_slice(array, offset, length = null, preserve_keys = false)` :688, `array_reverse(array, preserve_keys = false)` :717, `array_intersect_key` :745, `array_intersect_assoc` :756, `min` / `max` :902 / :910, `array_key_first` / `array_key_last` :497 / :502, `array_merge` :511, `array_map` :388, `iterator_to_array` :322, `SORT_*` :37-48. `arrayRefFunctions.ts` (each takes a `Ref<unknown>` and writes a new array to `ref.value`): `array_shift` :68, `array_pop` :85, `array_unshift(ref, ...values)` :108, `array_splice(ref, offset, length = null, replacement = [])` :127 (returns the removed entries). `stringFunctions.ts`: `str_contains` :43, `strlen` :53 (UTF-8 bytes), `lcfirst` :62, `implode` :114. `objectFunctions.ts`: `property_exists` :94, `method_exists` :171. `identical.ts:63` `identical(a, b)` (PHP `===`). `is_numeric` / `is_float` (`index.ts`). `Randomizer.ts:26` (`new Randomizer()`, unseedable; only `pickArrayKeys(array, num)`, which throws `ValueError` for an empty array or `num` outside 1..count). `SortDirection.ts:10`. Results come back through `arrayFromEntries`, so their form follows their keys (a list, a plain object, or a `PhpArray`); `packages/runtime/docs/php-functions.md:14-24`.
- Not exported, and held by ESC-14.2-4 (`conformance/escalations/ESC-14.2-4.md`): `is_null`, `uasort`, `strcmp`, `strcasecmp`, `strnatcmp`, `strnatcasecmp`, `strcoll`. Source code writes `x === null` for `is_null`, as 14.1's `data_get` does (`packages/collections/src/helpers.ts:20`); test bodies keep the PHP name (PORTING.md § Mechanical expression rule), so the four test bodies that call it wait.
- `packages/runtime/src/php/Traversable.ts:14` -- `keys(): Iterable<unknown>`. Upstream `keys()` returns `new static(array_keys(...))` (Collection.php:793, LazyCollection.php:737). A collection is `Iterable` and its `[Symbol.iterator]` yields its values, so a collection of keys meets the Traversable contract: `for (const k of c.keys())` still gives the keys. Replace 14.1's generator `keys()` (Collection.ts:194, LazyCollection.ts:269) with the Upstream member; nothing else in the repo calls `.keys()` on a collection (`getIterator().keys()` is `ArrayIterator`'s / the runtime `Generator`'s).
- `packages/conditionable/src/Traits/Conditionable.ts:190-192` -- the `arguments.length` idiom for `func_num_args()`, with its comment.
- `packages/contracts/src/support/MessageBag.ts:28-29` -- the AD-26 options-form overload pair (a positional signature and `options?: { ... }`).
- `conformance/api-surface/exceptions.jsonl:1-54` -- DIV-12.20's exemptions (already on `main`).
- `conformance/upstream/framework/src/Illuminate/Collections/MultipleItemsFoundException.php` -- `__construct($count, $code = 0, $previous = null)`, message `"$count items were found."`, `getCount()`.

## Tasks & Acceptance

**Execution (ESC-14.2-1..3 are ruled and epic-14-item-5 has landed; ESC-14.2-4 holds 10 Test IDs):**
- `packages/collections/src/{Collection,LazyCollection,Enumerable,Arr,helpers}.ts`, `Traits/EnumeratesValues.ts`, `ItemNotFoundException.ts`, `MultipleItemsFoundException.ts`, `index.ts` -- port the Code Map members line for line over the runtime exports, except `sortBy` / `sortByMany` (held by ESC-14.2-4; not ported in this pass). Port in full the members they call: Collection `take` / `slice` / `skip`, LazyCollection `take` / `slice` / `skip` / `passthru`, EnumeratesValues `some` / `firstWhere` / `hasMany` / `value` / `where` / `operatorForWhere`, and helper `data_has`. Replace Arr.exists' 14.1 `has` note with the real call, and remove 14.1's notes that defer `has` to this Story (Enumerable.ts:8-10, `docs/collections.md:99`). Give `random` (Collection, LazyCollection) and `splice` (Collection) an AD-26 options-form overload beside the positional one (Design Notes).
- `packages/collections/tests/ported/.../SupportCollectionTest.test.ts` -- port the 161 Test IDs not held by ESC-14.2-4; testValueWithObjects#0/#1 keep Upstream's body in the existing `SupportCollectionBlockedBySupportTest` case (`literal()` is Support's helper, `src/Illuminate/Support/helpers.php:190`). Add the test-local fixtures StaffEnum, TestAccessorEloquentTestStub and TestArrayAccessImplementation, registered in `setUp` under `Illuminate\Tests\Support\<Name>`. Do not port the ten ESC-14.2-4 Test IDs.
- `packages/collections/tests/xaravel/collections.test.ts` -- XT-collections-4 (contains loose / strict through `looseEquals`) and XT-collections-5 (sole / firstOrFail exceptions, `fqcn()` of each is its Upstream FQCN, `getCount()`, message), citing FR-23's consequences.
- `packages/collections/docs/collections.md` -- document the new members, DIV-9.15 / DIV-12.20 where they apply, and `keys()` returning a collection.
- Expectations -- each ported ID `pass` with its clause; testValueWithObjects#0/#1 `skip` / `blocked-by:support`; the ESC-14.2-1 and ESC-14.2-2 lines' `escalation` back to `null`; the ten ESC-14.2-4 lines stay `skip` / `not-ported-yet` with `escalation: "ESC-14.2-4"`.
- Matrix -- each I/O & Edge-Case Matrix row is covered by a ported test or by XT-collections-4/5 (lazy strict `before`/`after` by testBeforeInStrictMode#1 / testAfterInStrictMode#1; nth step by testNthThrowsException*; random amount by testRandomThrows…; shift count by testShiftReturnsAndRemovesFirstXItemsInCollection).

**Acceptance Criteria:**
- Given `bun run harness --story 14.2`, when it runs, then no line differs, and the only `not-ported-yet` lines are the ten that name ESC-14.2-4.
- Given `bun run harness --xaravel --component collections`, when it runs, then XT-collections-1..5 pass.
- Given the Fidelity Review of this tree, when it runs, then two `pass` verdicts are recorded. `bun run story:check 14.2` passes in full only once ESC-14.2-4 is ruled and its ten Test IDs are ported; until then the Story halts `blocked` on ESC-14.2-4 (the epic 4 lesson: conditional on the ruling).

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
- **Not held by an Escalation at the first round** (22 Test IDs): testAdd, testPut, testPutWithNoKey, testPutAddsItemToCollection, testValues#0/#1, testValuesResetKey#0/#1, testForget* (3), testGetOrPut / WithNoKey, testKeys#0/#1, testPushWithOneItem, testSelectWith{Arrays,ArrayAccess,Objects}#0/#1. They are built in the same pass as the rest once the rulings land, so the Fidelity Review sees one tree and `Enumerable.ts` is written once.

**Second planning round (2026-10-26, after the rulings).** ESC-14.2-1..3 were ruled option 1 (`decisions/MAINT-2026-10-26-story-14-2.md`, `decisions/ESC-14.2-{1,2,3}.md`), and epic-14-item-5 landed in b5938e16. Planning checked every bare function call in the Upstream bodies of the Story's Test IDs, and in the members they reach, against the runtime's exports. One question remains, raised as ESC-14.2-4 (contract, under the runtime-builtins standing rule). It holds ten Test IDs: testContains, testContainsStrict, testDoesntContain and testSome (#0/#1), whose bodies call `is_null`, and testValueRetrieverAcceptsDotNotation#0/#1, which reaches `sortBy`, whose `sortByMany` branch calls `uasort` and the `strcmp` family. The other 161 are built now. The Story then halts `blocked` on ESC-14.2-4, as 14.1 did on ESC-14.1-11.

- **DIV-9.15** (testPushWithMultipleItems, testUnshiftWithMultipleItems). `...[11 => 'Jonny', 12 => 'from', 13 => 'Laroe']` becomes `...array_values(new PhpArray([[11, 'Jonny'], [12, 'from'], [13, 'Laroe']]))`, marked `// adapted:DIV-9.15`; the Expectations line carries `DIV-9.15`. `...collect([...])` spreads its values through `[Symbol.iterator]`, and `...[]` stays as is; neither needs a marker.
- **DIV-12.20.** `contains`, `doesntContain`, `doesntContainStrict`, `some`, `where`, `firstWhere`, `hasSole`, `hasMany`, `sole`, `firstOrFail`, `first` and `last` have only the positional form. A lone object argument is the PHP value, never an options object. `arguments.length` stands in for `func_num_args()`, inside `function` methods only, with the Conditionable comment. `func_get_args()` is `[...arguments]`.
- **AD-26 options form** for `random(number = null, preserveKeys = false)` (Collection, LazyCollection) and `splice(offset, length = null, replacement = [])` (Collection). Each has two optional parameters, is outside DIV-12.20, and has no exemption. Declare the positional overload and an options overload: `random(options?: { number?: unknown; preserveKeys?: boolean })` and `splice(offset: number, options?: { length?: number | null; replacement?: unknown })`. The implementation reads the options object only when it is the last argument given, and it is a plain object (prototype `Object.prototype` or `null`), in the first optional position: `random`'s `number` or `splice`'s `length`. PHP takes neither as an array, so the reading is unambiguous. Enumerable.php:880 declares `random($number = null)` with one optional parameter, so `Enumerable.ts` gets only the positional form. Story 14.8's `api-surface:gate` checks this.
- **`===` on values that may be arrays** becomes `identical(a, b)` (PORTING.md's idiom row). That covers LazyCollection's strict `search`, `before` and `after`, which testBeforeInStrictMode#1 and testAfterInStrictMode#1 reach with `[]` against `[]`, and every other strict comparison in a ported member whose operand is an item.
- **`keys()`** becomes Upstream's member on both classes. It returns `new this.constructor(array_keys(...))` (Collection) and the LazyCollection generator form (LazyCollection.php:737), and replaces 14.1's generator (see Code Map). Any `entries()` / `[Symbol.iterator]` code that read `this.keys()` internally reads `this.getIterator().keys()` instead.
- **By reference.** `Arr.forget(array: Ref<unknown>, keys)` and `Arr.pull(array: Ref<unknown>, key, default)` take a `Ref` (DIV-9.2, PORTING.md § By-reference parameters). PHP's `$array = &$array[$part]` walk becomes a walk that writes each nested array back into its parent. An object segment (an `ArrayAccess` such as a nested `Collection`) is a handle, so `unset` on it calls `offsetUnset` (testPullRemovesItemFromNestedCollection: expected `[['value', ['bar' => 'baz']], 'bar']`). Collection's `pop`, `shift`, `unshift`, `splice`, `forget`, `pull` and `prepend` wrap `this.items` in a `Ref` and store `ref.value` back. They keep `this.items` a `PhpArray`, as the 14.1 constructor does: `new PhpArray(arrayEntries(ref.value))` when the function returned another form.
- **`prepend`.** `Arr.prepend(array, value, key = null)` branches on `arguments.length === 2` (Arr.php:932). `Collection.prepend` forwards `...(arguments.length > 1 ? [...arguments] : [value])` (Collection.php:1066). testPrepend expects `new PhpArray([[null, 0], ['one', 1], ['two', 2]])` (`null` normalises to `''`) from both `prepend(0, null)` and `prepend(0, '')`. `#[IgnoreDeprecations]` has no port effect, because the runtime raises no deprecation.
- **Exceptions.** `ItemNotFoundException extends RuntimeException`, with no members. `MultipleItemsFoundException extends RuntimeException`: its constructor is `(count, code = 0, previous = null)` and calls `super(`${count} items were found.`, code, previous)`, it has a public `count` property and `getCount()`, and it is registered under `Illuminate\Support\MultipleItemsFoundException` (and `Illuminate\Support\ItemNotFoundException`). `expectExceptionObject(new MultipleItemsFoundException(2))` compares class, message and code.
- **testRandom***. These are unseeded. The assertions are `assertIsInt`, `assertContains`, `assertCount`, `assertInstanceOf(collection, …)` and `assertCount(2, array_intersect_assoc(random.all(), data.all()))`, with `array_intersect_assoc`, `min` and `count` from the runtime. String amounts (`'0'`, `'1'`, `'2'`) reach `Arr.random`, which compares and casts them as PHP does (`toInt` where Upstream casts). The over-size message is Upstream's: `You requested 4 items, but there are only 3 items available.`
- **testShiftReturnsAndRemovesFirstXItemsInCollection** calls `expectException('InvalidArgumentException')` (a string) before `shift(-1)`. Port the string as `InvalidArgumentException` (the class: PORTING.md's `X::class` / class-name rule) only if `@xaravel/assert`'s `expectException` refuses a string. Keep the body after the first throw as Upstream wrote it, even though it never runs.
- **Test fixtures.** `StaffEnum` is a pure AD-26 enum (`Taylor`, `Joe`, `James`, `cases()`), modelled on `Fixtures/Enums.ts` TestEnum. testValueUsingEnum's `assertSame(StaffEnum.Taylor, …)` is an identity check. `TestAccessorEloquentTestStub` (SCT:6550) keeps `attributes` and Upstream's `__get` / `__isset`, which build `'get' + lcfirst(attr) + 'Attribute'` and call `method_exists` from the runtime. `TestArrayAccessImplementation` (SCT:6586) has the four `offset*` methods over a private array, where `offsetExists` is PHP `isset`.
- **Clause per Expectations line.** The `adapted` field holds one `DIV-<n>.<k>` string. When a test's lines carry one clause, the line records that clause. When they carry several, it records the clause that is not a plain read rewrite, as 14.1 did for testOffsetAccess (DIV-12.17 over DIV-12.6). A line with no adapted line carries `adapted: null`.

## Verification

**Commands:**
- `bun run escalations:check`, `bun run expectations:check` -- expected: OK.
- `bun run harness --story 14.2`, `bun run harness --xaravel --component collections`, `bun run typecheck`, `bun run lint`, `bun run divergence:check` -- expected: no difference, no error.
- `bun run story:check 14.2` -- expected: every clause passes.

## Auto Run Result

Status: blocked
Blocking condition: ESC-14.2-1 (runtime builtins, contract; qualifies for the monitor under `decisions/MAINT-2026-10-26-runtime-builtins.md`) holds 145 Test IDs and XT-collections-4/5, including the shared `Arr::first` / `contains` / `operatorForWhere` paths. ESC-14.2-2 (keyed-array spread, divergence) and ESC-14.2-3 (options-form overloads, divergence) wait on the Maintainer. No package code was written. The 147 escalated Expectations lines name their Escalation; `escalations:check` and `expectations:check` pass.
