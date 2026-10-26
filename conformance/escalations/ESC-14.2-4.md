---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testContains#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testContains#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testContainsStrict#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testContainsStrict#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDoesntContain#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDoesntContain#1"
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
  and no other runtime behaviour changes. The ten Test IDs are then ported
  as Upstream wrote them, with `Collection::sortBy` / `sortByMany` and
  `LazyCollection::sortBy` ported in full. Option 2: write `x === null` for
  `is_null` in the four test bodies, and hold
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
  The other 161 Test IDs need none of these, and are built in this pass.
  Option 1 meets every condition of the standing rule for runtime builtins:
  trigger `contract`, `packages/runtime` only, PHP names and behaviour with
  XT-runtime cases, and no DIV clause, expected value or grader file.
---

# ESC-14.2-4: Story 14.2 needs `is_null`, `uasort` and PHP's string comparisons from the runtime

After epic-14-item-5 landed, Story 14.2's second planning round checked every PHP builtin its Test IDs reach. Two gaps remain that ESC-14.2-1 did not list. First, four test bodies call `is_null` (testContains, testContainsStrict, testDoesntContain and testSome). Second, testValueRetrieverAcceptsDotNotation reaches `Collection::sortBy`, whose `sortByMany` branch calls `uasort` and the `strcmp` family. Option 1 exports these from the runtime under the standing rule for runtime builtins. This Escalation holds only these ten Test IDs. The Story's other 161 are built now.
