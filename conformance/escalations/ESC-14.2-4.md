---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testContains#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testContains#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testContainsStrict#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testContainsStrict#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDoesntContain#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDoesntContain#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testGetPluckValueWithAccessors#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testGetPluckValueWithAccessors#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testSome#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testSome#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testValueRetrieverAcceptsDotNotation#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testValueRetrieverAcceptsDotNotation#1"
trigger: contract
proposed: >-
  Option 1 (recommended): one more runtime item, in `packages/runtime` only,
  as epic-14-item-5 was. `@xaravel/runtime/php` exports, under their PHP
  names and with PHP's behaviour: `is_null`; `uasort` over a `Ref<T>`
  (AD-9, DIV-9.2), keeping keys, with the user comparator's result read as
  PHP reads it; and the string comparisons `strcmp`, `strcasecmp`,
  `strnatcmp`, `strnatcasecmp` and `strcoll` (the C locale), which
  arrayRefFunctions.ts already implements privately for `asort` / `arsort`.
  Add XT-runtime cases against PHP's results. The existing exports stay,
  and no other runtime behaviour changes. The twelve Test IDs are then ported
  as Upstream wrote them, with `Collection::sortBy` / `sortByMany` and
  `LazyCollection::sortBy` ported in full, and the test-local fixture
  `TestAccessorEloquentTestStub` keeps Upstream's `! is_null(...)`. Option 2: write `x === null` for
  `is_null` in the four test bodies and the fixture, and hold
  testValueRetrieverAcceptsDotNotation for Story 14.5, which owns `sortBy`.
  That needs a manifest change, and a test-body rewrite that no PORTING.md
  row or DIV clause covers.
evidence: >-
  Story 14.2's second planning round, at b5938e16, after epic-14-item-5
  landed. It checked every bare function call in the Upstream bodies of the
  Story's Test IDs, and in the members they reach, against
  packages/runtime/src/index.ts and packages/runtime/src/php/index.ts.
  Two gaps remain that ESC-14.2-1 did not list. (1) `is_null`: testContains,
  testDoesntContain, testSome and testContainsStrict call it in their
  callbacks (SupportCollectionTest.php:4068, :4127, :4214, :4222).
  PORTING.md § Mechanical expression rule keeps a bare function name
  verbatim and imports PHP builtins from `@xaravel/runtime/php`, and the
  runtime exports no `is_null`. (2) testValueRetrieverAcceptsDotNotation
  (:4306) calls `sortBy('foo.bar')`. Porting Collection::sortBy
  (Collection.php:1601) line for line includes its `sortByMany` branch
  (:1640). That branch calls `uasort`, `strnatcasecmp`, `strcasecmp`,
  `strcmp`, `strnatcmp` and `strcoll` (:1648-1677), and none of them is
  exported. The runtime has private `strnatcmp` / binary `strcmp` /
  `strcoll` helpers for `asort` (packages/runtime/src/php/arrayRefFunctions.ts:235,
  :303, :328), but no export under a PHP name and no `uasort`. Porting
  `sortBy` without `sortByMany` would be a partial implementation, and a
  private copy in packages/collections is forbidden
  (decisions/MAINT-2026-10-26-runtime-builtins.md, epic 14 context).
  The build pass found a third use the planning round missed: the
  test-local fixture `TestAccessorEloquentTestStub::__isset`
  (SupportCollectionTest.php:6574) returns `! is_null($this->$accessor())`,
  and testGetPluckValueWithAccessors reaches it, because `pluck('some')`
  calls `data_get`, whose object branch tests `isset($item->some)` through
  the stub's `__isset`. The fixture is test code, so it keeps the PHP name
  as the test bodies do, and testGetPluckValueWithAccessors#0/#1 wait here
  too. The other 159 Test IDs need none of these, and are built in this
  pass. The twelve Expectations lines stay `not-ported-yet` with this
  Escalation, not `blocked-by:runtime`: tools/expectations/reasons.ts
  (:270-282) accepts `blocked-by:<c>` only when `<c>` is in a later Phase,
  or the same Phase and a later Epic, than collections, and the runtime is
  Phase 0/1, as ESC-14.1-11 kept `not-ported-yet` for its Mockery tests.
  Option 1 meets every condition of the standing rule for runtime builtins:
  trigger `contract`, `packages/runtime` only, PHP names and behaviour with
  XT-runtime cases, and no DIV clause, expected value or grader file.
---

# ESC-14.2-4: Story 14.2 needs `is_null`, `uasort` and PHP's string comparisons from the runtime

After epic-14-item-5 landed, Story 14.2's second planning round checked every PHP builtin its Test IDs reach. Two gaps remain that ESC-14.2-1 did not list. First, four test bodies call `is_null` (testContains, testContainsStrict, testDoesntContain and testSome). Second, testValueRetrieverAcceptsDotNotation reaches `Collection::sortBy`, whose `sortByMany` branch calls `uasort` and the `strcmp` family. Option 1 exports these from the runtime under the standing rule for runtime builtins. A third use came up in the build: the test-local fixture `TestAccessorEloquentTestStub::__isset`, which testGetPluckValueWithAccessors reaches, calls `is_null` too. This Escalation holds only these twelve Test IDs. The Story's other 159 are built now.
