---
test_ids:
  - "Illuminate\\Tests\\Conditionable\\ConditionableTest::testUnless"
  - "Illuminate\\Tests\\Conditionable\\ConditionableTest::testWhen"
trigger: contract
proposed: >-
  Option 1 (recommended): add `BlockedByComponentError` to
  `@xaravel/runtime` now, in a Maintainer-approved Infrastructure change,
  in the form decisions/ESC-5.3-1.md fixes (registered as a framework
  class, `name` `BlockedByComponentError`, a message starting
  `BlockedByComponentError(<c>)`), and move that criterion off Story 17.2.
  The two tests are then ported throwing `BlockedByComponentError(database)`
  from `setUp`, and their Expectations lines become `skip` /
  `blocked-by:database`. Option 2: move both Test IDs to the Database Story
  that adds Eloquent's `Capsule\Manager` and `Builder`, which ports them
  when they can run.
evidence: >-
  Upstream's tests (framework/tests/Conditionable/ConditionableTest.php:13-44)
  build an Eloquent `Capsule\Manager` on sqlite in `setUp` and assert that
  `TestConditionableModel::query()->when(...)` is a `HigherOrderWhenProxy`
  or an Eloquent `Builder`. Both need `database`, phase 4 in
  tools/scaffold/packages.jsonl, so the right line is `skip` /
  `blocked-by:database`. The harness matches that line only on a junit
  failure of type `BlockedByComponentError` whose message starts
  `BlockedByComponentError(database)` (conformance/harness/compare.ts:121,
  decisions/ESC-5.3-1.md), and ESC-5.3-1 leaves defining the class to
  Story 17.2 in `@xaravel/runtime`, which Story 12.1 may not edit; a local
  copy would fake another Component. The two Expectations lines stay
  `skip` / `not-ported-yet` with this Escalation until it is ruled.
---

# ESC-12.1-2: ConditionableTest needs Eloquent, and `blocked-by` needs a class no Story has added yet

The two `ConditionableTest` tests run `when()` / `unless()` on an Eloquent query Builder, so they belong under `blocked-by:database`. That Skip Reason matches only a `BlockedByComponentError` failure, and the class does not exist until Story 17.2 adds it to `@xaravel/runtime`. Option 1 adds the class now through an Infrastructure change; Option 2 hands both Test IDs to the Database Story. Work on these two Test IDs stops here.
