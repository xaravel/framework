---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testHighOrderPercentage#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testHighOrderPercentage#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testBetween#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testBetween#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testWhereNotBetween#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testWhereNotBetween#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testHigherOrderCollectionGroupBy#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testHigherOrderCollectionGroupBy#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testHigherOrderCollectionMap#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testHigherOrderCollectionMap#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testHigherOrderCollectionMapFromArrays#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testHigherOrderCollectionMapFromArrays#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testHigherOrderCollectionStaticCall#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testHigherOrderCollectionStaticCall#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testHigherOrderSole#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testHigherOrderSole#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testTakeUntilCanBeProxied#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testTakeUntilCanBeProxied#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testTakeWhileCanBeProxied#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testTakeWhileCanBeProxied#1"
trigger: contract
proposed: >-
  Option 1 (recommended): one more runtime item, in `packages/runtime` only,
  as epic-14-item-5, -6 and -7 were. `@xaravel/runtime/php` exports, under
  their PHP names and with the behaviour of the Oracle's PHP, 8.5.11
  (`php:8.5.11-cli-trixie`, docs/ops/oracle.md): `round(num, precision =
  0, mode = PHP_ROUND_HALF_UP)`, PHP's full signature, with the constants
  `PHP_ROUND_HALF_UP`, `PHP_ROUND_HALF_DOWN`, `PHP_ROUND_HALF_EVEN` and
  `PHP_ROUND_HALF_ODD`, and PHP 8.4's `RoundingMode` enum (`HalfAwayFromZero`,
  `HalfTowardsZero`, `HalfEven`, `HalfOdd`, `TowardsZero`, `AwayFromZero`,
  `NegativeInfinity`, `PositiveInfinity`), which PHP 8.5.11 has, as an AD-26
  enum, accepted as `mode` as PHP 8.5 accepts either; PHP 8.5's
  `_php_math_round` (the pre-rounding check and the `precision` argument,
  negative included), and PHP's `ValueError` for an invalid int `mode`; the
  result a float, carrying the float marker when integral (`round(75.0, 2)`
  is `float(75)`); `reset(ref)`
  and `end(ref)`, each taking a `Ref<array>` (PHP's `&$array`, DIV-9.2) and
  returning the first or last value, or `false` for an empty array; `is_bool`;
  `strtoupper` (ASCII-only, as PHP 8 is, bytes of 0x80 and above unchanged);
  `trim(string, characters = " \n\r\t\v\0")` (PHP's default character list
  and its `a..z` range syntax); and `chunk_split(string, length = 76,
  separator = "\r\n")` (a `length` below 1 throws PHP's `ValueError`
  `chunk_split(): Argument #2 ($length) must be greater than 0`). Each has
  XT-runtime cases against PHP's results, with a PHP probe as the earlier
  runtime items had. The existing exports stay, and no other runtime
  behaviour changes. Then `percentage`, `groupBy` (Collection in full,
  LazyCollection through `passthru`), `whereBetween` and `whereNotBetween`
  are ported in full, the three fixtures
  (`TestSupportCollectionHigherOrderItem`,
  `TestSupportCollectionHigherOrderStaticClass1`,
  `TestSupportCollectionHigherOrderStaticClass2`) are ported with every
  method, and the 20 Test IDs are ported as Upstream wrote them. Option 2:
  write private copies of the seven builtins in `packages/collections`. That
  puts PHP semantics outside the runtime, which the epic context and the
  standing rule forbid.
evidence: >-
  Story 14.3's planning, at 9c7e4ffe, traced each of the Story's 148 Test
  IDs through its Upstream body and the members it reaches, and checked each
  PHP name against packages/runtime/src/php/index.ts. Seven are missing
  (`grep -cE '\b(round|reset|end|is_bool|strtoupper|trim|chunk_split)\b'
  packages/runtime/src/php/index.ts` gives 0 for each, and no other package
  exports them). `round`: `EnumeratesValues::percentage`
  (EnumeratesValues.php:564), reached by testHighOrderPercentage
  (SupportCollectionTest.php:6323, `$collection->percentage->active`,
  expected `75.00`), which calls `round($x, $precision)` and so uses only
  the default mode; the full signature is asked for so the runtime export is
  PHP's `round` as the Oracle's PHP 8.5.11 defines it, not a two-argument
  subset. `reset` / `end`: `whereBetween` (EnumeratesValues.php:730)
  and `whereNotBetween` (:742), the only members testBetween (SCT:1360) and
  testWhereNotBetween (SCT:1371) call. `is_bool`: the `match (true)` of
  `Collection::groupBy` (Collection.php:530), reached by
  testHigherOrderCollectionGroupBy (SCT:5587) through `$data->groupBy->name`
  (LazyCollection::groupBy, :558, passes through to it). `strtoupper`:
  `TestSupportCollectionHigherOrderItem::uppercase()` (SCT:6504) and
  `TestSupportCollectionHigherOrderStaticClass1::transform()` (SCT:6524).
  `trim` and `chunk_split`: `TestSupportCollectionHigherOrderStaticClass2::transform()`
  (SCT:6537). The fixture `TestSupportCollectionHigherOrderItem` cannot be
  ported without `uppercase()`, and a fixture missing one of its methods
  would be a partial port, so every test that constructs it waits:
  testHigherOrderSole (SCT:1073), testTakeUntilCanBeProxied (SCT:2972),
  testTakeWhileCanBeProxied (SCT:3026), testHigherOrderCollectionGroupBy,
  testHigherOrderCollectionMap (SCT:5608) and
  testHigherOrderCollectionMapFromArrays (SCT:5623);
  testHigherOrderCollectionStaticCall (SCT:5638) needs both static
  fixtures. The 20 Expectations lines stay `skip` / `not-ported-yet` with
  this Escalation, not `blocked-by:runtime`: tools/expectations/reasons.ts
  (the `blocked-by` branch) accepts `blocked-by:<c>` only for a Component
  in a later Phase, or the same Phase and a later first Epic, than the
  test's own, and the runtime is Phase 0/1 with Epic 9, before collections'
  Epic 14 (as ESC-14.2-4 and ESC-14.2-6 say). The other 128 Test IDs and
  XT-collections-6/7 need none of the seven and are built now. Option 1
  meets every condition of decisions/MAINT-2026-10-26-runtime-builtins.md:
  its trigger is `contract`; it adds PHP builtins to `packages/runtime`
  only; each keeps its PHP name and PHP's behaviour, with XT-runtime cases
  against PHP's results; and it adds or changes no DIV clause (`reset` /
  `end` take the `Ref` DIV-9.2 already gives every by-reference
  parameter, as `array_shift` and `asort` do), changes no expected value
  and touches no grader file.
---

# ESC-14.3-1: Story 14.3 needs `round`, `reset`, `end`, `is_bool`, `strtoupper`, `trim` and `chunk_split` from the runtime

Story 14.3's planning traced its 148 Test IDs against the runtime's exports. Seven PHP builtins that the Upstream members or the test-local fixtures call are missing: `round` (`percentage`), `reset` and `end` (`whereBetween`, `whereNotBetween`), `is_bool` (`Collection::groupBy`), `strtoupper` (`TestSupportCollectionHigherOrderItem`, `TestSupportCollectionHigherOrderStaticClass1`), and `trim` and `chunk_split` (`TestSupportCollectionHigherOrderStaticClass2`). They hold 20 Test IDs. Option 1 adds them to `packages/runtime` under the standing rule for runtime builtins; the other 128 Test IDs and XT-collections-6/7 are built now.
