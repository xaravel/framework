---
test_ids:
  - XT-conformance-127
trigger: open-question
proposed: >-
  (1) On a PR, "the last CI run was a full run" means the PR head's latest
  `ratchet` job ran the Story's `test_ids` in full: on every Variant and not in
  fast mode, as the spine's per-PR row asks ("a full run of the Story's
  test_ids on every Variant", ARCHITECTURE-SPINE § CI). It does not require an
  unfiltered run of the whole suite; the merge-queue Ratchet stays the
  unfiltered gate. `story:check` then reads the SUMMARY of the job's `ratchet
  story` step, not whichever SUMMARY the log printed last. (2) The clause reads
  the Ratchet's verdict, not SUMMARY's `differ=0`: it passes when that job
  concluded `success` and its `RATCHET` lines report `failures=0` and
  `passes=0` for the Story's own lines. Unexpected passes the Ratchet only
  warns about (rows owned by no Story, or by another open Story) do not fail
  it, so a Story with empty `test_ids`, such as 10.1, is not failed over a
  difference it may not fix. Story 9.11 or the next Conformance Infrastructure
  Story takes the change; the job-conclusion check alone (retro item 3) is a
  plain fix and does not wait on this ruling.
evidence: >-
  `isFullRun` checks only that SUMMARY lacks ` mode=fast`
  (conformance/harness/harness.ts:219-221). The PR `ratchet` job prints
  SUMMARY twice, both from filtered runs (`ratchet run --scope`, then `ratchet
  story`, .github/workflows/ratchet.yml:128-137), so a filtered run satisfies
  the clause, and the only unfiltered run, in the merge queue, is on another
  SHA (Epic 5 retro H1). `fullRunClause` also requires `differ=0`
  (tools/story-check/story-check.ts:330-341), while the Ratchet counts warned
  unexpected passes as differences that do not fail it
  (tools/ratchet/ratchet.ts:225-245), so the clause can fail a Story the
  Ratchet passes (Epic 5 retro C2). epics.md Story 5.9 says only "the last CI
  run was a full run", and docs/ops/done-check.md:61 documents the current
  reading.
---

# ESC-5.9-2: what the done check's `full-run` clause means on a PR

Story 5.9's done check (`bun run story:check <story-id>`, [docs/ops/done-check.md](../../docs/ops/done-check.md)) has a clause, "the last CI run was a full run", that the Epic 5 retrospective found does not test what its name says ([epic-5-retro-2026-10-19.md](../../_bmad-output/implementation-artifacts/epic-5-retro-2026-10-19.md), finding H1 / C2 / C3, action item 2). Two questions are for the Maintainer.

1. **Which run counts as full.** The PR `ratchet` job grades only the PR's reverse-dependency closure, then the Story's own `test_ids`. Neither is an unfiltered run, and the clause accepts either because it checks only for ` mode=fast`. Proposed: on a PR, full means the Story's `test_ids` on every Variant, not fast, which is what the spine's per-PR CI row asks for. The merge queue's unfiltered Ratchet stays the gate for the whole suite. The clause reads the `ratchet story` step's SUMMARY.
2. **Which verdict counts.** The clause requires `differ=0`, but the Ratchet treats some differences as warnings: unexpected passes on lines owned by no Story, or by another open Story. A Story may not edit those lines, so it can never clear them. Proposed: the clause passes on the Ratchet's own verdict (job `success`, `failures=0`, and no unwarned unexpected pass) instead of SUMMARY's `differ=0`.

The third part of the finding, that the clause ignores the job's conclusion (C3), does not need a ruling and is tracked as retro action item 3.
