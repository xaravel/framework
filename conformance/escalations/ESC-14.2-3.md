---
test_ids:
  - "XT-collections-4"
  - "XT-collections-5"
trigger: divergence
proposed: >-
  Option 1 (recommended): extend DIV-12.13's reasoning to the Enumerable
  members whose leading optional parameters take a PHP value or callback
  and whose behaviour reads PHP's argument count: `contains`,
  `doesntContain`, `hasSole`, `hasMany`, `firstOrFail`, `sole`,
  `firstWhere`, `where`, `first`, `last`, `value`, `search`, `before`,
  `after` and the other Enumerable members with two or more optional
  parameters whose first optional parameter can be a plain object (a PHP
  array) or a callable. They keep only the positional form, and a lone
  object argument is always the PHP value, as PHP reads it. A new DIV-12
  clause records it, and `conformance/api-surface/exceptions.jsonl` exempts
  each member (an Infrastructure change, as ESC-12.1-3 did for `when` /
  `unless`). Option 2: give each member AD-26's options-form overload. A
  lone plain object is then ambiguous: `contains({ a: 1 })` is a PHP
  array value in Upstream (testContains passes arrays), and
  `first(options)` against `first(default)` is the same clash; the
  implementation would also have to tell an omitted argument from
  `func_num_args()`, which the options object hides.
evidence: >-
  tools/api-surface/api-surface.ts:40-44 makes `api-surface:gate` require a
  positional and an options-form signature for every member with two or
  more optional non-variadic Upstream parameters (AD-26 "also accepts").
  Story 14.2's members include `contains($key, $operator = null, $value =
  null)` (Collection.php:196), `hasSole`, `firstOrFail` and `sole`
  (:1458-1509), `first($callback = null, $default = null)` (:443), `last`
  (:807), `search($value, $strict = false)` (:1216), and EnumeratesValues
  `firstWhere` (:333), `where` (:657) and `hasMany` (:346). `contains`,
  `hasSole` and `firstOrFail` branch on `func_num_args()` (Collection.php
  :198, :1489, :1511), and their first optional parameter is a PHP value
  that the port represents as a plain object when string-keyed (DIV-9.2).
  `conformance/api-surface/exceptions.jsonl` exempts only Conditionable's
  `when` / `unless` (DIV-12.13, ESC-12.1-3). Story 14.8's AC requires
  `bun run api-surface:gate collections` to pass, so this must be ruled
  before the Epic closes; XT-collections-4 and -5 test `contains`,
  `containsStrict`, `sole` and `firstOrFail`, whose signatures it decides.
---

# ESC-14.2-3: the options-form overload for Enumerable members that read PHP values and argument counts

AD-26 says a method with more than one optional parameter also accepts an options object, and `api-surface:gate` enforces it. For `contains`, `first`, `sole`, `firstOrFail`, `where` and the like, the first optional parameter is a PHP value, which the port writes as a plain object when it has string keys, and the method branches on how many arguments were passed. A lone object would be ambiguous, as it was for `when` and `unless` (DIV-12.13). Option 1 keeps only the positional form under a new DIV-12 clause and api-surface exemptions. Option 2 adds the overloads and accepts the ambiguity. The gate runs at Story 14.8, so the ruling is needed before the Epic closes. It holds XT-collections-4 and -5 here.
