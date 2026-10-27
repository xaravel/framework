---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testEachSpread#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testEachSpread#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testMapSpread#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testMapSpread#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testGroupByCallable#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testGroupByCallable#1"
trigger: contract
proposed: >-
  Option 1 (recommended): runtime adds language-construct helpers for PHP
  append to a value and PHP argument unpacking/invocation, plus callable-array
  resolution and invocation through the shared callable resolver. Keep PHP
  values, keys, value copies, registry lookup, case-insensitive method lookup,
  visibility and exceptions. Add XT-runtime cases against Oracle PHP 8.5.11
  and PORTING.md idiom rows naming the construct helpers. No DIV clause,
  expected value or grader changes. Option 2: coerce chunks to Collection,
  discard keys with array_values, or replace callable arrays with arrows.
  Rejected: these change PHP behavior and DIV-9.13 permits the latter only
  for when/unless.
evidence: >-
  EnumeratesValues.php eachSpread and mapSpread append the collection key
  to each chunk before unpacking the chunk into the callback. Scalars must
  produce PHP's append error rather than silently become a Collection.
  String keys become named arguments; appending the positional key after a
  named key produces PHP's unpacking error. Unpacking must preserve argument
  value copies and ordering, support valid arrays and ArrayAccess chunks as
  Upstream does, and reproduce named/positional ordering, duplicate argument,
  unknown named parameter and scalar errors. Runtime has array_values and
  callable-name resolution, but no contract for these append/unpack constructs.
  SupportCollectionTest testGroupByCallable passes [$this, 'sortByRating'] and
  [$this, 'sortByUrl']; runtime's shared resolver does not invoke these arrays.
  DIV-9.13's arrow adaptation is explicitly limited to when/unless, so it
  cannot authorize groupBy adaptation. Callable arrays must support object
  and registered-class targets, public/static methods and PHP error behavior
  through the shared runtime resolver. Hold both spread members on both
  classes, and all six exact Test IDs above, whole. Their Expectations stay
  not-ported-yet with this Escalation; runtime is an earlier Epic so it cannot
  be a blocked-by reason. Existing independent groupBy coverage is retained.
---

# ESC-14.5-3: PHP append/unpack and callable-array invocation contracts

This qualifies for the standing runtime language-construct rule in
`decisions/MAINT-2026-10-26-runtime-builtins.md`. The monitor decides scope
and helper names; this Story adds no runtime implementation or DIV change.
