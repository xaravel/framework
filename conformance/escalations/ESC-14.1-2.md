---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCachingIterator#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCachingIterator#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCollectionFromTraversable#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCollectionFromTraversable#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCollectionFromTraversableWithKeys#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCollectionFromTraversableWithKeys#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testConstructMethodFromWeakMap#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testConstructMethodFromWeakMap#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testEnsureForInheritance#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testEnsureForInheritance#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testEnsureForMultipleTypes#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testEnsureForMultipleTypes#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testGetArrayableItems#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testGetArrayableItems#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testIterable"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testJsonSerialize#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testJsonSerialize#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testJsonSerializeCallsToArrayOrJsonSerializeOnEachItemInCollection#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testJsonSerializeCallsToArrayOrJsonSerializeOnEachItemInCollection#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testWrapWithJsonSerialize#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testWrapWithJsonSerialize#1"
trigger: contract
proposed: >-
  Option 1 (recommended): `@xaravel/runtime` adds PHP's built-in types that
  Collections returns, accepts or checks, registered under their PHP names
  as the SPL exceptions are (Story 9.10): the `Traversable`, `Iterator`,
  `IteratorAggregate`, `JsonSerializable`, `Stringable` and `Throwable`
  interfaces (as contract tokens, so `instanceof`, `hasBrand` and the class
  lookup resolve them, and `jsonEncode`'s `Symbol.for('JsonSerializable')`
  hook is the token's brand); the `ArrayIterator` (with `getArrayCopy()`),
  `ArrayObject` and `CachingIterator` (with `CALL_TOSTRING`, `hasNext()`)
  classes; and a PHP `WeakMap` with object keys that iterates in insertion
  order (a JS `WeakMap` cannot be iterated). The runtime's `Error` and
  `Exception` then satisfy `Throwable`. Collection's `getIterator()` returns
  an `ArrayIterator`, as Upstream does, and is also `[Symbol.iterator]`.
  Option 2: each missing type gets its own answer: a DIV clause where the JS
  value differs (a JS iterator instead of `ArrayIterator`, no
  `CachingIterator`, no iterable `WeakMap`), with the matching Test IDs
  adapted or skipped under it.
evidence: >-
  PORTING.md:136 says `ArrayObject` and `JsonSerializable` come from
  `@xaravel/runtime/php`; neither is exported (packages/runtime/src/php/index.ts),
  and no runtime file defines `Traversable`, `IteratorAggregate`,
  `ArrayIterator`, `CachingIterator`, `WeakMap`, `Stringable` or `Throwable`
  (grep of packages/runtime/src). The class lookup resolves only registered
  classes and contract tokens (packages/runtime/src/php/classLookup.ts), so
  `'Throwable'` is not a name. The tests: testIterable asserts
  `assertInstanceOf(ArrayIterator::class, $c->getIterator())` and
  `getArrayCopy()` (SupportCollectionTest.php:989); testCachingIterator
  asserts a `CachingIterator` (:997, EnumeratesValues.php:1059);
  testCollectionFromTraversable* build from `new ArrayObject(...)` (:5420);
  testConstructMethodFromWeakMap iterates a `WeakMap` (:3321, Arr.php:480);
  testGetArrayableItems uses an `IteratorAggregate` / `JsonSerializable`
  fixture (:677, Fixtures/Common.php); testJsonSerialize*, testWrapWithJsonSerialize
  and the Mockery mock of `JsonSerializable::class` need the interface;
  testEnsureForInheritance / MultipleTypes check `instanceof \Throwable` on
  `new \Error` and `new \Exception` (:6272). `Arr::from` tests
  `Traversable`, `WeakMap` and `JsonSerializable` in that order
  (Arr.php:474-490). The Story may edit only packages/collections/**.
---

# ESC-14.1-2: PHP built-in iterator, JsonSerializable, Throwable and WeakMap types do not exist in the runtime

Collections returns `ArrayIterator` and `CachingIterator`, accepts `Traversable`, `ArrayObject`, `WeakMap` and `JsonSerializable` items, and `ensure` checks `Throwable`. None of these exist in `@xaravel/runtime`, though PORTING.md says `ArrayObject` and `JsonSerializable` come from it. Option 1 adds them to the runtime under their PHP names. Option 2 rules each one as a divergence. Work on these Test IDs stops here.
