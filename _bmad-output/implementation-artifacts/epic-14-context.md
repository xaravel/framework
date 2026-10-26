# Epic 14 Context: Collections

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Port Laravel's `illuminate/collections` component as `@xaravel/collections`: `Collection`, `LazyCollection`, the `Enumerable` contract, the `EnumeratesValues` trait, `HigherOrderCollectionProxy`, `Arr`, `ItemNotFoundException` / `MultipleItemsFoundException`, and the `collect()` and related helpers. App Developers get every Laravel 13 method, with PHP array semantics: key order, integer-like key normalisation, and list-or-object JSON shape. This is the largest Phase 1 Epic, with about 657 methods. Nearly every later Component builds on it, and it must install and work standalone.

## Stories

- Story 14.1: Enumerable core: construction, conversion and serialization
- Story 14.2: Retrieval, search and mutation methods
- Story 14.3: Filtering, slicing and conditional methods
- Story 14.4: Set operations and combining
- Story 14.5: Mapping, grouping, sorting, chunking and aggregates
- Story 14.6: `Arr` helpers
- Story 14.7: LazyCollection behaviour
- Story 14.8: LazyCollection laziness guarantees

## Requirements & Constraints

- **Test scope.** The scope is `SupportCollectionTest` (SCT), `SupportLazyCollectionTest`, `SupportLazyCollectionIsLazyTest` and `SupportArrTest`. Each Test ID passes, or carries a valid Skip Reason other than `not-ported-yet`.
  - SCT is split across Stories 14.1–14.5 by method-name selectors, applied in Story order. An SCT ID that no selector matches belongs to 14.5.
  - Each Story's exact `test_ids` are in `stories/14.<n>.md`.
  - Most SCT cases run twice through a data provider (`#0` Collection, `#1` LazyCollection). Every Story implements its methods on both classes.
- **PHP array semantics.**
  - Key order is always preserved, including integer-like keys.
  - Integer-like string keys normalise as in PHP.
  - `filter()` keeps the original keys and `values()` re-indexes.
  - `merge` renumbers integer keys and lets string keys overwrite (`array_merge`). `union` keeps the left-hand keys (`+`).
  - `toArray()` and the JSON shape match the Oracle.
  - `contains` uses PHP loose comparison and `containsStrict` uses strict comparison.
  - Sorting matches PHP, including stability and the `SORT_NUMERIC` / `SORT_NATURAL` flags, checked against Oracle fixtures.
- **Async.** Collections are sync.
  - Sync APIs (`map`, `each`, `filter`, `reduce`, `sortBy`, …) type their callbacks with `NotPromise` overloads, and lint rejects async callbacks.
  - The async companions are `eachAsync`, `mapAsync`, `filterAsync`, `rejectAsync`, `firstAsync`, `everyAsync`, `containsAsync` and `partitionAsync`. They await callbacks sequentially, in key order.
  - The companions are listed in `async-surface.json` with `@asyncRoot callback` tags.
- **LazyCollection.**
  - `make()` accepts an array, an `Arrayable`, a generator function or a non-generator function. It rejects a bare generator object.
  - `remember()` enumerates its source once, even across concurrent enumerations.
  - `*IsLazy` methods do not enumerate the source until the result is consumed, and `*EnumeratesOnce` methods enumerate it exactly once.
  - `takeUntilTimeout`, `throttle` and `withHeartbeat` use the frame-scoped test clock (NFR-7). Their tests stay `blocked-by:support` until Epic 19.
- **`Arr`.**
  - `get`, `set`, `has` and `forget` use dot notation over `PhpArray`s, plain objects and lists.
  - `Arr` never mutates caller data (value copy).
  - `testMapByReference` is adapted to `Ref<T>` (`adapted:DIV-9.<k>`).
- **Known classifications.** These tests are expected to be `blocked-by`; never stub the blocking Component:
  - `testImplodeModels`: `blocked-by:database`, re-verified in Epic 36;
  - `testPluckWithCarbonKeys`: `blocked-by:support`, re-verified in Epic 19;
  - the clock-dependent LazyCollection tests: `blocked-by:support`.

  A `blocked-by:<c>` line is valid only if the harness actually fails with `BlockedByComponentError(<c>)`.
- **Epic close.**
  - No Test ID in the four files remains `not-ported-yet`.
  - `bun run api-surface:gate collections` passes.
  - `async-surface.json` lists the companions.
  - The docs page has a Divergences section that cites DIV-1 (the async companions) and DIV-12 (index access).
  - Every public API has a docblock, and `LICENSE` keeps Laravel's MIT notice.
  - `@xaravel/collections` installs and works standalone.
- **Xaravel Tests.** The XT coverage row for `collections` is FR-23 with AD-2 and AD-6. XT tests cite FR-23's consequences: key order, key normalisation, and list-or-associative shape.

## Technical Decisions

- **Layout.**
  - `packages/collections/src` follows the Upstream `src/Illuminate/Collections/` paths: `Collection.ts`, `LazyCollection.ts`, `Enumerable.ts`, `Arr.ts`, `Traits/EnumeratesValues.ts`, and so on.
  - One public class per file, named exports only.
  - Every class file ends with `registerClass('Illuminate\\Support\\<Class>', X)`.
  - Identity uses `fqcn()`, never `constructor.name`.
- **Dependencies.**
  - The package depends on `@xaravel/runtime`, `@xaravel/contracts`, `@xaravel/macroable` and `@xaravel/conditionable`.
  - `@xaravel/http` is an optional peer, for `TransformsToResourceCollection`.
  - The package is currently an empty `export {}`.
- **PHP value model.**
  - A PHP list is a JS `Array`. A map whose keys are all non-integer-like strings is a plain object. Any other array is a `PhpArray` from `@xaravel/runtime`.
  - Public APIs accept all three forms. They never mutate caller data and never return internal arrays by reference.
  - `null` is the only absent value; never return `undefined`.
  - Integers and floats are both `number`; the runtime's float marker carries the distinction where it matters.
  - Loose comparison, numeric strings and key normalisation come from the runtime helpers. Do not re-implement them.
- **Encoding.**
  - Use `jsonEncode` from `@xaravel/runtime/php`, never `JSON.stringify`.
  - `toJson`, `toPrettyJson` and `__toString` go through it, with the `JsonSerializable`, `Arrayable` and `Jsonable` hooks.
- **PHP constructs.**
  - `ArrayAccess` becomes `offsetGet`, `offsetSet`, `offsetExists`, `offsetUnset` and `get()`. `$collection[0]` in a test becomes `collection.get(0)`, marked `adapted:DIV-12.6`.
  - `IteratorAggregate` becomes `[Symbol.iterator]`, and `Countable` becomes `count()`.
  - `__toString` becomes `toString()` plus `[Symbol.toPrimitive]`.
  - Traits use `mixin(Base, ...)`. `Macroable` and `Conditionable` come from their packages.
  - The higher-order proxy has no `Proxy`: its delegating members follow DIV-12.12.
  - A method with more than one optional parameter also accepts an options object.
  - Enums used by `mapInto` and the enum tests are classes with static instances, `cases()`, `from()` and `tryFrom()`, plus `static backingType` (AD-26).
- **Tests.**
  - Ported Tests use only `portedTest(...)` and `@xaravel/assert`, never `expect`.
  - Every changed assertion is marked `// adapted:DIV-<n>.<k>`, citing an existing clause.
  - If a new or changed divergence seems needed, raise an Escalation. Never decide it locally.
  - A Story edits only `packages/collections/**`, its own Expectations lines, `conformance/oracle-requests/<story-id>.jsonl` and its own Escalations.

## Cross-Story Dependencies

- **Story order.**
  - Story 14.1 builds the base (construction, `PhpArray` key handling, conversion, `ArrayAccess`, `Macroable`) that every other Story extends, so it goes first.
  - Stories 14.7 and 14.8 depend on the LazyCollection method set built in 14.1–14.5.
  - The Epic-close gate sits in 14.8.
- **Upstream Epics, used as they are.** Runtime (Epic 9), Contracts (Epic 10), Macroable (Epic 11) and Conditionable (Epic 12). A gap in one of them is a `contract` Escalation, not an edit.
- **Re-verification owed by this Epic.** `SupportReflectorTest::testGetClassAttributes` is `blocked-by:collections` in reflection's Expectations. Under the standing rule, the Epic that delivers a blocking Component re-verifies its lines, so this Epic must clear that one.
- **Later Epics.**
  - Support (Epic 19, the clock and Carbon) and Database (Epic 36) clear this Epic's own `blocked-by` lines.
  - Eloquent's `cursor()` / `lazy()` return an `AsyncLazyCollection` with LazyCollection's method names (DIV-1.3), so keep the method set reusable.
