---
title: 'Story 14.1: Enumerable core: construction, conversion and serialization'
type: 'feature'
created: '2026-10-25'
status: 'blocked'
baseline_revision: 'fcb916103720cc0e9486ca66fc79a73d9552648d'
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
- `packages/runtime/src/php/PhpArray.ts` -- `PhpArray` (exported) with insertion order, `push` and normalised keys; `arrayFromEntries` (:209) and `normalizeKey` (:64) are internal (ESC-14.1-1). `packages/runtime/src/php/casts.ts:26` `arrayEntries` and `phpType.ts` `phpTypeName` are internal as well.
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

## Verification

**Commands:**
- `bun run escalations:check` -- expected: OK.
- `bun run expectations:check` -- expected: OK.
- After the rulings: `bun run harness --story 14.1`, `bun run typecheck`, `bun run lint`, `bun run story:check 14.1`.

## Auto Run Result

Status: blocked
Blocking condition: ESC-14.1-1..4 wait on the Maintainer. ESC-14.1-1 (the runtime's PHP-array helpers are internal) stops the whole build. ESC-14.1-2 (the SPL and core PHP types are missing), ESC-14.1-3 (higher-order `__get`) and ESC-14.1-4 (ArrayAccess writes, `isset` and `unset`) each stop their own Test IDs. No package code was written. The 110 escalated Expectations lines name their Escalation.
