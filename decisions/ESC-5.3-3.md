---
decision: approved
decided_by: Maintainer
date: 2026-10-19
escalation_sha256: "41253b20d185a46096fb140c659235246e1612562ebbf3f1d9c03e20859531d5"
---

# ESC-5.3-3: approved, option 1

The Maintainer approved this in the Maintainer's session on 2026-10-19.

Story 9.11 (component `assert`) gains the criterion: an assertion that fails after its test's counts have ended (a timer or un-awaited promise the body left behind) does not throw into whichever test is running then. It reports itself to the `xaravel.harness.late` hook, as Story 5.3's late assertions do, and the harness fails the test it belongs to. `epics.md` Story 9.11 now carries it. Until 9.11 lands, the harness still fails the late test, and a spurious `FAIL` on the test running at the time is a known gap, not a conformance result.

Rationale: the late test already fails through the late hook, so the fix weakens no check; it only stops an unrelated test from failing. The change touches every assertion's failure path in `packages/assert`, which is grader follow-up work and belongs with Story 9.11's other items.
