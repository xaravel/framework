---
decision: rejected
decided_by: Maintainer
date: 2026-10-20
escalation_sha256: "a4b24692335301f00596a257c872bbffd1568e22cba61cf30829fcd87da9bbef"
---

# ESC-8.5-1: rejected; the Fidelity Review runs in the loop, not in GitHub Actions

The Maintainer does not create the `xaravel-fidelity-*` Apps, the `fidelity` environment or a model API key. No review job calls a model from GitHub Actions. The Fidelity Review moves into the Story's own review step.

## The ruling

1. **Two reviewer agents in the review step.** After a Story's implementation passes verification, two reviewer agents apply `conformance/review/fidelity.md` to the Story's diff. Each runs in a fresh context that holds only the diff, the checklist and the inputs the checklist names, and neither is the implementing agent. This sits alongside `bmad-build-auto`'s existing adversarial review layers, which keep reviewing the code against the spec.
2. **The reviewer's model.** At least one reviewer runs on the other agent CLI from the one running the loop, when that CLI is available:
   - when the loop runs `claude -p`, that reviewer runs on Codex (`codex exec`), or on `claude -p` if Codex is unavailable;
   - when the loop runs Codex, that reviewer runs on `claude -p`, or on Codex if Claude is unavailable.

   "Unavailable" means the CLI is not installed, not signed in, or refuses because of a usage limit. The verdict records which CLI and model reviewed it, and why it fell back.
3. **Verdicts stored with the Story.** Each verdict (`pass` or `reject`, with its findings) is recorded in the Story's spec, bound to the tree it reviewed. A `reject` returns the Story to its implementer within the same build, as review findings do today. `story:check`'s `approvals` clause passes when two `pass` verdicts are recorded for the Story's head tree. It no longer counts GitHub PR reviews.
4. **Retired.** `.github/workflows/fidelity.yml`, the App-token steps and the Messages API call in `tools/fidelity-review/` are retired. The checklist `conformance/review/fidelity.md` stays as it is.
5. **The work.** Epic 8 action item 1 (owner: orchestrator) rebuilds this as Phase 0 Infrastructure work. That covers `tools/fidelity-review/`, `tools/story-check/`, `bmad-build-auto`'s review step, `fidelity.yml` and Story 8.5's Xaravel Tests. This ruling approves changing those tests and Protected Paths to the new design, and Story 8.5's acceptance criteria in `epics.md` now describe it. Story 8.7's pilot is the first supervised run.

## Rationale

`bmad-build-auto` already runs four fresh-context adversarial reviewers on every change. What the Fidelity Review adds is the Upstream-fidelity checklist and a second model's view: a reviewer on another model family does not share the implementer's systematic blind spots, which fresh-context subagents of the same model do. Running it in the loop keeps it with the work it reviews, where a rejection can go straight back to the implementer. The earlier design's distinct GitHub identities could not be verified anyway while the loop opens PRs as the Maintainer.
