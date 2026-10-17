---
test_ids:
  - XT-conformance-58
trigger: flaky
proposed: >-
  Record Upstream tests whose assertion multiset differs between the two
  baseline attempts in a committed findings file
  (conformance/inventory/oracle-nondeterminism.jsonl: id, variant, both
  attempts), keep `merge` failing on any difference not listed there, and
  for a listed test record the file's pinned multiset (the lowest count
  Upstream can produce), so the FR-113 floor is reproducible and one every
  faithful run can meet. The
  Maintainer chooses this, or one of the alternatives below.
evidence: >-
  CI run 39045666471 merged all 20 legs with no difference, but the
  confirming re-run 39046988875 on the same Pin reported
  `oracle non-determinism:
  Illuminate\Tests\Integration\Database\DatabaseEloquentModelAttributeCastingTest::testAttributesByDefaultDontCacheBooleans
  on none: {"outcome":"pass","assertions":{"assertIsBool":2}} vs
  {"outcome":"pass","assertions":{"assertIsBool":3}}`. The test
  (framework/tests/Integration/Database/DatabaseEloquentModelAttributeCastingTest.php:252-271)
  reads an accessor returning `(bool) mt_rand(0, 1)` up to 51 times and
  returns as soon as two reads differ, so its assertIsBool count is
  2 + a geometric draw. No single committed value is reproducible, so
  `merge` (correctly, per AC 3) refuses to write, and the baseline workflow's
  merge check cannot be green. Every resolution either lowers that test's
  FR-113 floor or masks the non-determinism, which are classes the MAINT
  ruling reserves for the Maintainer.
---

# ESC-2.6-1: Upstream tests with a non-deterministic assertion count

Story 2.6 records each Inventory entry's Upstream assertion multiset from two baseline attempts, and reports any difference as an Oracle non-determinism finding (AC 3). The finding works: one Upstream test at the Pin makes a random number of assertions. Nothing says what the Inventory records for such a test, and the FR-113 assertion floor (Story 5.3) will compare Ported Tests against that value.

The options:

1. **Findings file with a pinned floor (proposed).** `conformance/inventory/oracle-nondeterminism.jsonl` lists each known finding with the multiset to record. Here that is `{"assertIsBool":2}`, the lowest count Upstream can produce. `merge` writes that value for a listed test and still fails on any difference not listed. The committed data stays reproducible, and a faithful port (which draws its own random values) can always meet the floor.
2. **Seed PHP's Mersenne Twister per test in the baseline run**, as the lister already does for provider exports (`pinRandomness`). The count becomes reproducible (one seeded draw), but the Oracle no longer runs Upstream as Upstream runs. The finding is hidden for `mt_rand` users while CSPRNG users still surface, and a Ported Test drawing its own randomness would meet the seeded floor only by chance.
3. **No floor for such tests.** `assertions: null` plus a findings entry. This is simplest, but it drops FR-113's check for these tests, which weakens the grader.

Options 1 and 3 lower or remove a floor, and option 2 changes what the Oracle measures. All three need the Maintainer's ruling under `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. The working implementation and the CI evidence are on PR #51 (`story/2.6`), which stays open until this is decided.
