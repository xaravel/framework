---
decision: approved
decided_by: Maintainer
date: 2026-10-19
escalation_sha256: "5b229bbdc7382064cd13cb4e7794070710a1c0655f6a1296c1148d4b4d70f60a"
---

# ESC-5.7-1: approved, option 1 (freeze the Oracle's clock)

The Maintainer approved this in the Maintainer's session on 2026-10-19.

`tools/oracle/evaluate.php` sets `Carbon::setTestNow` and `CarbonImmutable::setTestNow` to one fixed instant for every request. The instant is recorded once in `conformance/oracle/`, and a request's own `input.now` still overrides it. The 4 `DatabaseQueryBuilderTest::testWhereBetweens` fixtures are regenerated through the Oracle workflow. The Story that ports that test freezes Xaravel's clock to the same recorded instant. Epic 5 action item 13 (orchestrator) owns the evaluator change and the regeneration. Before this ruling, the Escalation's `test_ids` was corrected from XT-conformance-121 to XT-conformance-188, the recheck's own test (retro finding S4), and `stories/5.7.md` now lists XT-conformance-188 for AC 5.

Rationale: option 2 would drop 4 Differential checks, which weakens the grader, and option 3 keeps the nightly recheck red forever, hiding any other stale fixture behind it. Freezing the clock keeps every fixture and makes the recheck meaningful.
