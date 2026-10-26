---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testValueRetrieverAcceptsDotNotation#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testValueRetrieverAcceptsDotNotation#1"
trigger: contract
proposed: >-
  Option 1 (recommended): one more runtime item, in `packages/runtime` only,
  as epic-14-item-5 and epic-14-item-6 were. `@xaravel/runtime/php` exports
  PHP's `UnhandledMatchError` (`extends Error`, registered as
  `UnhandledMatchError`), with PHP's message for an unmatched subject,
  `Unhandled match case ` followed by the subject as PHP's
  `smart_str_append_scalar` renders it (strings quoted and cut at
  `zend.exception_string_param_max_len`, 15 bytes by default), or
  `Unhandled match case of type <type>` for an array or object. For the
  values `sortBy` can meet: `Unhandled match case 0`, `Unhandled match case
  'desc'` and `Unhandled match case NULL`. XT-runtime cases check these and
  the other scalar kinds against PHP's results, with a PHP probe as the
  earlier runtime items did. The existing exports stay, and no other runtime behaviour
  changes. The two Test IDs are then ported as Upstream wrote them, with
  `Collection::sortBy` / `sortByMany` and `LazyCollection::sortBy` ported
  in full: `sortBy`'s `match ($descending)` throws `UnhandledMatchError`
  for a value that is neither `true`, `false` nor a `SortDirection` case,
  as PHP's does. Option 2: port `sortBy` without the throw, so
  `sortBy($cb, SORT_REGULAR, 0)` sorts where PHP throws. That is a silent
  divergence with no DIV clause, and a partial implementation.
evidence: >-
  Story 14.2's third planning round, at e5ee034d, after epic-14-item-6
  (ESC-14.2-4) landed. It traced the twelve Test IDs ESC-14.2-4 held through
  the members they reach, against packages/runtime/src/php/index.ts. Ten
  need only `is_null`, `method_exists` and `lcfirst`, which the runtime now
  exports, and are built in this pass. testValueRetrieverAcceptsDotNotation
  (SupportCollectionTest.php:4306) calls `sortBy('foo.bar')`, and ESC-14.2-4's
  ruling asks for `Collection::sortBy` / `sortByMany` and
  `LazyCollection::sortBy` in full. `Collection::sortBy`
  (Collection.php:1601) ends in `match ($descending) { false,
  SortDirection::Ascending => asort(...), true, SortDirection::Descending
  => arsort(...) }` (:1617-1620), a `match` with no `default` arm, so any
  other `$descending` (`0`, `1`, `'desc'`, `null`) throws PHP's
  `UnhandledMatchError`. `$descending` is untyped, so the case is reachable
  from user code. No package in the repository defines or exports
  `UnhandledMatchError` (`grep -r UnhandledMatchError packages` finds
  nothing), and a private copy in packages/collections is forbidden
  (decisions/MAINT-2026-10-26-runtime-builtins.md, epic 14 context). Every
  other builtin `sortBy` / `sortByMany` reach is exported now: `asort`,
  `arsort`, `uasort`, `array_keys`, `array_reverse`, `is_callable`,
  `is_string`, `is_array`, `data_get`, `toFloat`, `toPhpString`, `spaceship`,
  the `strcmp` family, `SORT_*` and `SortDirection`. The two Expectations
  lines stay `not-ported-yet` with this Escalation, not `blocked-by:runtime`,
  for the reason ESC-14.2-4 gives (tools/expectations/reasons.ts:270-282).
  Option 1 meets every condition of the standing rule for runtime builtins:
  trigger `contract`, `packages/runtime` only, the PHP name and behaviour
  with XT-runtime cases, and no DIV clause, expected value or grader file.
---

# ESC-14.2-6: Story 14.2 needs PHP's `UnhandledMatchError` from the runtime for `sortBy`

After epic-14-item-6 landed, Story 14.2's third planning round traced the twelve Test IDs ESC-14.2-4 held. Ten are built now. testValueRetrieverAcceptsDotNotation#0/#1 reach `Collection::sortBy`, which ESC-14.2-4's ruling asks to port in full. Its `match ($descending)` has no `default` arm, so PHP throws `UnhandledMatchError` for any other value, and the runtime does not export that class. Option 1 exports it under the standing rule for runtime builtins. This Escalation holds only these two Test IDs.
