---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testMergeRecursiveNull#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testMergeRecursiveNull#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testMergeRecursiveArray#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testMergeRecursiveArray#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testMergeRecursiveCollection#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testMergeRecursiveCollection#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testReplaceNull#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testReplaceNull#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testReplaceArray#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testReplaceArray#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testReplaceCollection#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testReplaceCollection#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testReplaceRecursiveNull#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testReplaceRecursiveNull#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testReplaceRecursiveArray#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testReplaceRecursiveArray#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testReplaceRecursiveCollection#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testReplaceRecursiveCollection#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testUnionNull#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testUnionNull#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testUnionArray#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testUnionArray#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testUnionCollection#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testUnionCollection#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDiffCollection#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDiffCollection#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDiffNull#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDiffNull#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDiffKeys#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDiffKeys#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDiffAssoc#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDiffAssoc#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testIntersectNull#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testIntersectNull#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testIntersectCollection#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testIntersectCollection#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCollapseWithKeys#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCollapseWithKeys#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCollapseWithKeysOnNestedCollections#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCollapseWithKeysOnNestedCollections#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCollapseWithKeysWithMixedCollectionTypes#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCollapseWithKeysWithMixedCollectionTypes#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCollapseWithKeysWithStringKeys#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCollapseWithKeysWithStringKeys#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testFlip#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testFlip#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testFlipSkipsUnsupportedValues#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testFlipSkipsUnsupportedValues#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testPadPadsArrayWithValue#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testPadPadsArrayWithValue#1"
trigger: contract
proposed: >-
  Option 1 (recommended): one more runtime item, in `packages/runtime` only,
  as epic-14-item-5 to -8 were. `@xaravel/runtime/php` exports, under their
  PHP names and with the behaviour of the Oracle's PHP, 8.5.11
  (`php:8.5.11-cli-trixie`, docs/ops/oracle.md): `array_merge_recursive`
  (string keys merged recursively into arrays, int keys renumbered as
  `array_merge` does), `array_replace` and `array_replace_recursive` (keys
  kept, later arrays win, the recursive form descending only where both sides
  hold an array), `array_diff` and `array_intersect` (values compared as
  `(string) $a === (string) $b`, keys kept, an object without `__toString`
  throwing PHP's `Error`), `array_diff_assoc` and `array_diff_key` (by key and
  `(string)` value, by key), the callback forms `array_udiff`,
  `array_diff_uassoc`, `array_diff_ukey`, `array_uintersect` and
  `array_intersect_uassoc` (taking a callback as `array_filter` and
  `array_map` already do, with the result PHP gives whatever order the
  callback is called in), `array_pad` (padding at the end for a positive
  size and at the start for a negative one, int keys renumbered, string keys
  kept, and PHP's `ValueError` beyond its length limit) and `is_int` (true only
  for an integer; false for a float, the float marker included, and false
  for a numeric string). It also exports a helper for PHP's array union `$a + $b`, which has
  no PHP function name (the standing rule's 2026-10-26 amendment): the
  entries of the left array, then each entry of the right array whose key the
  left lacks, as a value copy, with a PORTING.md idiom-table row naming it.
  Each has XT-runtime cases against PHP's results, with a PHP probe as the
  earlier runtime items had. The existing exports stay, and no other runtime
  behaviour changes. Then `mergeRecursive`, `replace`, `replaceRecursive`,
  `union`, `diff`, `diffUsing`, `diffAssoc`, `diffAssocUsing`, `diffKeys`,
  `diffKeysUsing`, `intersect`, `intersectUsing`, `intersectAssocUsing`,
  `collapseWithKeys`, `flip` and `pad` are ported in full on Collection and
  LazyCollection, and the 50 Test IDs above are ported as Upstream wrote
  them (the `*Using` members' own Test IDs also wait for ESC-14.4-2). Option
  2: write private copies of the builtins and of `+` in
  `packages/collections`. That puts PHP semantics outside the runtime, which
  the epic context and the standing rule forbid.
evidence: >-
  Story 14.4's planning, at 572bdc92, traced each of the Story's 124 Test IDs
  through its Upstream body and the members it reaches, and checked each PHP
  name against packages/runtime/src/php/index.ts. Fourteen builtins are
  missing (`grep -cE '\b<name>\b' packages/runtime/src/php/index.ts` gives 0
  for each of `array_merge_recursive`, `array_replace`,
  `array_replace_recursive`, `array_diff`, `array_udiff`, `array_diff_assoc`,
  `array_diff_uassoc`, `array_diff_key`, `array_diff_ukey`,
  `array_intersect`, `array_uintersect`, `array_intersect_uassoc`,
  `array_pad` and `is_int`, and no other package exports them), and no
  runtime helper gives PHP's array `+`. In
  conformance/upstream/framework/src/Illuminate/Collections/Collection.php:
  `collapseWithKeys` (163) calls `array_replace(...$results)`; `diff` (277)
  `array_diff`; `diffUsing` (289) `array_udiff`; `diffAssoc` (300)
  `array_diff_assoc`; `diffAssocUsing` (312) `array_diff_uassoc`;
  `diffKeys` (323) `array_diff_key`; `diffKeysUsing` (335)
  `array_diff_ukey`; `intersect` (663) `array_intersect`;
  `intersectUsing` (675) `array_uintersect`; `intersectAssocUsing` (698)
  `array_intersect_uassoc`; `mergeRecursive` (906)
  `array_merge_recursive`; `union` (947) `$this->items +
  $this->getArrayableItems($items)`; `replace` (1183) `array_replace`;
  `replaceRecursive` (1194) `array_replace_recursive`; and `pad` (1917)
  `array_pad`. LazyCollection.php passes `diff*`, `intersect`,
  `intersectUsing`, `intersectAssocUsing`, `mergeRecursive`, `union` and
  `replaceRecursive` through to those members (363-408, 644-680, 861, 912,
  1079), and `pad` (1837) for a negative size; its `flip` (519) calls
  `is_int`. A member whose LazyCollection side would work alone
  (`collapseWithKeys`, `replace`, `pad` for a positive size) or whose
  Collection side would (`flip`, through the exported `array_flip`) is held
  whole, as a partial member is forbidden and its Test IDs come in #0/#1
  pairs. The Test IDs: testMergeRecursive* (SupportCollectionTest.php:1472,
  1479, 1486), testReplace* (1515, 1522, 1535), testReplaceRecursive* (1557,
  1564, 1574), testUnion* (1584, 1591, 1598), testDiffCollection (1605),
  testDiffNull (1629), testDiffKeys (1636), testDiffAssoc (1655),
  testIntersectNull (1791), testIntersectCollection (1798),
  testCollapseWithKeys* (1984, 1995, 2002, 2009), testFlip (2369),
  testFlipSkipsUnsupportedValues (2379) and testPadPadsArrayWithValue
  (4754). The `*Using` members' tests (testDiffUsingWithCollection,
  testDiffUsingWithNull, testDiffKeysUsing, testDiffAssocUsing,
  testIntersectUsing*, testIntersectAssocUsing*) also need these builtins,
  and are held by ESC-14.4-2, which needs them as well. The 50 Expectations
  lines stay `skip` / `not-ported-yet` with this Escalation, not
  `blocked-by:runtime`: tools/expectations/reasons.ts (the `blocked-by`
  branch) accepts `blocked-by:<c>` only for a Component in a later Phase, or
  the same Phase and a later first Epic, than the test's own, and the
  runtime is Epic 9, before collections' Epic 14 (as ESC-14.2-4, ESC-14.2-6
  and ESC-14.3-1 say). The other members of the Story need none of these
  and are built now. Option 1 meets every condition of
  decisions/MAINT-2026-10-26-runtime-builtins.md: its trigger is `contract`;
  it adds PHP builtins to `packages/runtime` only, and the `+` helper under
  the amendment for PHP language constructs, with an idiom-table row as its
  only other change; each keeps PHP's name (the helper, PHP's behaviour) with
  XT-runtime cases against PHP's results; and it adds or changes no DIV
  clause, changes no expected value and touches no grader file.
---

# ESC-14.4-1: Story 14.4 needs fourteen array builtins and PHP's array `+` from the runtime

Story 14.4's planning traced its 124 Test IDs against the runtime's exports. Fourteen PHP builtins that the Upstream members call are missing: `array_merge_recursive`, `array_replace`, `array_replace_recursive`, `array_diff`, `array_udiff`, `array_diff_assoc`, `array_diff_uassoc`, `array_diff_key`, `array_diff_ukey`, `array_intersect`, `array_uintersect`, `array_intersect_uassoc`, `array_pad` and `is_int`, and no runtime helper gives PHP's array union `+` (`union`). They hold 50 Test IDs and the members `mergeRecursive`, `replace`, `replaceRecursive`, `union`, `diff`, `diffUsing`, `diffAssoc`, `diffAssocUsing`, `diffKeys`, `diffKeysUsing`, `intersect`, `intersectUsing`, `intersectAssocUsing`, `collapseWithKeys`, `flip` and `pad`. Option 1 adds them to `packages/runtime` under the standing rule for runtime builtins and its amendment for language constructs; the Story's other 58 Test IDs and XT-collections-8 are built now.
