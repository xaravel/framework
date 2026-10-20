---
test_ids:
  - XT-conformance-168
  - XT-conformance-169
trigger: open-question
proposed: >-
  The Maintainer rules on whether Story 8.8 may be accepted without a final
  pair of pass verdicts on its head tree. Recommended: accept it. Reviewer 2
  (claude) passed every run. Reviewer 1 (codex) passed once, on tree
  a3cfaa918e4cbacab7348ec34b491df8b8b3a7fc, and the code under review has
  not changed since apart from one added test assertion. Its later rejects
  either ask for evidence the fidelity-review prompt does not carry (whole
  bodies and consequences of pre-existing Xaravel Tests whose fixture
  setup or workflow-step assertions the diff touches) or, once, name a real
  gap that is now patched (event filters on ci.yml). To accept, re-run the
  review on the head and record the result, or rule that the iteration-3
  pair stands. Separately, the prompt could include the full body and
  consequence of every Xaravel Test whose lines a diff changes. That is a
  change to the Protected fidelity-review tool, for an Infrastructure Story
  or a retrospective item.
evidence: >-
  bmad-build-auto's review loop allows 5 Finalize re-check iterations.
  Story 8.8's Fidelity Review ran 6 times (spec
  _bmad-output/implementation-artifacts/spec-8-8-phase-1-gate.md,
  `## Fidelity Review` and `## Review Triage Log`). Pass 1: both reviewers
  rejected on real XT-conformance-169 gaps, which were patched. Iterations
  1 and 2: codex rejected only with evidence requests for XT-conformance-23
  and XT-conformance-245, and the diff was reshaped so it no longer edits
  those bodies. Iteration 3: both passed. Iteration 4 (the tree changed
  only by the `stories/8.8.md` status line) and iteration 5: codex asked
  again for the bodies of XT-conformance-24 and the tests that use the
  shared `baseRoot` fixture. Iteration 5 also named the missing
  `paths`/`paths-ignore` guard, which is now asserted in
  XT-conformance-169. A sixth re-check would exceed the loop limit, so the
  build halted blocked for non-convergence. All verification passes:
  `harness --xaravel` 286/286, typecheck, lint, workflows:check,
  ownership:check, porting:check, and every `story:check 8.8` clause
  except `approvals` (stale) and `full-run` (needs GH_TOKEN locally).
---

# ESC-8.8-1: Story 8.8's Fidelity Review did not converge on evidence requests

Story 8.8 adds the Phase 1 gate to the required `ownership` check. The implementation, its tests and every local check are complete. The Story stops only because the in-loop Fidelity Review's codex reviewer keeps asking for the full bodies and consequences of other Stories' Xaravel Tests that the diff touches, which `tools/fidelity-review` does not put in its prompt. The Maintainer decides whether the Story is accepted on the verdicts recorded so far, or after a re-run.
