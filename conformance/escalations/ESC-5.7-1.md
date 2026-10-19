---
test_ids:
  - XT-conformance-121
trigger: flaky
proposed: >-
  Make the Oracle's date-dependent requests reproducible instead of dropping
  their fixtures. In tools/oracle/evaluate.php, freeze the clock for each
  request (Carbon::setTestNow and CarbonImmutable::setTestNow to one fixed
  instant recorded in conformance/oracle/), and have the matching Ported Tests
  freeze Xaravel's clock to the same instant. Then regenerate the
  DatabaseQueryBuilderTest::testWhereBetweens fixtures. Until that is done,
  the nightly oracle:recheck stays red on these fixtures, which is the
  behavior Story 5.7 AC5 asks for.
evidence: >-
  Story 5.7's oracle:recheck was run locally with --local against the locked
  framework install on 2026-10-19. 4 batch fixtures of
  Illuminate\Tests\Database\DatabaseQueryBuilderTest::testWhereBetweens
  (conformance/oracle/requests/database.jsonl lines 794-797) embed the
  evaluation date: their setup calls Carbon::today() and Carbon::now(). The
  committed fixtures, signed 2026-10-18, hold 2026-10-18 bindings; the
  evaluation gives 2026-10-19. oracle:fixtures --determinism cannot catch this,
  because its two passes run on the same day. The fixtures therefore go stale
  every day, and the nightly recheck will fail on them from its first run.
  The other 15 differences in that local run came from the local install
  (host paths, compiled-view hashes, a class missing locally). They should not
  occur in the image; the first nightly run will confirm that.
---

# ESC-5.7-1: Oracle fixtures that embed today's date

Story 5.7 adds `oracle:recheck`. Every night it re-evaluates each committed Oracle request in the image at the current Pin, and it fails naming every fixture whose output differs from the committed one.

Run locally, it found 4 `DatabaseQueryBuilderTest::testWhereBetweens` fixtures that embed the date they were signed on. The requests call `Carbon::today()` and `Carbon::now()`, so their output changes every day. A fixture signed yesterday no longer matches today's evaluation. The same mismatch would hit the Differential test that compares Xaravel's output with that fixture.

The options:

1. **Freeze the Oracle's clock (proposed).** `evaluate.php` sets Carbon's test-now to one fixed instant, recorded in `conformance/oracle/`. The Ported Test freezes Xaravel's clock to the same instant, and the fixtures are regenerated. Nothing is skipped and no fixture is lost, so the grader is not weakened. This changes the Oracle, a Protected Path, so the Maintainer decides it.
2. **List the requests in `conformance/oracle/nondeterminism.jsonl`.** Those requests then get no fixture, which removes 4 Differential checks. That weakens the grader, so the orchestrator may not choose it.
3. **Leave it.** The nightly recheck stays red on these 4 fixtures and hides any other stale fixture behind a failure that is always present.

Story 5.7 itself does not wait on this ruling: its AC5 is met because the recheck names these fixtures. The Story spec is `_bmad-output/implementation-artifacts/spec-5-7-ci-pipeline-pr-checks-merge-queue-and-nightly-matrix.md`.
