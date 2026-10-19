---
decision: approved
decided_by: Maintainer
date: 2026-10-19
escalation_sha256: "6e37f889181c82b41aa0fbe2c863ec7070c5783650e8b49e91e20777fb43b1dd"
---

# ESC-5.7-1: approved, option 1 (freeze the Oracle's clock)

The Maintainer approved this in the Maintainer's session on 2026-10-19.

`tools/oracle/evaluate.php` sets `Carbon::setTestNow` and `CarbonImmutable::setTestNow` to one fixed instant for every request. The instant is recorded once in `conformance/oracle/`, and a request's own `input.now` still overrides it. The 4 `DatabaseQueryBuilderTest::testWhereBetweens` fixtures are regenerated through the Oracle workflow. The Story that ports that test freezes Xaravel's clock to the same recorded instant. Epic 5 action item 13 (orchestrator) owns the evaluator change and the regeneration. The Escalation's `test_ids` stays XT-conformance-121 (retro finding S4 noted that the recheck's own test is XT-conformance-188): XT-121 verifies the nightly schedule, in which the recheck runs, so the ruling accepts it and that part of Epic 5 action item 7 is settled. `stories/5.7.md` now also lists XT-conformance-188 for AC 5.

Rationale: option 2 would drop 4 Differential checks, which weakens the grader, and option 3 keeps the nightly recheck red forever, hiding any other stale fixture behind it. Freezing the clock keeps every fixture and makes the recheck meaningful.
