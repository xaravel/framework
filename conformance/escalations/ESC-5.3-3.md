---
test_ids:
  - XT-conformance-185
trigger: contract
proposed: >-
  Add to Story 9.11 (grader follow-ups to the runtime value model) an AC that an
  assertion which fails after its test's counts have ended (a timer or
  un-awaited promise the body left behind) does not throw into whichever test
  is running then: it reports itself to the `xaravel.harness.late` hook as Story
  5.3's late assertions do, and the harness fails the test it belongs to.
evidence: >-
  Story 5.3's AC 6 says "a late assertion fails its test instead of going
  uncounted". Story 5.3 counts a late assertion against its own test through
  the late hook (packages/assert AssertionCounter). A late assertion that also
  fails still throws, as every Story 4.2-4.6 assertion does, so bun fails the
  test that is running when the timer fires (the edge-case review of Story 5.3
  confirmed this in bun's junit output). The fix touches every assertion's
  failure path in packages/assert, which goes beyond 5.3's late-hook protocol,
  and no Story's AC covers it.
---

# ESC-5.3-3: a failing late assertion fails the wrong test

Story 5.3 records a late assertion against the test it belongs to, so the harness reports that test as `late`. A late assertion that *fails* still throws, and bun puts that failure on whichever test is running at the time.

The options:

1. **Add an AC to Story 9.11 (proposed).** Story 9.11 already collects grader follow-ups in `packages/assert`. When the counts have ended, the assertion's failure is reported to the late hook instead of being thrown.
2. **Leave it.** The harness still fails the right test as `late`, but an innocent test also fails, and the report shows a spurious `FAIL`.

Option 1 weakens no check: the late test still fails, and an unrelated test stops failing. The Story spec is `_bmad-output/implementation-artifacts/spec-5-3-harness-runner-and-greppable-report.md`.
