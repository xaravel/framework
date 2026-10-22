---
decision: approved
decided_by: Maintainer
date: 2026-10-22
escalation_sha256: "730d66e0314c8d05a94a85bd6f99edab2d8c759ed95651c26ffb88c135268227"
---

# ESC-9.10-4: approved, option 1 (the review's patches cover only the Story's own change)

ESC-9.10-3 scoped evidence (e) to the Story's own tests. This ruling extends the same scope to the diff itself, and to every evidence item drawn from it. It is option 1 of the Escalation. Options 2 (raise `PROMPT_CAP`) and 3 (move the base past #306) are not taken.

## The rule

In `tools/fidelity-review/fidelity-review.ts`:
- **What counts as the Story's change** (`fileInStoryScope`): the Story's manifest `stories/<id>.md`; a file `allowedPath` accepts, which is the ownership rule; or a TypeScript file declaring an Xaravel Test id the manifest assigns, which is how an Infrastructure Story's tests under `conformance/tests/` count.
- **Only those files** give the prompt its patches, changed Oracle requests and fixtures, and evidence (b), (c), (d), (e), (f), (g) and (h).
- **Every other changed file in the base range** comes from a PR that merged while the Story was open and was reviewed on its own. It is named in one line under `## Diff` as left out, and the reason is given.
- **The review stops** when no changed file is the Story's.
- **Unchanged:** the reviewed tree and the verdict's binding to it, every checklist item's Check, the verdict rule and schema, the standing-reject rule and `PROMPT_CAP`.

`conformance/review/fidelity.md`'s "Story scope" evidence note and `docs/ops/fidelity-review.md` say so.

**Measured on Story 9.10** (base `c870bc2`, tree after #307):
- **Before:** the prompt was 619,174 characters, over the cap, and the review stopped.
- **After:** the diff holds 72 files, and 64 are the Story's. The other 8 are left out: the review tool, its test, the checklist, its ops doc, and the decision records of #303, #304 and #306.
- The prompt is 511,325 characters, and 584,173 with evidence (h). Both are under the cap.
- The left-out decision records still reach the reviewers through (f) and (h) wherever the Story's own files cite them.

## Rationale

- **The review judges the Story's change.** The left-out files were written and reviewed in their own PRs. Showing them again in every blocked Story's review only spends the prompt.
- **It stops the range from growing.** ESC-9.10-3 scoped (e); the patches were the rest of the same load. A Story blocked through several ruling PRs now reviews the same change it would have reviewed without them.
- **Nothing is hidden.** Every left-out file is named, so a reviewer knows the base range holds it.

Story 9.10's code is unchanged. It resumes at the review step and re-runs the Fidelity Review with `--base c870bc261d2bcea7b12296896c8650f52e124573`. This ruling clears ESC-9.10-4 for XT-runtime-35, 36 and 37.
