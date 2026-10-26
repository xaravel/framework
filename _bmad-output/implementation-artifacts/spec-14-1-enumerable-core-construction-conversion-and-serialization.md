---
title: 'Story 14.1: Enumerable core: construction, conversion and serialization'
type: 'feature'
created: '2026-10-25'
status: 'blocked'
baseline_revision: '1b1bff5a3664c100d85e5115b40e1acdd1676261'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/PORTING.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-14-context.md'
  - '{project-root}/decisions/DIV-9.md'
  - '{project-root}/decisions/DIV-12.md'
  - '{project-root}/packages/runtime/docs/php-values.md'
  - '{project-root}/conformance/review/fidelity.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `@xaravel/collections` is an empty `export {}`, so the 112 Test IDs of Story 14.1 are `not-ported-yet`. Collection and LazyCollection are the base that every other Collections Story and most later Components build on.

**Approach:** Port `Collection`, `LazyCollection`, the `Enumerable` interface, `Traits/EnumeratesValues`, `HigherOrderCollectionProxy`, the `collect()` helper and the `Arr` members the core calls (`from`, `wrap`, `map`, `where`), line for line over `@xaravel/runtime`'s PHP value model. Port the Story's tests with the `collectionClassProvider` dataset (`#0` Collection, `#1` LazyCollection). Planning found four gaps that the Story cannot close within `packages/collections/**`, raised as ESC-14.1-1..4. Because ESC-14.1-1 decides how every method reads and builds a PHP array, the build waits for the rulings.

## Boundaries & Constraints

**Always:**
- Edit only `packages/collections/**`, the Story's lines in `conformance/expectations/collections/framework/tests/Support/SupportCollectionTest.jsonl`, `conformance/oracle-requests/14.1.jsonl` and `conformance/escalations/ESC-14.1-<n>.md`. The only other changes are orchestrator bookkeeping: this spec, sprint status and the `stories/14.1.md` status.
- Files sit at the Upstream path under `src/` (`Collection.ts`, `LazyCollection.ts`, `Enumerable.ts`, `Arr.ts`, `HigherOrderCollectionProxy.ts`, `Traits/EnumeratesValues.ts`, `helpers.ts`), with one public class per file and named exports. Each file ends with `registerClass('Illuminate\\Support\\<Class>', X)`.
- Use the runtime for every PHP semantic: `PhpArray` for storage, `jsonEncode` / `jsonDecode` / `jsonLastError` for JSON, `looseEquals`, `valueCopy`, `enumExists(fqcn(x))` for the `UnitEnum` check, and `Macroable` / `Conditionable` through `mixin`. Never use `JSON.stringify`, never return `undefined`, and never hand back the internal array by reference.
- Ported Tests use `portedTest(...)` with `dataset: [[Collection], [LazyCollection]]` and `@xaravel/assert`. Each changed line carries `// adapted:DIV-<n>.<k>` and its Expectations line carries the same clause.

**Never:**
- Never edit `packages/runtime`, `packages/contracts`, `packages/assert`, `packages/support` or any other package (F-8). Never add a stand-in for VarDumper, the SPL iterator classes, `WeakMap` or `Throwable`.
- Never use a JS `Proxy` (AD-7), and never port an escalated Test ID before its ruling.
- Never copy the runtime's internal PHP-array helpers into the package unless ESC-14.1-1 is ruled for option 2.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Construct | `null`, nothing, a scalar, an enum case | `[]`, `[]`, `[scalar]`, `[case]` (`Arr::wrap`) | — |
| Construct | a list, a plain object, a `PhpArray`, an `Enumerable`, an `Arrayable`, a `Jsonable`, a public-property object | the PHP array `Arr::from` gives, keys normalised and in order | a value none of these covers: `InvalidArgumentException('Items cannot be represented by a scalar value.')` |
| Offsets | `['foo','bar',null]` | `offsetExists(2)` false (`isset`), `offsetSet(null, v)` appends | — |
| JSON | `toPrettyJson()` | `jsonEncode(jsonSerialize(), JSON_PRETTY_PRINT \| flags)` | — |
| ensure | a wrong item at position 3 | — | `UnexpectedValueException("Collection should only include [int] items, but 'string' found at position 3.")` |
| Lazy source | a bare generator object | — | `InvalidArgumentException('Generators should not be passed directly to LazyCollection. Instead, pass a generator function.')` |
| Lazy range | step 0 | — | `InvalidArgumentException('Step value cannot be zero.')` |
| `lazy()` | a later `add()` on the source | the LazyCollection keeps the old items (value copy) | — |

</intent-contract>

## Code Map

- `conformance/upstream/framework/tests/Support/SupportCollectionTest.php` -- the Upstream tests. `collectionClassProvider` (:6495) gives the class; in PHP it is a class-name string, which matters for testEnsureForObjects' expected `gettype($collection)` (`string`). The fixtures are in `Fixtures/Common.php` (Arrayable, Jsonable, JsonSerializable and Traversable objects) and `Fixtures/Enums.php`, plus the test-local `TestJsonSerializeToStringObject` (:6616) and `TestCollectionSubclass` (:6634).
- `conformance/upstream/framework/src/Illuminate/Collections/` -- `Traits/EnumeratesValues.php`: make, wrap, unwrap, empty, times (:174, through `range()->unless()->map()`), fromJson (:193), dump (:261), each, ensure (:387), toArray (:1009), jsonSerialize (:1019), toJson, toPrettyJson, getCachingIterator (:1059), `__toString`, proxy, `__get` (:1108), getArrayableItems (:1123). `Collection.php`: `__construct` (:43), all, lazy (:87), filter, map, unique, values, getIterator (:1927), count, countBy (:1946, through `lazy()`), add, offset* (:1982-2025). `LazyCollection.php`: `__construct` (:48), make, range (:98), all (:122), countBy (:336), isEmpty, getIterator, count, makeIterator (:1891). `Arr.php`: from (:474), map (:863), where (:1267), wrap (:1336).
- `packages/runtime/src/php/PhpArray.ts` -- `PhpArray` (exported) with insertion order, `push` and normalised keys; `arrayFromEntries` (:209) and `normalizeKey` (:64) are exported since epic-14-item-1 (#456, ESC-14.1-1), with `arrayEntries` (`casts.ts:26`), `gettype` and `getDebugType` (`phpType.ts`). `objectProps` (the `(array)` reader, `mangle.ts:148`), `arrayCount` and `phpTypeName` stay internal.
- `packages/runtime/src/php/{Traversable,Iterator,IteratorAggregate,JsonSerializable,Stringable,Throwable}.ts` -- `phpInterface` tokens (#456, ESC-14.1-2): `x instanceof T` reads `x[T.brand] === true`, so a class declares a getter per token in its chain (`IteratorAggregate` and `Traversable`). `Countable` and `ArrayAccess` are raw `Symbol.for(...)` brands the grader reads (`packages/assert/src/comparison/PhpValues.ts:193-211`). `ArrayIterator`, `ArrayObject`, `CachingIterator` (needs an Iterator-branded argument) and `WeakMap` are specified in `packages/runtime/docs/php-builtins.md`. The runtime exports no PHP `Generator` class and no keyed-yield form; its `foreach` generators (`liveCursor.ts`) are internal.
- `packages/runtime/src/php/jsonEncode.ts:102` -- reads `Symbol.for('JsonSerializable')` on nested values and `Jsonable` / `Arrayable` brands only at the top level, so `jsonSerialize()` must do the per-item conversion itself, as Upstream does.
- `packages/macroable/src/Traits/Macroable.ts` and `packages/conditionable/src/HigherOrderWhenProxy.ts` -- `mixin(null, Macroable, Conditionable)`; the `times` path needs the `unless` proxy's generated `map` member (DIV-12.12).
- `packages/contracts/src/support` -- `Arrayable`, `Jsonable`, `CanBeEscapedWhenCastToString` tokens (implement with a `[Token.brand]` getter); the structural `Collection` type (`packages/contracts/src/structural/Collection.ts`) that the port must satisfy.
- `packages/reflection/tests/ported/framework/tests/Support/SupportReflectorTest.test.ts:97-123` -- the `blocked-by:collections` line (testGetClassAttributes) that this Epic re-verifies under the global rule. It is outside this Story's edit scope.
- `conformance/xaravel-consequences/collections.jsonl` -- FR-23.1-3 (key order, key normalisation, list or associative shape), the consequences XT-collections-1..3 cite.

## Tasks & Acceptance

**Execution (after the rulings on ESC-14.1-1..4):**
- `packages/collections/src/Enumerable.ts`, `Traits/EnumeratesValues.ts`, `Collection.ts`, `LazyCollection.ts`, `HigherOrderCollectionProxy.ts`, `Arr.ts` (the four members above), `helpers.ts` (`collect`), `index.ts` -- port line for line, in the form ESC-14.1-1 decides for PHP arrays and ESC-14.1-2 for the SPL types.
- `packages/collections/tests/ported/framework/tests/Support/SupportCollectionTest.test.ts` and `Fixtures/{Common,Enums}.ts` -- port the 112 Test IDs. testDump keeps Upstream's body in a case whose `setUp` throws `BlockedByComponentError('support')` (VarDumper is `@xaravel/support`'s, Epic 19).
- `packages/collections/tests/xaravel/collections.test.ts` -- XT-collections-1 (integer-like and mixed keys keep order and normalise; `toArray()` / `toJson()` give the Oracle's list or object shape), XT-collections-2 (the ArrayAccess forms), XT-collections-3 (`LazyCollection.make()` from an array, an `Arrayable`, a generator function and a plain function; a bare generator object is rejected).
- `packages/collections/docs/collections.md`, `README.md` -- the API with a Divergences section citing DIV-12.6 and the clauses the rulings add.
- Expectations -- each Test ID `pass` with its clause, testDump `skip` / `blocked-by:support`; `escalation: null` once ruled.

**Acceptance Criteria:**
- Given `bun run harness --story 14.1`, when it runs, then no line differs and no line is `not-ported-yet`.
- Given `bun run story:check 14.1`, when it runs, then every clause passes, two Fidelity `pass` verdicts included.

## Spec Change Log

## Review Triage Log

## Design Notes

Planning traced every Test ID through the Upstream source before building (the Epic 11 and 13 lessons), and raised every gap it found in this one round:

- **ESC-14.1-1 (contract, 84 Test IDs and XT-collections-1..3).** The runtime's PHP-array plumbing (`arrayEntries`, `arrayFromEntries`, `normalizeKey`) and `get_debug_type` are internal. Every Collection method reads or builds a PHP array, so the build waits on this ruling.
- **ESC-14.1-2 (contract, 21 Test IDs).** `Traversable`, `IteratorAggregate`, `ArrayIterator`, `ArrayObject`, `CachingIterator`, `JsonSerializable`, `Stringable`, `Throwable` and an iterable `WeakMap` do not exist in the runtime. PORTING.md:136 says two of them come from it.
- **ESC-14.1-3 (divergence, testCanAddMethodsToProxy).** `$c->adults->age` needs `__get` on the collection and on the proxy, which no DIV clause covers. The same answer decides Story 14.5's higher-order tests.
- **ESC-14.1-4 (divergence, 3 Test IDs and XT-collections-2).** DIV-12.6 covers index reads only. Assigning, appending, `isset` and `unset` through index syntax have no clause.
- **testDump** is `blocked-by:support`. `tools/expectations/reasons.ts` accepts it, because support is in a later Phase, so it needs no Escalation.

**Second planning round (2026-10-25, after the Maintainer's rulings).** The Story resumed once ESC-14.1-1..4 were ruled option 1 (`decisions/MAINT-2026-10-25-story-14-1.md`) and epic-14-item-1 landed (#456). Planning traced every Test ID again through the runtime as it now stands. Four questions remain that neither the rulings, DIV-1..12, PORTING.md nor the spine settle. Each is raised in this one round, as the Epic 11 and 13 lessons ask:

- **ESC-14.1-5 (divergence and contract): keyed generators.** LazyCollection is built on `yield $k => $v`, `yield from`, `iterator_to_array` and `Generator::valid()` (LazyCollection.php:48-122, :336, :692, :1891-1910). The runtime has no PHP `Generator` and no keyed-yield form. How a source generator function gives keys is public API: Story 14.7's tests pass `function () { yield 'a' => 1; }` (SupportLazyCollectionTest.php:64). It stops every `#1` Test ID and XT-collections-3.
- **ESC-14.1-6 (contract): PHP built-in functions and the `(array)` cast.** The core needs `range`, `array_unique` (SORT_REGULAR), `in_array` (loose), `iterator_to_array`, `iterator_count`, `array_filter`, `array_combine`, `str_starts_with`, `substr`, `is_scalar` and PHP's `(array)` of an object. None is exported by `@xaravel/runtime/php`, and PORTING.md:50 and AD-19 say nothing else re-implements PHP semantics.
- **ESC-14.1-7 (divergence): testEnsureForObjects.** Upstream puts the dataset's class-name string into the items and expects `gettype($collection)` (`'string'`). PORTING.md:76 makes the row a constructor, so the port gives `'object'`. No clause covers using a class-name dataset value as a value. The test also calls `class_basename`, a support helper (Phase 2).
- **ESC-14.1-8 (divergence): the DIV-12.17 scope and one `adapted` clause per line.** testConstructMethodFromWeakMap writes `$map[$object] = 3` on the runtime's `WeakMap`, and DIV-12.17 names only Collection. testOffsetAccess and testBehavesLikeAnArrayWithArrayAccess need DIV-12.6 and DIV-12.17 in one test, but an Expectations line carries one `adapted` clause.

**Third planning round (2026-10-26, after the second rulings).** ESC-14.1-5..8 were ruled option 1 (`decisions/MAINT-2026-10-25-story-14-1-second.md`) and epic-14-item-2 landed (#459). A reach analysis of every Upstream method the 112 Test IDs call, and of the test bodies and fixtures, was checked name by name against `packages/runtime/src/php/index.ts` and `packages/runtime/src/index.ts`. Two questions remain, raised together:

- **ESC-14.1-9 (contract): PHP type tests and functions still missing.** Every constructor tests `instanceof UnitEnum` (EnumeratesValues.php:1125); `isEnumCase` / `isEnumClass` are internal and `enumExists(fqcn(x))` throws for an unregistered object. LazyCollection needs `instanceof Closure`, `instanceof Generator` on a bare JS generator (`isJsGenerator` is internal) and `is_callable`; `ensure` needs `instanceof` by name, `sprintf` and `implode`; `jsonSerialize`, `Arr::map`, `values`, `count` and LazyCollection `range` need `array_map`, `array_keys`, `array_values`, `count` and `abs`; `Arr::wrap` / `Arr::from` need `is_array` and `is_object`; `data_get` (reached by testMacroable #1) needs `explode`, `is_iterable`, `array_key_first`, `array_key_last`, `array_key_exists` and `array_merge`. `get_debug_type` is exported only as `getDebugType`. It stops the build (104 Test IDs and XT-collections-1..3).
- **ESC-14.1-10 (contract): `ReflectionMethod::invokeArgs`.** testGetArrayableItems #0/#1 call the protected `getArrayableItems` through it; the runtime's `ReflectionMethod` has no `invoke` / `invokeArgs`.

The Code Map's runtime paragraph above predates #456 and #459; the next planning round rewrites it against the runtime as it then stands (Generator.ts, keyed.ts, arrayFunctions.ts, range.ts, stringFunctions.ts and `docs/php-functions.md` now exist).

Settled without an Escalation:

- `proxy()`'s static `$proxies` is a `frameStatic` (spine AD-5, "every Upstream static setter").
- 14.1 ports `filter`, `map`, `unique`, `values` and `countBy` because its tests reach them. Their own tests stay with 14.3 and 14.5.
- `__toString`'s escape branch (`e()`), `dump` / `dd` and `TransformsToResourceCollection` are not reached by any 14.1 Test ID. They belong to the Stories that port their tests.

## Verification

**Commands:**
- `bun run escalations:check` -- expected: OK.
- `bun run expectations:check` -- expected: OK.
- After the rulings: `bun run harness --story 14.1`, `bun run typecheck`, `bun run lint`, `bun run story:check 14.1`.

## Auto Run Result

Status: blocked
Blocking condition: ESC-14.1-1..4 wait on the Maintainer. ESC-14.1-1 (the runtime's PHP-array helpers are internal) stops the whole build. ESC-14.1-2 (the SPL and core PHP types are missing), ESC-14.1-3 (higher-order `__get`) and ESC-14.1-4 (ArrayAccess writes, `isset` and `unset`) each stop their own Test IDs. No package code was written. The 110 escalated Expectations lines name their Escalation.

### Second run (2026-10-25)

Status: blocked
Blocking condition: intent gap. The Story resumed after the Maintainer ruled ESC-14.1-1..4 option 1 and epic-14-item-1 landed (#456). Re-planning traced every Test ID through the runtime as it now stands and raised the four questions that remain, all in this round (Design Notes, "Second planning round"):
- ESC-14.1-5 (divergence): how a generator gives keys (`yield $k => $v`) and PHP's `Generator`. It stops 14 Test IDs and XT-collections-3, and decides Story 14.7's API.
- ESC-14.1-6 (contract): the PHP functions (`is_scalar`, `iterator_to_array`, `array_combine`, `array_filter`, `array_unique`, `in_array`, `range`, `substr`, `str_starts_with`) and the `(array)` cast that the runtime does not export. Every constructor needs `is_scalar`, so it stops the build.
- ESC-14.1-7 (divergence): testEnsureForObjects uses the dataset's class-name string as an item. It also needs support's `class_basename`.
- ESC-14.1-8 (divergence): DIV-12.17's scope (the `WeakMap` write), and one `adapted` clause per Expectations line where a test needs DIV-12.6 and DIV-12.17.

No package code was written. The Story's Expectations lines now name the open Escalation that holds each one: 14 name ESC-14.1-5, 86 ESC-14.1-6, 2 ESC-14.1-7 and 4 ESC-14.1-8. The four `unwrap` rows with an array or a scalar, and testDump (`blocked-by:support`), name none. `bun run escalations:check` and `bun run expectations:check` pass.

### Third run (2026-10-26)

Status: blocked
Blocking condition: intent gap. The Story resumed after the Maintainer ruled ESC-14.1-5..8 option 1 and epic-14-item-2 landed (#459). Re-planning traced every Test ID through Upstream and checked each PHP built-in against the runtime's exports. Two contract questions remain, raised together (Design Notes, "Third planning round"):
- ESC-14.1-9: PHP type tests (`UnitEnum`, `BackedEnum`, `Closure`, `Generator` on a JS generator, `is_callable`, `is_a` by name, `is_array`, `is_object`, `is_string`, `is_iterable`) and functions (`sprintf`, `implode`, `explode`, `array_map`, `array_keys`, `array_values`, `array_key_exists`, `array_key_first`, `array_key_last`, `array_merge`, `count`, `abs`, the `get_debug_type` name) that the runtime does not export. Every constructor needs the `UnitEnum` test, so it stops the build.
- ESC-14.1-10: `ReflectionMethod::invokeArgs` for testGetArrayableItems #0/#1.

No package code was written. The Expectations lines that named ESC-14.1-5..8 now name ESC-14.1-9 (104) or ESC-14.1-10 (2). `bun run escalations:check` and `bun run expectations:check` pass.
