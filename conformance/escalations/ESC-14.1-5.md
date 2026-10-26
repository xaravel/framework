---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCanAddMethodsToProxy#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCollectionFromBackedEnum#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCollectionFromEnum#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCollectionFromTraversable#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCollectionFromTraversableWithKeys#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCountableByWithCallback#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCountableByWithCallback#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testFromJson#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testFromJsonWithDepth#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testFromJsonWithFlags#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testMacroable#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testRangeMethod#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testTimesMethod#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testToArrayCallsToArrayOnEachItemInCollection#1"
  - "XT-collections-3"
trigger: divergence
proposed: >-
  Option 1 (recommended): a new DIV-12 clause and a runtime item. A generator
  that yields only values (`yield $v`) is written `yield v`, and PHP's
  automatic integer keys apply. A keyed yield, `yield $k => $v`, is written
  `yield keyed(k, v)`, where `keyed` is a frozen pair marker that
  `@xaravel/runtime/php` exports. `yield from $iterable` keeps its keys as
  `yield* yieldFrom(iterable)`. The runtime also adds PHP's `Generator`
  (`current`, `key`, `next`, `valid`, `send`, `rewind` once and
  `getReturn`), wrapping a JS generator object. It is Iterator- and
  Traversable-branded: `[Symbol.iterator]` yields values and `entries()`
  yields pairs, per the 2026-10-25 amendment. `iterator_to_array` (with
  `preserve_keys`) and `iterator_count` read it (ESC-14.1-6). LazyCollection
  then ports line for line: `makeIterator` returns a `Generator` over the
  source function, and `$source instanceof Generator` rejects a bare
  generator object, as testDoesNotCreateCollectionFromGenerator expects.
  This needs a Maintainer-approved runtime item, as epic-14-item-1 was.
  Option 2: a source generator function always yields `[key, value]` pairs
  (a DIV clause). It needs no marker, but `function* () { yield 1 }` would
  then be an error, unlike PHP and unlike `for (const v of c)`. Option 3:
  LazyCollection accepts only value generators, and a user generator never
  gives keys (a divergence that loses Upstream's keyed sources).
evidence: >-
  LazyCollection is generators throughout. `__construct` stores a Closure or
  an array, `all()` is `iterator_to_array($this->getIterator())`, and
  `makeIterator` runs the source and checks `instanceof Generator` /
  `Traversable` (LazyCollection.php:48-122, :1891-1910). Every method builds
  `new static(function () { foreach ($this as $key => $value) { yield $key
  => $value; } })`, as `countBy` does (:336, which ends in a keyed `yield
  from $counts`). `isEmpty` reads `getIterator()->valid()` (:692). A LazyCollection over an
  array source needs no generator (`makeIterator` gives an `ArrayIterator`,
  :1897-1899), but `range`, `map`, `filter`, `values`, `unique` and
  `countBy` each build a generator source, and `toArray` goes through `map`
  (EnumeratesValues.php:1011). Collection::countBy runs
  `lazy()->countBy()->all()` (Collection.php:1946), so its `#0` row needs
  it too.
  The runtime exports no `Generator` and no keyed yield: its foreach
  generators (liveCursor.ts) are internal, and spec-retro-14-runtime-php-types.md
  raised keyed generators as an argument without a decision. The
  2026-10-25 amendment (decisions/MAINT-2026-10-25-story-14-1.md) rules how
  a Traversable iterates, not how a generator function gives keys. That is
  public API: Story 14.7's tests pass `function () { yield 'a' => 1; yield
  'b' => 2; }` (SupportLazyCollectionTest.php:64-65), and the epic's
  XT-collections-3 makes LazyCollection from a generator function
  (epics.md:3590). PORTING.md has no row for `yield $k => $v`. The Story may
  edit only packages/collections/**.
---

# ESC-14.1-5: LazyCollection needs keyed generators, which neither the runtime nor a DIV clause provides

PHP generators yield keys as well as values (`yield $k => $v`), and LazyCollection relies on that in every method. A JS generator yields only values. How a generator function gives keys is part of LazyCollection's public API, because users pass their own generator functions, so the Story cannot choose it. Option 1 adds a `keyed(k, v)` marker and PHP's `Generator` to the runtime under a new DIV-12 clause. Option 2 makes every generator function yield pairs. Option 3 drops user keys. Work on the fourteen Test IDs that reach a generator LazyCollection builds, and on XT-collections-3, stops here.
