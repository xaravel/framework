---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testPushWithMultipleItems"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testUnshiftWithMultipleItems"
trigger: divergence
proposed: >-
  Option 1 (recommended): a new DIV-9 clause (the next free number) for
  spreading a PHP array that is not a list into a call. PHP 8.1+ spreads an
  integer-keyed array positionally, by value, and ignores its keys; a
  string key becomes a named argument. The Ported Test writes
  `...array_values(a)` (the runtime's `array_values`) where `a` is a
  `PhpArray` with integer keys, marked with the new clause; a string-keyed
  spread stays untranslatable (AD-26's options object is a separate rule).
  PORTING.md's spread row gains the same sentence. The expected values are
  unchanged. Option 2: make `PhpArray`'s `[Symbol.iterator]` yield values
  instead of `[key, value]` pairs, so `...a` matches PHP; it changes the
  runtime's documented iteration contract that every Component built since
  Epic 9 reads (`for (const [k, v] of a)`), so it is a far larger change.
evidence: >-
  SupportCollectionTest.php:4653 (:4672) and :4698 (:4717) call
  `$data->push(...[11 => 'Jonny', 12 => 'from', 13 => 'Laroe'])` and the
  same with `unshift`, and expect the three strings appended or prepended.
  PORTING.md's rule table makes the literal a `new PhpArray([[11, 'Jonny'],
  …])` (keys not 0..n-1, DIV-9.2) and keeps `...$a` as `...a`. The runtime's
  `PhpArray[Symbol.iterator]` yields `[key, value]` pairs
  (packages/runtime/src/php/PhpArray.ts:191), so the call receives three
  two-element arrays and the assertion fails. Writing the spread over the
  values changes the test line, and no DIV-9 or DIV-12 clause covers it
  (DIV-9.2 covers literals and by-reference arguments only).
  testUnshiftWithMultipleItems also needs `array_unshift`, which
  ESC-14.2-1 asks the runtime for.
---

# ESC-14.2-2: spreading a keyed PHP array into a variadic call

PHP spreads `...[11 => 'Jonny', 12 => 'from', 13 => 'Laroe']` as three positional values. The ported literal is a `PhpArray`, whose iterator yields `[key, value]` pairs, so `...a` passes pairs. Writing `...array_values(a)` gives PHP's result but changes the test line, and no DIV clause covers that. Option 1 adds a DIV-9 clause and a PORTING.md sentence. Option 2 changes `PhpArray` iteration, which every Component reads. It holds only testPushWithMultipleItems and testUnshiftWithMultipleItems.
