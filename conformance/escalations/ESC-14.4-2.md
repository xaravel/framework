---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDiffUsingWithCollection#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDiffUsingWithCollection#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDiffUsingWithNull#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDiffUsingWithNull#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDiffKeysUsing#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDiffKeysUsing#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDiffAssocUsing#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testDiffAssocUsing#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testIntersectUsingWithNull#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testIntersectUsingWithNull#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testIntersectUsingCollection#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testIntersectUsingCollection#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testIntersectAssocUsingWithNull#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testIntersectAssocUsingWithNull#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testIntersectAssocUsingCollection#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testIntersectAssocUsingCollection#1"
trigger: divergence
proposed: >-
  Option 1 (recommended, a faithful port): a shared runtime resolver from a
  PHP global-function name to the runtime's port of that function, bounded
  by an explicit registry in `packages/runtime` that lists only PHP's
  built-in global functions the runtime exports (`strcasecmp`, `strcmp`,
  `strtoupper`, …), never its other exports (helpers such as
  `arrayEntries`, classes, constants), read by the runtime's callable handling
  (`callbackParameter` in packages/runtime/src/php/arrayFunctions.ts, and so
  `array_udiff`, `array_diff_uassoc`, `array_diff_ukey`, `array_uintersect`
  and `array_intersect_uassoc` once ESC-14.4-1 adds them) and by
  `is_callable`, so a PHP callable string such as `'strcasecmp'` is called
  as the runtime's `strcasecmp`, which it already exports, where Upstream
  passes it. A name with no registry entry stays not callable:
  `is_callable` gives `false` for it, and `callbackParameter` keeps its
  `TypeError`. This supersedes DIV-9.13 ("A later Component that adds a shared
  resolver supersedes this clause through an Escalation") and narrows
  DIV-9.14's "no runtime table of PHP global functions exists" edge, so the
  ruling changes both records; PORTING.md's "A PHP callable string stays a
  string literal, as Upstream passes it" then holds for these tests with no
  adaptation. Then `diffUsing`, `diffAssocUsing`, `diffKeysUsing`,
  `intersectUsing` and `intersectAssocUsing` are ported in full (with the
  builtins of ESC-14.4-1), and the 16 Test IDs above are ported as Upstream
  wrote them. Option 2: a new DIV-9 clause under which a Ported Test that
  passes a PHP callable string to a collection member adapts it to the arrow
  function over the runtime export, `(a, b) => strcasecmp(a, b)`, marked
  with that clause, as DIV-9.13 already does for `when` / `unless`; the
  members take a function or an invokable object only.
evidence: >-
  The eight Upstream tests pass the callable string `'strcasecmp'` as the
  `callable $callback` of a `*Using` member:
  testDiffUsingWithCollection (SupportCollectionTest.php:1612) and
  testDiffUsingWithNull (1622) to `diffUsing`, testDiffKeysUsing (1644) to
  `diffKeysUsing`, testDiffAssocUsing (1663) to `diffAssocUsing`,
  testIntersectUsingWithNull (1805) and testIntersectUsingCollection (1813)
  to `intersectUsing`, and testIntersectAssocUsingWithNull (1838) and
  testIntersectAssocUsingCollection (1846) to `intersectAssocUsing`.
  Collection.php hands that callback straight to `array_udiff` (289),
  `array_diff_uassoc` (312), `array_diff_ukey` (335), `array_uintersect`
  (675) and `array_intersect_uassoc` (698); LazyCollection.php passes the
  members through to Collection's. In the port, the runtime's callable
  handling refuses a callable string: `callbackParameter`
  (packages/runtime/src/php/arrayFunctions.ts:104-124) throws `TypeError`
  "is a PHP callable string, which Xaravel does not port" (DIV-9.13), and
  DIV-9.14 records that no runtime table of PHP global functions exists. So
  porting these tests as Upstream wrote them needs a resolver, and adapting
  them needs a DIV clause DIV-9 does not have (DIV-9.13 covers only `when` /
  `unless`). Both options change a DIV record, which only the Maintainer
  rules (AGENTS.md; decisions/MAINT-2026-10-26-runtime-builtins.md, "What
  still goes to the Maintainer"), so this is a `divergence` Escalation and
  not one the standing rule covers. Every one of these tests also needs a
  builtin ESC-14.4-1 asks for (`array_diff` for testDiffUsingWithCollection's
  first assertion, `array_diff_key` and `array_diff_assoc` for the
  `diffKeys` / `diffAssoc` assertions, and the five callback builtins), so
  it is ported only once both are ruled. The 16 Expectations lines stay
  `skip` / `not-ported-yet` with this Escalation, as ESC-14.4-1 explains for
  `blocked-by:runtime`.
---

# ESC-14.4-2: Story 14.4's `*Using` tests pass the PHP callable string `'strcasecmp'`

Eight Upstream tests (16 Test IDs) pass `'strcasecmp'` to `diffUsing`, `diffKeysUsing`, `diffAssocUsing`, `intersectUsing` and `intersectAssocUsing`. The runtime refuses a PHP callable string (DIV-9.13), and DIV-9.14 says no table of PHP global functions exists. Option 1 adds a shared runtime resolver from a function name to the runtime export of that name, superseding DIV-9.13 and narrowing DIV-9.14, so the tests run as Upstream wrote them; option 2 adds a DIV-9 clause adapting the string to an arrow function. Either changes a DIV record, so the Maintainer rules. The tests also need ESC-14.4-1's builtins.
